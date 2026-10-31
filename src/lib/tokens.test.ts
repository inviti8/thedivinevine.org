import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './tokens';

const SECRET = 'test-secret-that-is-at-least-32-characters';
const NOW = Date.UTC(2026, 9, 30, 12);

describe('signed tokens', () => {
  it('round-trips data for the same purpose', async () => {
    const token = await signToken(SECRET, 'booking-cancel', { id: 'bk_1' }, { ttlSeconds: 3600, now: NOW });
    expect(await verifyToken(SECRET, 'booking-cancel', token, { now: NOW })).toEqual({
      ok: true,
      data: { id: 'bk_1' },
    });
  });

  it('is URL-safe', async () => {
    const token = await signToken(SECRET, 'x', { s: '??>>~~ünï' });
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('rejects a token minted for another purpose', async () => {
    const token = await signToken(SECRET, 'newsletter-confirm', { email: 'a@b.co' });
    expect(await verifyToken(SECRET, 'newsletter-unsubscribe', token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a different secret', async () => {
    const token = await signToken(SECRET, 'x', 1);
    expect((await verifyToken(`${SECRET}-other`, 'x', token)).ok).toBe(false);
  });

  it('rejects tampered payloads and signatures', async () => {
    const token = await signToken(SECRET, 'x', { id: 'bk_1' });
    const [body, sig] = token.split('.');
    const forgedBody = btoa(JSON.stringify({ p: 'x', d: { id: 'bk_2' } })).replace(/=+$/, '');
    expect((await verifyToken(SECRET, 'x', `${forgedBody}.${sig}`)).ok).toBe(false);
    expect((await verifyToken(SECRET, 'x', `${body}.${sig.slice(0, -2)}AA`)).ok).toBe(false);
  });

  it('rejects malformed input', async () => {
    for (const bad of ['', 'abc', 'a.b.c', '***.***', '.']) {
      expect(await verifyToken(SECRET, 'x', bad)).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('expires after the TTL', async () => {
    const token = await signToken(SECRET, 'x', 1, { ttlSeconds: 60, now: NOW });
    expect((await verifyToken(SECRET, 'x', token, { now: NOW + 59_000 })).ok).toBe(true);
    expect(await verifyToken(SECRET, 'x', token, { now: NOW + 60_000 })).toEqual({ ok: false, reason: 'expired' });
  });

  it('never expires without a TTL', async () => {
    const token = await signToken(SECRET, 'x', 1, { now: NOW });
    expect((await verifyToken(SECRET, 'x', token, { now: NOW + 10 * 365 * 86_400_000 })).ok).toBe(true);
  });
});
