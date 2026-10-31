// POST { items: [{ slug, quantity }] } → { url } of a Stripe Checkout page.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getEnv } from '~/lib/env';
import { createOrder, markOrderExpired, newOrderId, priceCart, setOrderSession, shippingRates, type CatalogProduct } from '~/lib/orders';
import { shop } from '~/lib/site-config';
import { createOrderCheckout } from '~/lib/stripe';

export const prerender = false;

const UNAVAILABLE = 'Checkout is temporarily unavailable. Please try again shortly.';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  if (!env.stripeSecretKey) return Response.json({ error: UNAVAILABLE }, { status: 503 });

  const body = await request.json().catch(() => null);
  const catalog = new Map<string, CatalogProduct>(
    (await getCollection('products')).map((p) => [
      p.id,
      { slug: p.id, name: p.data.name, priceUsd: p.data.priceUsd, inStock: p.data.inStock, image: p.data.primaryImage },
    ])
  );
  const priced = priceCart(body, catalog, shop.maxQuantityPerItem);
  if (!priced.ok) return Response.json({ error: priced.error }, { status: 400 });

  // Pre-create the order so the webhook has something to mark paid (heavymeta's commissions pattern).
  const orderId = newOrderId();
  await createOrder(env.db, orderId, priced.lines, priced.subtotalCents);

  try {
    const session = await createOrderCheckout(
      env,
      { id: orderId, lines: priced.lines },
      shippingRates(priced.subtotalCents, shop),
      shop.allowedCountries
    );
    await setOrderSession(env.db, orderId, session.id);
    return Response.json({ url: session.url });
  } catch (err) {
    console.error(`[order ${orderId}] creating Checkout Session failed:`, err);
    await markOrderExpired(env.db, orderId);
    return Response.json({ error: UNAVAILABLE }, { status: 502 });
  }
};
