// Liveness check: the Worker runs, settings parse and D1 answers.
import type { APIRoute } from 'astro';
import { getEnv } from '~/lib/env';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const env = getEnv(locals);
  const row = await env.db.prepare('SELECT count(*) AS n FROM d1_migrations').first<{ n: number }>();
  return Response.json(
    { ok: true, migrations: row?.n ?? 0 },
    { headers: { 'Cache-Control': 'no-store' } }
  );
};
