# thedivinevine.org

Herbal remedy storefront (teas, tinctures, salves) with consultation booking.
Astro 5 + Svelte 5 + Tailwind v4 on Cloudflare Pages. The design lives in [`docs/DESIGN.md`](docs/DESIGN.md).

## Run

```bash
npm install
cp .env.example .env
npm run dev        # http://localhost:4321
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

The JSON config files are validated at build time (`src/lib/site-config.ts`), so a typo fails the build.

### Adding a product

Copy an existing file in `src/content/products/`. The file name becomes the URL (`/shop/<file-name>`).
`category` must match a file name in `src/content/categories/`. `cautions` is required.

## Status

- [x] Phase 1: scaffold (layout, content, pages, cart drawer)
- [ ] Phase 2: art layer
- [ ] Phase 3: checkout (Stripe + D1 orders + Mailtrap)
- [ ] Phase 4: booking
- [ ] Phase 5: newsletter and contact form
- [ ] Phase 6: launch (see DESIGN.md §11)
