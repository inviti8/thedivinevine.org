// Stripe Checkout for the shop (and, later, paid bookings). Ported from
// pernicious-remedies and hardened with heavymeta's patterns (DESIGN.md §6).
import Stripe from 'stripe';
import type { ServerEnv } from './env';
import { required } from './env';
import { sendOrderEmails } from './order-emails';
import { markOrderPaid, type Order, type OrderLine, type ShippingRate } from './orders';

let client: { key: string; stripe: Stripe } | null = null;

export function getStripe(env: ServerEnv): Stripe {
  const key = required(env.stripeSecretKey, 'STRIPE_SECRET_KEY');
  if (client?.key !== key) {
    client = { key, stripe: new Stripe(key, { httpClient: Stripe.createFetchHttpClient() }) };
  }
  return client.stripe;
}

/** Stripe can only show product images it can fetch, so skip them for localhost and SVGs. */
function productImages(siteUrl: string, image: string): string[] | undefined {
  if (!siteUrl.startsWith('https://') || image.endsWith('.svg')) return undefined;
  return [new URL(image, siteUrl).href];
}

export function createOrderCheckout(
  env: ServerEnv,
  order: { id: string; lines: OrderLine[] },
  shipping: ShippingRate[],
  allowedCountries: string[]
): Promise<Stripe.Checkout.Session> {
  const metadata = { kind: 'order', order_id: order.id };
  return getStripe(env).checkout.sessions.create(
    {
      mode: 'payment',
      // Labels these sessions in the Stripe Dashboard (bookings will use their own).
      integration_identifier: 'divinevine-shop-qvmtrbkx',
      client_reference_id: order.id,
      metadata,
      payment_intent_data: { metadata },
      line_items: order.lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency: 'usd',
          unit_amount: l.unitAmountCents,
          product_data: { name: l.name, images: productImages(env.siteUrl, l.image), metadata: { slug: l.slug } },
        },
      })),
      shipping_address_collection: {
        allowed_countries: allowedCountries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
      },
      shipping_options: shipping.map((s) => ({
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: s.name,
          fixed_amount: { amount: s.amountCents, currency: 'usd' },
          delivery_estimate: {
            minimum: { unit: 'business_day', value: s.minDays },
            maximum: { unit: 'business_day', value: s.maxDays },
          },
        },
      })),
      billing_address_collection: 'required',
      allow_promotion_codes: true,
      success_url: `${env.siteUrl}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.siteUrl}/shop`,
    },
    // A retried request must not create a second session for the same order.
    { idempotencyKey: `checkout-${order.id}` }
  );
}

/** True once the money is in (cards: at completion; bank debits: on async_payment_succeeded). */
export const isSessionPaid = (s: Stripe.Checkout.Session) =>
  s.payment_status === 'paid' || s.payment_status === 'no_payment_required';

/**
 * Records a paid order session and emails the buyer and owner. Safe to call more
 * than once (webhook retries, the /thank-you fallback): only the first call
 * changes the order and sends email. Returns the order if this call completed it.
 */
export async function completeOrder(env: ServerEnv, session: Stripe.Checkout.Session): Promise<Order | null> {
  const orderId = session.metadata?.order_id;
  if (!orderId || !isSessionPaid(session)) return null;

  const ship = session.collected_information?.shipping_details;
  const order = await markOrderPaid(env.db, orderId, {
    stripeSessionId: session.id,
    email: session.customer_details?.email ?? null,
    shippingName: ship?.name ?? session.customer_details?.name ?? null,
    shippingAddress: ship?.address ?? null,
    shippingCents: session.total_details?.amount_shipping ?? 0,
    totalCents: session.amount_total ?? 0,
  });
  if (!order) return null;

  // The order is recorded; a mail failure must not make Stripe retry (the retry
  // would find the order already paid and send nothing anyway).
  try {
    await sendOrderEmails(env, order, {
      discountCents: session.total_details?.amount_discount ?? 0,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
      livemode: session.livemode,
    });
  } catch (err) {
    console.error(`[order ${order.id}] paid, but sending emails failed:`, err);
  }
  return order;
}
