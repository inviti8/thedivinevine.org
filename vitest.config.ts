// Unit tests for src/lib, plus API-route tests in src/test against an in-memory D1
// (src/test/d1.ts). No Astro dev server or Workers runtime needed.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
