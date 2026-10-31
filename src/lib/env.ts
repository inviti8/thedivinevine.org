// Server-side settings for src/pages/api/*. Values come from the Workers runtime
// (.dev.vars locally, Pages secrets in production), never from the client bundle.
// Optional keys are null when unset so a feature can answer "unavailable"
// instead of the whole site failing (e.g. no Stripe key yet → no checkout).
import type { D1Database } from '@cloudflare/workers-types';

export interface RuntimeEnv {
  DB: D1Database;
  PUBLIC_SITE_URL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  MAILTRAP_API_TOKEN?: string;
  EMAIL_FROM?: string;
  OWNER_EMAIL?: string;
  OWNER_ICS_URL?: string;
  SIGNING_SECRET?: string;
  DEBUG?: string;
}

export interface ServerEnv {
  db: D1Database;
  siteUrl: string;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  mailtrapApiToken: string | null;
  emailFrom: string;
  ownerEmail: string | null;
  ownerIcsUrls: string[];
  signingSecret: string | null;
  /** Log emails instead of sending. Defaults to on in `astro dev`, off in production. */
  debug: boolean;
}

export class ConfigError extends Error {
  name = 'ConfigError';
}

const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export function parseEnv(raw: RuntimeEnv, { dev }: { dev: boolean }): ServerEnv {
  if (!raw.DB) throw new ConfigError('D1 binding "DB" is missing (see wrangler.toml)');

  const debug = raw.DEBUG ? raw.DEBUG === 'true' : dev;
  const stripeSecretKey = blank(raw.STRIPE_SECRET_KEY);
  const signingSecret = blank(raw.SIGNING_SECRET);

  // heavymeta's guard: a dev or debug run must never touch live money.
  // Restricted keys (rk_…) are preferred over secret keys (sk_…).
  if ((dev || debug) && stripeSecretKey && !/^(rk|sk)_test_/.test(stripeSecretKey)) {
    throw new ConfigError('Dev/DEBUG requires a Stripe test key (rk_test_… or sk_test_…)');
  }
  if (signingSecret && signingSecret.length < 32) {
    throw new ConfigError('SIGNING_SECRET must be at least 32 characters');
  }

  return {
    db: raw.DB,
    siteUrl: (blank(raw.PUBLIC_SITE_URL) ?? (dev ? 'http://localhost:4321' : 'https://thedivinevine.org')).replace(/\/$/, ''),
    stripeSecretKey,
    stripeWebhookSecret: blank(raw.STRIPE_WEBHOOK_SECRET),
    mailtrapApiToken: blank(raw.MAILTRAP_API_TOKEN),
    emailFrom: blank(raw.EMAIL_FROM) ?? 'hello@thedivinevine.org',
    ownerEmail: blank(raw.OWNER_EMAIL),
    ownerIcsUrls: (raw.OWNER_ICS_URL ?? '')
      .split(',')
      .map((u) => u.trim().replace(/^webcal:\/\//, 'https://'))
      .filter(Boolean),
    signingSecret,
    debug,
  };
}

export function getEnv(locals: App.Locals): ServerEnv {
  return parseEnv(locals.runtime.env, { dev: import.meta.env.DEV });
}

/** Narrow an optional setting, failing loudly where a feature can't run without it. */
export function required<T>(value: T | null, name: string): T {
  if (value === null) throw new ConfigError(`${name} is not set`);
  return value;
}
