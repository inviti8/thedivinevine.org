# Build plan

The task-level plan for building what [`DESIGN.md`](DESIGN.md) describes. Milestones run in this order.
It differs from DESIGN.md §11: the art layer moves after commerce and booking, since no art exists yet
and checkout and booking are what make the site useful to the owner.

Last updated: 2026-10-30.

## Done

- [x] **Phase 1 — Scaffold** (2026-09-27): layout, mobile nav, view transitions, content collections and
  placeholder products, all pages, cart drawer, validated `booking.json` / `shop.json`, runbook.

## A. Server groundwork

- [x] D1 binding in `wrangler.toml`, and `migrations/0001_init.sql` with orders, Stripe event dedupe,
  bookings (one-active-per-slot index), blocked dates, subscribers and rate limits
- [x] `npm run dev` applies local migrations first (`scripts/db-migrate.mjs`)
- [x] `src/lib/env.ts`: typed runtime settings, with a guard that refuses non-`sk_test_` keys in dev/DEBUG
- [x] `src/lib/tokens.ts`: purpose-bound HMAC signed links with optional expiry (WebCrypto)
- [x] `src/lib/email.ts`: Mailtrap HTTP sender (reply-to, `.ics` attachments, DEBUG log bypass) + `esc()`
- [x] `GET /api/health` (Worker + settings + D1)
- [x] Vitest unit tests (`npm test`)

## B. Checkout (DESIGN.md §6)

- [x] `stripe` SDK (v23, Workers build); `src/lib/stripe.ts` session helper + `completeOrder` (shared with
  the thank-you fallback)
- [x] `POST /api/checkout`: `{ slug, quantity }[]` only → re-price from MDX, reject unknown/out-of-stock,
  cap quantity, pre-create the `awaiting_payment` order, shipping options from `shop.json` (free ≥ threshold)
- [x] `POST /api/webhook`: verify signature, dedupe, atomic `paid` transition, store shipping, dispatch by
  `metadata.kind`; `async_payment_succeeded/failed` and `expired` handled
- [x] Order emails: buyer confirmation + owner notification (with a Stripe Dashboard link)
- [x] `GET /api/order?session_id=` and a verified `/thank-you` summary; the cart clears only once paid
- [x] Cart drawer shows server messages; client cart capped at `maxQuantityPerItem`
- [x] Tests: pricing, shipping, order transitions (in-memory D1 over `node:sqlite`), webhook end to end
- [ ] **Needs a Stripe test key:** a real test purchase via `stripe listen` (RUNBOOK §9)

## C. Contact + newsletter (DESIGN.md §8)

- [ ] Rate-limit helper over the `rate_limits` table (also apply to `/api/checkout`); honeypot + email validation helpers
- [ ] `POST /api/contact` → owner email with reply-to = sender; form on `/contact`
- [ ] Newsletter: subscribe (double opt-in email), confirm and unsubscribe via signed links, owner alert;
  landing-page form as a Svelte island

## D. Booking (DESIGN.md §7)

- [ ] Availability engine (weekly hours − bookings − ICS busy − blocked dates − notice/horizon ± buffer),
  with thorough unit tests across DST changes
- [ ] ICS feed fetch + cache (`ical.js`, recurrence)
- [ ] `GET /api/booking/availability`, `POST /api/booking/hold` (15-min hold, slot-taken handling)
- [ ] Paid flow via Checkout (`kind='booking'`); request flow with owner Confirm/Decline links
- [ ] Emails with `.ics` invites; `/booking/confirmed`, `/booking/manage` (cancel/reschedule)
- [ ] Svelte month grid + slot list + intake form
- [ ] Cron Worker (`workers/cron`): expire holds, 24 h reminders

## E. Art layer (DESIGN.md §5)

- [ ] Persistent canvas host (`transition:persist`), `ArtAdapter` interface, `PlaceholderAdapter`
- [ ] Per-view triggers on `astro:after-swap`; `GltfAdapter`; SkelForm stub
- [ ] Reduced-motion / no-WebGL fallback, hidden-tab pause, DPR cap, perf check on a phone

## F. Launch (DESIGN.md §11.6)

- [ ] Cloudflare Pages project + D1 (`wrangler d1 create`, real `database_id`, `npm run db:migrate:remote`)
- [ ] Secrets in Pages; Email Routing aliases; Mailtrap sending domain (DKIM, merged SPF, DMARC)
- [ ] Stripe live account + webhook endpoint (`/api/webhook`, the four `checkout.session.*` events) and a
  restricted live key
- [ ] SEO/OG images, legal page review, real products and photos
- [ ] QA on the owner's iPhone

## Needed from the owner

| Item | Needed by |
|---|---|
| Stripe account (herbal products can get a restricted-business review, so apply early) | B (live), F |
| Real products: names, prices, sizes, cautions, photos | F |
| Shipping rates (current values are estimates) | F |
| Consultation hours, lengths, the $75 price, FaceTime link | D |
| iCloud "Divine Vine — Unavailable" published calendar link | D |
| Domain registrar / Cloudflare access | F |

## Notes

- **npm 8 bug**: a global npm 8.x crashes with `Cannot read properties of null (reading 'edgesOut')` when
  adding packages. Use npm 10+ (bundled with Node 22) or `npx npm@10 install …`.
- Newsletter tokens are signed links (`tokens.ts`), so `subscribers` has no stored `token` column
  (a change from DESIGN.md §8).
- `astro dev` warns about a `SESSION` KV binding. Astro sessions aren't used, so the warning is harmless.
