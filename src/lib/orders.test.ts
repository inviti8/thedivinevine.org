import { describe, expect, it } from 'vitest';
import { createTestDb } from '~/test/d1';
import {
  createOrder,
  getOrderBySession,
  markOrderExpired,
  markOrderPaid,
  newOrderId,
  priceCart,
  setOrderSession,
  shippingRates,
  type CatalogProduct,
} from './orders';
import type { ShopConfig } from './site-config';

const catalog = new Map<string, CatalogProduct>([
  ['tea', { slug: 'tea', name: 'Evening Calm Tea', priceUsd: 14, inStock: true, image: '/t.jpg' }],
  ['salve', { slug: 'salve', name: 'Calendula Salve', priceUsd: 18.5, inStock: true, image: '/s.jpg' }],
  ['gone', { slug: 'gone', name: 'Old Tincture', priceUsd: 20, inStock: false, image: '/g.jpg' }],
]);

const shop: ShopConfig = {
  allowedCountries: ['US'],
  maxQuantityPerItem: 10,
  freeShippingThresholdUsd: 50,
  shippingOptions: [
    { id: 'priority', name: 'Priority', amountUsd: 12.95, minDays: 1, maxDays: 3, freeOverThreshold: false },
    { id: 'standard', name: 'Standard', amountUsd: 6.95, minDays: 3, maxDays: 7, freeOverThreshold: true },
  ],
};

describe('priceCart', () => {
  it('prices from the catalog, ignoring anything else the client sends', () => {
    const result = priceCart(
      { items: [{ slug: 'tea', quantity: 2, priceUsd: 0.01 }, { slug: 'salve', quantity: 1 }] },
      catalog,
      10
    );
    expect(result).toEqual({
      ok: true,
      subtotalCents: 2 * 1400 + 1850,
      lines: [
        { slug: 'tea', name: 'Evening Calm Tea', unitAmountCents: 1400, quantity: 2, image: '/t.jpg' },
        { slug: 'salve', name: 'Calendula Salve', unitAmountCents: 1850, quantity: 1, image: '/s.jpg' },
      ],
    });
  });

  it('merges repeated slugs and caps quantity', () => {
    const result = priceCart({ items: [{ slug: 'tea', quantity: 6 }, { slug: 'tea', quantity: 7 }] }, catalog, 10);
    expect(result.ok && result.lines).toEqual([expect.objectContaining({ slug: 'tea', quantity: 10 })]);
  });

  it('rejects unknown and out-of-stock products', () => {
    expect(priceCart({ items: [{ slug: 'nope', quantity: 1 }] }, catalog, 10)).toMatchObject({ ok: false });
    expect(priceCart({ items: [{ slug: 'gone', quantity: 1 }] }, catalog, 10)).toEqual({
      ok: false,
      error: 'Old Tincture is currently unavailable. Please remove it to continue.',
    });
  });

  it('rejects malformed carts', () => {
    for (const body of [null, {}, { items: [] }, { items: [{ slug: 'tea', quantity: 0 }] }, { items: [{ slug: 'tea', quantity: 1.5 }] }]) {
      expect(priceCart(body, catalog, 10).ok).toBe(false);
    }
  });
});

describe('shippingRates', () => {
  it('charges standard below the threshold, cheapest first', () => {
    expect(shippingRates(4999, shop).map((r) => [r.id, r.amountCents])).toEqual([
      ['standard', 695],
      ['priority', 1295],
    ]);
  });

  it('makes eligible options free at the threshold', () => {
    const rates = shippingRates(5000, shop);
    expect(rates[0]).toMatchObject({ id: 'standard', amountCents: 0, name: 'Standard (free)' });
    expect(rates[1]).toMatchObject({ id: 'priority', amountCents: 1295 });
  });
});

describe('order storage', () => {
  const lines = [{ slug: 'tea', name: 'Evening Calm Tea', unitAmountCents: 1400, quantity: 1, image: '/t.jpg' }];
  const payment = {
    stripeSessionId: 'cs_test_1',
    email: 'buyer@example.com',
    shippingName: 'Ada Buyer',
    shippingAddress: { line1: '1 Vine St', line2: null, city: 'Ojai', state: 'CA', postal_code: '93023', country: 'US' },
    shippingCents: 695,
    totalCents: 2095,
  };

  it('moves awaiting_payment → paid exactly once', async () => {
    const db = createTestDb();
    const id = newOrderId();
    await createOrder(db, id, lines, 1400);
    await setOrderSession(db, id, 'cs_test_1');

    const paid = await markOrderPaid(db, id, payment);
    expect(paid).toMatchObject({ id, status: 'paid', email: 'buyer@example.com', totalCents: 2095, lines });
    expect(paid?.shippingAddress?.city).toBe('Ojai');
    expect(paid?.paidAt).toBeTruthy();

    expect(await markOrderPaid(db, id, payment)).toBeNull();
    expect(await markOrderExpired(db, id)).toBe(false);
    expect((await getOrderBySession(db, 'cs_test_1'))?.status).toBe('paid');
  });

  it('expires an unpaid order, which can then never be paid', async () => {
    const db = createTestDb();
    const id = newOrderId();
    await createOrder(db, id, lines, 1400);
    expect(await markOrderExpired(db, id)).toBe(true);
    expect(await markOrderPaid(db, id, payment)).toBeNull();
  });

  it('returns null for an unknown session', async () => {
    expect(await getOrderBySession(createTestDb(), 'cs_test_missing')).toBeNull();
  });
});
