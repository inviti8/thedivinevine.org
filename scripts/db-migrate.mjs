// Applies pending D1 migrations to the local database (.wrangler/state).
// `wrangler d1 migrations apply` has no --yes flag; CI=true skips its prompt,
// and setting it here keeps `npm run dev` working on Windows and macOS alike.
import { spawnSync } from 'node:child_process';

const remote = process.argv.includes('--remote');
const result = spawnSync(
  'npx',
  ['wrangler', 'd1', 'migrations', 'apply', 'thedivinevine', remote ? '--remote' : '--local'],
  { stdio: 'inherit', shell: true, env: { ...process.env, CI: remote ? process.env.CI : 'true' } },
);
process.exit(result.status ?? 1);
