// Shop orders (DESIGN.md §6). The MDX catalog is the only source of price:
// the client sends { slug, quantity } and everything else is looked up here.
import { z } from 'astro/zod';
import type { D1Database } from '@cloudflare/workers-types';
import type { ShopConfig } from './site-config';

export interface CatalogProduct {
  slug: string;
  name: string;
  priceUsd: number;
  inStock: boolean;
  image: string;
}

export interface OrderLine {
  slug: string;
  name: string;
  unitAmountCents: number;
  quantity: number;
  image: string;
}

export type PriceResult = { ok: true; lines: OrderLine[]; subtotalCents: number } | { ok: false; error: string };

const cartRequest = z.object({
  items: z
    .array(z.object({ slug: z.string().min(1).max(100), quantity: z.number().int().min(1) }))
    .min(1)
    .max(50),
});

export const toCents = (usd: number) => Math.round(usd * 100);

export function priceCart(body: unknown, catalog: Map<string, CatalogProduct>, maxQuantity: number): PriceResult {
  const parsed = cartRequest.safeParse(body);
  if (!parsed.success) return { ok: false, error: 'Your basket could not be read. Please refresh and try again.' };

  // Merge repeated slugs, then cap each line.
  const quantities = new Map<string, number>();
  for (const { slug, quantity } of parsed.data.items) {
    quantities.set(slug, (quantities.get(slug) ?? 0) + quantity);
  }

  const lines: OrderLine[] = [];
  for (const [slug, quantity] of quantities) {
    const product = catalog.get(slug);
    if (!product) {
      return { ok: false, error: 'An item in your basket is no longer sold. Please remove it and try again.' };
    }
    if (!product.inStock) return { ok: false, error: `${product.name} is currently unavailable. Please remove it to continue.` };
    lines.push({
      slug,
      name: product.name,
      unitAmountCents: toCents(product.priceUsd),
      quantity: Math.min(quantity, maxQuantity),
      image: product.image,
    });
  }

  return { ok: true, lines, subtotalCents: lines.reduce((sum, l) => sum + l.unitAmountCents * l.quantity, 0) };
}

export interface ShippingRate {
  id: string;
  name: string;
  amountCents: number;
  minDays: number;
  maxDays: number;
}

/** The shipping choices for a cart, cheapest first (Stripe preselects the first). */
export function shippingRates(subtotalCents: number, shop: ShopConfig): ShippingRate[] {
  const free = subtotalCents >= toCents(shop.freeShippingThresholdUsd);
  return shop.shippingOptions
    .map((o) => ({
      id: o.id,
      name: free && o.freeOverThreshold ? `${o.name} (free)` : o.name,
      amountCents: free && o.freeOverThreshold ? 0 : toCents(o.amountUsd),
      minDays: o.minDays,
      maxDays: o.maxDays,
    }))
    .sort((a, b) => a.amountCents - b.amountCents);
}

// ---- D1 ----

export type OrderStatus = 'awaiting_payment' | 'paid' | 'expired' | 'fulfilled' | 'refunded';

export interface ShippingAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface Order {
  id: string;
  status: OrderStatus;
  lines: OrderLine[];
  subtotalCents: number;
  shippingCents: number | null;
  totalCents: number | null;
  email: string | null;
  shippingName: string | null;
  shippingAddress: ShippingAddress | null;
  stripeSessionId: string | null;
  createdAt: string;
  paidAt: string | null;
}

interface OrderRow {
  id: string;
  status: OrderStatus;
  items_json: string;
  subtotal_cents: number;
  shipping_cents: number | null;
  total_cents: number | null;
  email: string | null;
  shipping_name: string | null;
  shipping_address_json: string | null;
  stripe_session_id: string | null;
  created_at: string;
  paid_at: string | null;
}

const fromRow = (r: OrderRow): Order => ({
  id: r.id,
  status: r.status,
  lines: JSON.parse(r.items_json),
  subtotalCents: r.subtotal_cents,
  shippingCents: r.shipping_cents,
  totalCents: r.total_cents,
  email: r.email,
  shippingName: r.shipping_name,
  shippingAddress: r.shipping_address_json ? JSON.parse(r.shipping_address_json) : null,
  stripeSessionId: r.stripe_session_id,
  createdAt: r.created_at,
  paidAt: r.paid_at,
});

export const newOrderId = () => `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

export async function createOrder(db: D1Database, id: string, lines: OrderLine[], subtotalCents: number) {
  await db
    .prepare(`INSERT INTO orders (id, status, items_json, subtotal_cents) VALUES (?, 'awaiting_payment', ?, ?)`)
    .bind(id, JSON.stringify(lines), subtotalCents)
    .run();
}

export async function setOrderSession(db: D1Database, id: string, stripeSessionId: string) {
  await db
    .prepare(`UPDATE orders SET stripe_session_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
    .bind(stripeSessionId, id)
    .run();
}

export async function getOrderBySession(db: D1Database, stripeSessionId: string): Promise<Order | null> {
  const row = await db.prepare(`SELECT * FROM orders WHERE stripe_session_id = ?`).bind(stripeSessionId).first<OrderRow>();
  return row ? fromRow(row) : null;
}

export interface PaymentDetails {
  stripeSessionId: string;
  email: string | null;
  shippingName: string | null;
  shippingAddress: ShippingAddress | null;
  shippingCents: number;
  totalCents: number;
}

/**
 * awaiting_payment → paid, atomically. Returns the order only for the call that
 * made the transition, so webhook retries and the /thank-you fallback can race
 * without sending emails twice.
 */
export async function markOrderPaid(db: D1Database, id: string, p: PaymentDetails): Promise<Order | null> {
  const row = await db
    .prepare(
      `UPDATE orders SET status = 'paid', stripe_session_id = ?, email = ?, shipping_name = ?, shipping_address_json = ?,
         shipping_cents = ?, total_cents = ?,
         paid_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND status = 'awaiting_payment'
       RETURNING *`
    )
    .bind(
      p.stripeSessionId,
      p.email,
      p.shippingName,
      p.shippingAddress ? JSON.stringify(p.shippingAddress) : null,
      p.shippingCents,
      p.totalCents,
      id
    )
    .first<OrderRow>();
  return row ? fromRow(row) : null;
}

/** Closes an unpaid order (session expired, async payment failed, or session never created). */
export async function markOrderExpired(db: D1Database, id: string): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE orders SET status = 'expired', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND status = 'awaiting_payment'`
    )
    .bind(id)
    .run();
  return res.meta.changes > 0;
}
