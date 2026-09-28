import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Static output by default; only src/pages/api/* opts into on-demand rendering
// (`export const prerender = false`). Do not set `output: 'server'` — Astro then
// ignores getStaticPaths on the [slug] pages.
export default defineConfig({
  site: 'https://thedivinevine.org',
  adapter: cloudflare({ imageService: 'compile' }),
  integrations: [mdx(), sitemap(), svelte()],
  vite: {
    plugins: [tailwindcss()],
  },
});
