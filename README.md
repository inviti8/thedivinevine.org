# thedivinevine.org

Herbal remedy storefront (teas, tinctures, salves) with consultation booking.
Astro 5 + Svelte 5 + Tailwind v4 on Cloudflare Pages.

- **New here / running it locally?** Start with [`docs/RUNBOOK.md`](docs/RUNBOOK.md).
- Design and decisions: [`docs/DESIGN.md`](docs/DESIGN.md).
- Build plan and progress: [`docs/PLAN.md`](docs/PLAN.md).

## Run

```bash
npm install
cp .dev.vars.example .dev.vars   # optional: local secrets (Stripe test key, Mailtrap, …)
npm run dev        # applies local DB migrations, then http://localhost:4321
npm test           # unit tests (vitest)
npm run check      # type-check (astro check)
npm run build      # static build to dist/
npm run preview    # build + wrangler pages dev (Workers runtime)
```

## Where things live

| What | Where |
|---|---|
| Products (one file each) | `src/content/products/*.mdx` |
| Categories | `src/content/categories/*.mdx` (teas, tinctures, salves) |
| Journal posts | `src/content/journal/*.mdx` |
| Booking hours, consultation types, meeting link | `src/data/booking.json` |
| Shipping rates, free-shipping threshold | `src/data/shop.json` |
| Colors and fonts | `src/styles/global.css` (`@theme`) |
| Product photos | `public/images/products/` |
| Database schema (D1) | `migrations/*.sql` (add a new numbered file; never edit an applied one) |
| Server helpers (settings, signed links, email) | `src/lib/env.ts`, `tokens.ts`, `email.ts` |

The JSON config files are validated at build time (`src/lib/site-config.ts`), so a typo fails the build.

### Adding a product

Copy an existing file in `src/content/products/`. The file name becomes the URL (`/shop/<file-name>`).
`category` must match a file name in `src/content/categories/`. `cautions` is required.

## Status

See [`docs/PLAN.md`](docs/PLAN.md).
