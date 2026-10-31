// End-to-end through POST /api/webhook with real Stripe signatures and the
// in-memory D1. Lives outside src/pages so Astro doesn't treat it as a route.
import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '~/pages/api/webhook';
import { createOrder, getOrderBySession, setOrderSession } from '~/lib/orders';
import { createTestDb } from './d1';

const WEBHOOK_SECRET = 'whsec_test_secret';
const stripe = new Stripe('sk_test_x');

function setup() {
  const DB = createTestDb();
  const locals = {
    runtime: {
      env: { DB, STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, OWNER_EMAIL: 'owner@example.com' },
    },
  };
  return { DB, locals };
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_abc',
    object: 'checkout.session',
    metadata: { kind: 'order', order_id: 'ord_1' },
    payment_status: 'paid',
    status: 'complete',
    livemode: false,
    payment_intent: 'pi_123',
    amount_total: 2095,
    total_details: { amount_shipping: 695, amount_discount: 0, amount_tax: 0 },
    customer_details: { email: 'buyer@example.com', name: 'Ada Buyer' },
    collected_information: {
      shipping_details: {
        name: 'Ada Buyer',
        address: { line1: '1 Vine St', line2: null, city: 'Ojai', state: 'CA', postal_code: '93023', country: 'US' },
      },
    },
    ...overrides,
  };
}

async function deliver(locals: object, type: string, object: object, id = 'evt_1', secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify({ id, object: 'event', type, data: { object } });
  const signature = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret });
  const request = new Request('http://localhost/api/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    body: payload,
  });
  return POST({ request, locals } as never) as Promise<Response>;
}

let log: ReturnType<typeof vi.spyOn>;
const emailsSent = () => log.mock.calls.filter(([line]) => String(line).startsWith('[email:debug]'));

beforeEach(() => {
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function orderAwaitingPayment(DB: ReturnType<typeof createTestDb>) {
  await createOrder(DB, 'ord_1', [{ slug: 'tea', name: 'Tea', unitAmountCents: 1400, quantity: 1, image: '/t.jpg' }], 1400);
  await setOrderSession(DB, 'ord_1', 'cs_test_abc');
}

describe('POST /api/webhook', () => {
  it('rejects a bad signature', async () => {
    const { locals } = setup();
    const res = await deliver(locals, 'checkout.session.completed', session(), 'evt_1', 'whsec_wrong');
    expect(res.status).toBe(400);
  });

  it('marks the order paid and emails buyer and owner once, even on redelivery', async () => {
    const { DB, locals } = setup();
    await orderAwaitingPayment(DB);

    expect((await deliver(locals, 'checkout.session.completed', session())).status).toBe(200);
    const order = await getOrderBySession(DB, 'cs_test_abc');
    expect(order).toMatchObject({ status: 'paid', email: 'buyer@example.com', shippingCents: 695, totalCents: 2095 });
    expect(emailsSent().map(([l]) => l)).toEqual([
      expect.stringContaining('to=buyer@example.com'),
      expect.stringContaining('to=owner@example.com'),
    ]);

    // Same event again (dedupe table), then a new event for the same session (atomic transition).
    expect(await (await deliver(locals, 'checkout.session.completed', session())).json()).toMatchObject({ duplicate: true });
    await deliver(locals, 'checkout.session.async_payment_succeeded', session(), 'evt_2');
    expect(emailsSent()).toHaveLength(2);
  });

  it('waits for async payments to settle', async () => {
    const { DB, locals } = setup();
    await orderAwaitingPayment(DB);

    await deliver(locals, 'checkout.session.completed', session({ payment_status: 'unpaid' }));
    expect((await getOrderBySession(DB, 'cs_test_abc'))?.status).toBe('awaiting_payment');

    await deliver(locals, 'checkout.session.async_payment_succeeded', session(), 'evt_2');
    expect((await getOrderBySession(DB, 'cs_test_abc'))?.status).toBe('paid');
  });

  it('expires the order when the session expires', async () => {
    const { DB, locals } = setup();
    await orderAwaitingPayment(DB);
    await deliver(locals, 'checkout.session.expired', session({ payment_status: 'unpaid', status: 'expired' }));
    expect((await getOrderBySession(DB, 'cs_test_abc'))?.status).toBe('expired');
    expect(emailsSent()).toHaveLength(0);
  });

  it('ignores sessions of other kinds', async () => {
    const { DB, locals } = setup();
    await orderAwaitingPayment(DB);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await deliver(locals, 'checkout.session.completed', session({ metadata: { kind: 'booking', booking_id: 'bk_1' } }));
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalled();
    expect((await getOrderBySession(DB, 'cs_test_abc'))?.status).toBe('awaiting_payment');
  });
});
