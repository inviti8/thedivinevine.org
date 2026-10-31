import { describe, expect, it } from 'vitest';
import { ConfigError, parseEnv, required, type RuntimeEnv } from './env';

const DB = {} as RuntimeEnv['DB'];

describe('parseEnv', () => {
  it('fills defaults when nothing is set', () => {
    const env = parseEnv({ DB }, { dev: true });
    expect(env).toMatchObject({
      siteUrl: 'http://localhost:4321',
      stripeSecretKey: null,
      mailtrapApiToken: null,
      emailFrom: 'hello@thedivinevine.org',
      ownerIcsUrls: [],
      debug: true,
    });
    expect(parseEnv({ DB }, { dev: false })).toMatchObject({ siteUrl: 'https://thedivinevine.org', debug: false });
  });

  it('treats blank values as unset', () => {
    expect(parseEnv({ DB, STRIPE_SECRET_KEY: '  ', OWNER_EMAIL: '' }, { dev: true })).toMatchObject({
      stripeSecretKey: null,
      ownerEmail: null,
    });
  });

  it('lets DEBUG override the dev default', () => {
    expect(parseEnv({ DB, DEBUG: 'false' }, { dev: true }).debug).toBe(false);
    expect(parseEnv({ DB, DEBUG: 'true' }, { dev: false }).debug).toBe(true);
  });

  it('refuses live Stripe keys in dev or debug', () => {
    expect(() => parseEnv({ DB, STRIPE_SECRET_KEY: 'sk_live_x' }, { dev: true })).toThrow(ConfigError);
    expect(() => parseEnv({ DB, STRIPE_SECRET_KEY: 'sk_live_x', DEBUG: 'true' }, { dev: false })).toThrow(ConfigError);
    expect(parseEnv({ DB, STRIPE_SECRET_KEY: 'sk_live_x' }, { dev: false }).stripeSecretKey).toBe('sk_live_x');
    expect(parseEnv({ DB, STRIPE_SECRET_KEY: 'sk_test_x' }, { dev: true }).stripeSecretKey).toBe('sk_test_x');
    expect(parseEnv({ DB, STRIPE_SECRET_KEY: 'rk_test_x' }, { dev: true }).stripeSecretKey).toBe('rk_test_x');
    expect(() => parseEnv({ DB, STRIPE_SECRET_KEY: 'rk_live_x' }, { dev: true })).toThrow(ConfigError);
  });

  it('requires a long signing secret', () => {
    expect(() => parseEnv({ DB, SIGNING_SECRET: 'short' }, { dev: true })).toThrow(/32 characters/);
  });

  it('requires the D1 binding', () => {
    expect(() => parseEnv({} as RuntimeEnv, { dev: true })).toThrow(/DB/);
  });

  it('splits ICS URLs and converts webcal://', () => {
    const env = parseEnv({ DB, OWNER_ICS_URL: 'webcal://p1.icloud.com/a, https://x.test/b.ics,' }, { dev: true });
    expect(env.ownerIcsUrls).toEqual(['https://p1.icloud.com/a', 'https://x.test/b.ics']);
  });

  it('strips a trailing slash from the site URL', () => {
    expect(parseEnv({ DB, PUBLIC_SITE_URL: 'https://example.test/' }, { dev: false }).siteUrl).toBe('https://example.test');
  });
});

describe('required', () => {
  it('throws on null and passes values through', () => {
    expect(() => required(null, 'X')).toThrow('X is not set');
    expect(required('v', 'X')).toBe('v');
  });
});
