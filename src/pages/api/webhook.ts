// Stripe webhook: the source of truth for payments (DESIGN.md §6).
// Events to enable on the endpoint: checkout.session.completed,
// checkout.session.async_payment_succeeded, checkout.session.async_payment_failed,
// checkout.session.expired.
import type { APIRoute } from 'astro';
import type Stripe from 'stripe';
import { getEnv, type ServerEnv } from '~/lib/env';
import { markOrderExpired } from '~/lib/orders';
import { completeOrder, getStripe } from '~/lib/stripe';

export const prerender = false;

async function handleSession(env: ServerEnv, type: string, session: Stripe.Checkout.Session) {
  const kind = session.metadata?.kind;
  if (kind !== 'order') {
    // 'booking' sessions arrive with milestone D.
    console.warn(`[webhook] ${type} for unhandled kind ${JSON.stringify(kind)} (${session.id})`);
    return;
  }

  switch (type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      // completeOrder ignores sessions that aren't paid yet (bank debits settle later).
      await completeOrder(env, session);
      break;
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      if (session.metadata?.order_id) await markOrderExpired(env.db, session.metadata.order_id);
      break;
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  if (!env.stripeSecretKey || !env.stripeWebhookSecret) {
    return new Response('Stripe is not configured', { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = await getStripe(env).webhooks.constructEventAsync(await request.text(), signature, env.stripeWebhookSecret);
  } catch (err) {
    console.warn('[webhook] signature verification failed:', err instanceof Error ? err.message : err);
    return new Response('Invalid signature', { status: 400 });
  }

  const seen = await env.db.prepare('SELECT 1 FROM stripe_processed_events WHERE event_id = ?').bind(event.id).first();
  if (seen) return Response.json({ received: true, duplicate: true });

  if (event.type.startsWith('checkout.session.')) {
    // Let errors escape: a 500 makes Stripe retry, and every step above is idempotent.
    await handleSession(env, event.type, event.data.object as Stripe.Checkout.Session);
  }

  // Recorded only after handling succeeds, so a failed attempt is retried rather than skipped.
  await env.db
    .prepare('INSERT OR IGNORE INTO stripe_processed_events (event_id, type) VALUES (?, ?)')
    .bind(event.id, event.type)
    .run();
  return Response.json({ received: true });
};
