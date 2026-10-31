// GET ?session_id=cs_… → order summary for /thank-you. If the webhook hasn't
// landed yet, asks Stripe directly and completes the order (idempotent), so the
// buyer never sees a stale "awaiting payment".
import type { APIRoute } from 'astro';
import { getEnv } from '~/lib/env';
import { getOrderBySession, type Order } from '~/lib/orders';
import { completeOrder, getStripe } from '~/lib/stripe';

export const prerender = false;

type PublicStatus = 'paid' | 'processing' | 'unpaid';

const summary = (order: Order, status: PublicStatus) => ({
  status,
  reference: order.id.slice(-8).toUpperCase(),
  items: order.lines.map((l) => ({ name: l.name, quantity: l.quantity, amountCents: l.unitAmountCents * l.quantity })),
  subtotalCents: order.subtotalCents,
  shippingCents: order.shippingCents,
  totalCents: order.totalCents,
  email: order.email,
});

export const GET: APIRoute = async ({ url, locals }) => {
  const env = getEnv(locals);
  const sessionId = url.searchParams.get('session_id') ?? '';
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return Response.json({ error: 'Invalid session' }, { status: 400 });
  }

  let order = await getOrderBySession(env.db, sessionId);
  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });

  const headers = { 'Cache-Control': 'no-store' };
  if (order.status === 'awaiting_payment' && env.stripeSecretKey) {
    const session = await getStripe(env).checkout.sessions.retrieve(sessionId);
    order = (await completeOrder(env, session)) ?? (await getOrderBySession(env.db, sessionId))!;
    if (order.status === 'awaiting_payment') {
      const status: PublicStatus = session.status === 'complete' ? 'processing' : 'unpaid';
      return Response.json(summary(order, status), { headers });
    }
  }

  const unpaid = order.status === 'expired' || order.status === 'awaiting_payment';
  return Response.json(summary(order, unpaid ? 'unpaid' : 'paid'), { headers });
};
