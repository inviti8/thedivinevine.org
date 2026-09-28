# The Divine Vine — Site Design

Status: **Draft v2** (2026-09-27). Built up by back-and-forth; items marked **[OPEN]** still need a decision.

An herbal-remedy storefront with consultation booking. Three primary views — **Landing**, **Shop**, **Booking** — with a persistent custom animated art layer rendered over the pages.

Guiding preference: **minimize third-party dependencies**. Own the data (D1), and reuse the providers already used elsewhere (Stripe, Mailtrap, Cloudflare).

## 1. Reference sources

| Source | What we take from it |
|---|---|
| `metavinci/vapor-merch/sites/pernicious-remedies` | **Structure**: Astro + Svelte islands + Tailwind v4 on Cloudflare Pages, one MDX file per product, content collections, cart store + drawer, `/api/checkout` + `/api/webhook` routes, journal. |
| `metavinci/heavymeta_collective` | **Patterns** (Python/NiceGUI, so ported not copied): Stripe Checkout hardening, idempotent order recording, Mailtrap transactional senders, signed tokens. |
| `image_references/` | **Color cues only** — not illustration style. |

### What exists in pernicious-remedies' purchase flow

The flow is wired end-to-end but not production-ready:

- Product page → `addToCart` (nanostores, localStorage) → `CartDrawer.svelte` → `POST /api/checkout` → hosted Stripe Checkout → `/thank-you`.
- Gaps we fix here (see §6):
  1. The server trusts client-sent price IDs and quantities.
  2. Price IDs are placeholders, and the display price can drift from the Stripe price.
  3. No shipping rates.
  4. The webhook only logs — orders are never stored and no one is emailed.
  5. `/thank-you` doesn't verify the session.
  6. There is no mobile nav.
  7. The newsletter form posts to a route that doesn't exist.

### What heavymeta actually has for email

- Heavymeta has **outbound transactional email only** (Mailtrap). There is no forwarding or inbound code.
- Forwarding is handled with **Cloudflare Email Routing** (DNS config, no code), as planned in `vapor-merch/BUSINESS_TASKS.md`. See §8.

## 2. Stack

Mirrors pernicious-remedies:

- **Astro 5**, static output by default; on-demand only for `src/pages/api/*`.
- **Svelte 5** islands for interactive pieces (cart drawer, booking widget, newsletter form, art layer host).
- **Tailwind v4**, with tokens in `src/styles/global.css` `@theme`.
- **nanostores** + `@nanostores/persistent` for the cart.
- **Cloudflare Pages** + Workers (`nodejs_compat` for the Stripe SDK).
- **D1** (SQLite) for orders, Stripe event dedupe, bookings and newsletter subscribers.
- A small separate **Cron Worker** sharing D1 (§7).
- **Three.js** for the art layer (§5).
- **Mailtrap** (HTTP API via `fetch`) for transactional email (§8).

### Content layout

```
src/content/
  products/*.mdx        one file per product (pernicious pattern)
  categories/*.mdx      teas, tinctures, salves
  journal/*.mdx
src/data/
  booking.json          booking settings + consultation types (§7)
  shop.json             shipping options + free-shipping threshold (§6)
```

## 3. Views & routes

| Route | View | Notes |
|---|---|---|
| `/` | **Landing** | Hero (art layer focal point), featured remedies, consultation CTA, brand story teaser, **newsletter signup**. |
| `/shop` | **Shop** | Grid filterable by category (teas / tinctures / salves). |
| `/shop/[slug]` | Product | Gallery, description, ingredients, usage, cautions, add to cart. |
| `/shop/category/[slug]` | Category | Replaces pernicious' `/collections`. |
| `/booking` | **Booking** | Pick a consultation type, then a date and slot, then intake, then pay or request. See §7. |
| `/booking/confirmed`, `/booking/manage` | Booking success; cancel or reschedule via a signed link | |
| `/journal`, `/journal/[slug]` | Journal | Kept from pernicious. |
| `/thank-you` | Order success | Verifies `session_id` server-side; shows the order summary. |
| `/about`, `/faq`, `/contact` | Info | `/contact` posts to `/api/contact`, which emails the owner. |
| `/legal/*` | Terms, privacy, shipping and returns, health disclaimer | |
| `/api/*` | Workers | `checkout`, `webhook`, `order`, `contact`, `newsletter/*`, `booking/*` |

Global: `Nav` (with a mobile menu), `CartDrawer`, `Footer`, `ArtLayer` (persistent).

## 4. Visual design

Palette derived from `image_references/`. These are starting values to tune against the art.

| Token | Hex | Source cue |
|---|---|---|
| `night` | `#0d0a10` | Raven wallpaper ground |
| `plum-deep` | `#1c1020` | Foxglove wallpaper ground |
| `plum` | `#3a1d3f` | |
| `foxglove` | `#8a4a7d` | Foxglove blossoms |
| `mauve` | `#c294b4` | Light petals, hover states |
| `moss` | `#3f4a30` | Leaves |
| `sage` | `#8c9a72` | Sage leaves (Virgo jar) |
| `gilt` | `#c9a24b` | Gold stars / moons / filigree |
| `gilt-bright` | `#e6cc80` | Highlights, focus rings |
| `parchment` | `#efe3c6` | Virgo recipe card — light panels, product "labels" |
| `ink` | `#1d1712` | Text on parchment |

- The default theme is dark (`night` / `plum-deep`), with parchment cards for readable product and recipe content.
- Gold is for accents only: rules, stars, CTAs, prices.
- **Type**: for now, one simple readable font, defined only as `--font-display` / `--font-body` tokens so it can be swapped later in one place. Placeholder is the system serif stack; final choice deferred.
- Motifs (moons, stars, vines as thin gold SVG ornaments) are optional polish and separate from the art layer.

## 5. Art layer (custom animated art)

A single fixed, full-viewport canvas rendered **over** page content:

- `pointer-events: none` so it never blocks clicks.
- Mounted once in `Base.astro` as a `client:idle` island.
- **Persists across all views**: Astro view transitions with `transition:persist`, so the scene and its animation state survive navigation.

**Renderer:** one Three.js scene with pluggable asset adapters.

| Adapter | Format | Runtime |
|---|---|---|
| Mesh | glTF / GLB (skinned + morph animation) | `GLTFLoader` + `AnimationMixer` |
| SkelForm | `.skf` (appears to be zip of armature JSON + textures) | Vendored `skelform-js` (MIT, animation math only), stepped each frame. Each bone's texture is drawn as a textured quad in the same scene. |
| Fallback | Transparent WebM / spritesheet (SkelForm "sheet/video" export or baked 3D) | `<video>` / canvas |

Why this shape:

- Both art types share one canvas, one draw loop and one frame budget.
- 2D and 3D can be layered together (e.g. a SkelForm vine in front of a 3D jar).
- Adding a format later just means adding another adapter.

### Per-view animation triggers

The scene is loaded once. Each view can optionally request an animation state; routes without an entry keep whatever is playing.

```ts
// src/art/scene.ts
export const scene = {
  assets: [{ id: 'vine', type: 'gltf', src: '/art/vine.glb' }],
  defaultState: { vine: 'idle' },
  views: {                         // optional — per-route triggers
    '/':        { vine: 'bloom' },
    '/shop':    { vine: 'sway' },
    '/booking': { vine: 'curl' },
  },
  transition: { crossfade: 0.6 },  // seconds between clips
};
```

- The host listens for `astro:after-swap`, matches the route (prefix match, so `/shop/[slug]` inherits `/shop`) and crossfades to the requested clip.
- The same interface works for SkelForm (animation name plus blend).
- One-shot clips can return to `defaultState` when they finish.
- Pages can also fire events (e.g. `art:trigger` on add-to-cart) for small reactions later.

Behavior:

- **Anchors**: art can pin to viewport regions or track DOM elements (e.g. `[data-art-anchor="hero"]`).
- **Degradation**: `prefers-reduced-motion`, no WebGL, or a low-power device all fall back to a static poster or baked video.
- The animation pauses when the tab is hidden.
- **Budgets**: ≤ ~2 MB compressed per scene (Draco/Meshopt for GLB, KTX2 textures); target 60 fps on mid-range phones; DPR capped at 2.

### v1: stubbed until art exists

No sample art is available yet, so the layer ships with stubs. It is wired end-to-end but shows only a placeholder.

- **`ArtAdapter` interface**: `load()`, `play(state, { crossfade })`, `update(dt)`, `dispose()`. Every format implements it.
- **`PlaceholderAdapter`** stands in for real art: a procedural Three.js scene (slow drifting gold "stars" plus a crescent). Its named states (`idle`, `bloom`, `sway`, `curl`) visibly change, so per-view triggers, view-transition persistence, reduced-motion fallback and performance can be tested now.
- **`GltfAdapter`** is implemented (it is standard Three.js), but nothing references a `.glb` until art arrives.
- **`SkelformAdapter`** is an interface-only stub that logs "not yet supported". It will be implemented once a sample `.skf` is available to validate the format.
- The art layer can be switched off in the scene config (`enabled: false`).

Risks:

- `skelform-js` is small and young, so we vendor it rather than depend on upstream.
- `.skf` internals are undocumented, so a sample export is needed before committing to the SkelForm adapter.

## 6. Commerce flow

Keeps pernicious-remedies' client flow (cart store → drawer → hosted Checkout) and hardens the server side with heavymeta's patterns.

1. **Client** sends only `{ slug, quantity }[]` to `POST /api/checkout`.
2. **Server** resolves each slug against the product collection, then:
   - rejects items that are unknown or out of stock;
   - caps quantity;
   - builds line items from **inline `price_data`**, using the price in MDX frontmatter.

   This makes MDX the single source of truth for price. There are no Stripe Price IDs to maintain and no drift.
3. **Pre-create the order** in D1 with `status='awaiting_payment'` and the line items. Put `order_id` in the session `metadata`, and store `stripe_session_id` on the order. This is heavymeta's commissions pattern.
4. **The Checkout Session** includes:
   - `mode: 'payment'`;
   - `shipping_address_collection: { allowed_countries: ['US'] }`;
   - `shipping_options` (**estimated placeholders**, tune once real package weights are known). These are configured in `src/data/shop.json`:
     - Standard (USPS Ground Advantage, 3–7 business days): **$6.95**;
     - **free** when the subtotal is **≥ $50** (the server picks the option set based on the cart subtotal);
     - Priority (1–3 business days): **$12.95**;
   - `automatic_tax` **off** for now;
   - `allow_promotion_codes`;
   - Link enabled (no hard-coded `payment_method_types`);
   - `billing_address_collection: 'required'`.
5. **Webhook** (`checkout.session.completed`):
   - verify the signature (`constructEventAsync`);
   - dedupe via the `stripe_processed_events` table;
   - atomically `UPDATE orders SET status='paid' … WHERE id=? AND status='awaiting_payment'`;
   - store the shipping address;
   - send an order email to the owner and a confirmation to the buyer.

   The webhook is the source of truth. It also dispatches booking payments by `metadata.kind` (`order` or `booking`).
6. **`/thank-you`** calls `GET /api/order?session_id=` (paid-if-awaiting as a fallback, idempotent), shows a summary and clears the cart.
7. **Fulfillment**: manual for v1 (email plus Stripe dashboard, labels via Pirate Ship). There is no admin UI in v1.

### Products

The launch line is teas, tinctures and salves. There are no products yet, so the scaffold ships 1–2 placeholder MDX files per category.

Frontmatter (draft):

```yaml
name: string
category: reference(categories)   # tea | tincture | salve — fixes pernicious' free-string issue
priceUsd: number
size: string                      # "2 oz tin", "1 fl oz dropper", "40 g loose leaf"
weightOz: number                  # for future weight-based shipping
botanicalNames: string[]
ingredients: string[]
usage: string                     # brewing / dosing / application directions
cautions: string[]                # pregnancy, interactions, allergens
primaryImage: string
gallery: string[]
inStock: boolean
featured: boolean                 # landing page "featured remedies"
tags: string[]                    # concerns (sleep, digestion…) for future filtering
```

The MDX body holds the long description and lore.

## 7. Booking

**Decision: custom, self-hosted.** Cal.com and Calendly were rejected to avoid third-party dependencies. Cal.com is free for a single user but branded and hosted on their servers; self-hosting it is a heavy AGPL Next.js + Postgres app.

Booking reuses our own Stripe, D1 and email pieces. Email is the notification and control channel.

### Configuration — `src/data/booking.json`

A single file holds the settings and the expandable list of consultation types:

```json
{
  "timezone": "America/Los_Angeles",
  "weeklyHours": {
    "tue": [["10:00","16:00"]], "wed": [["10:00","16:00"]], "thu": [["10:00","16:00"]],
    "fri": [["10:00","16:00"]], "sat": [["10:00","14:00"]]
  },
  "slotIntervalMin": 30,
  "bufferMin": 15,
  "minNoticeHours": 24,
  "horizonDays": 60,
  "meeting": {
    "format": "video",
    "url": "",
    "note": "A FaceTime link — works in any browser, including Android/Windows"
  },
  "types": [
    { "slug": "booking", "name": "Schedule a Booking", "mode": "paid",
      "durationMin": 60, "priceUsd": 75, "description": "…" },
    { "slug": "free-consult", "name": "Free Consult", "mode": "request",
      "durationMin": 20, "priceUsd": 0, "description": "…" }
  ]
}
```

- Adding a type means adding an entry. `mode` controls the flow: `paid` goes through Stripe, `request` needs owner approval.
- A type can override `meeting` (e.g. phone or in-person later).
- The file is validated with Zod at build time.
- Hours, durations and the $75 price are **placeholders** until the owner confirms them.
- **Meeting link**: the confirmation email includes `meeting.url`.
  - Best guess for an iPhone owner: a **FaceTime link** (FaceTime → *Create Link*), reused for all sessions. Non-Apple clients join from a browser.
  - Swap in Zoom or Google Meet any time by changing the URL.
  - If the URL is empty, the email says a link will be sent before the session.

### Owner calendar (iPhone / iCloud)

**Blocking time: iCloud → site.**

1. On the iPhone, create a dedicated calendar named **"Divine Vine — Unavailable"**: Calendar → Calendars → Add Calendar.
2. Turn on **Public Calendar** (the ⓘ next to the calendar), then *Share Link*.
3. That gives a `webcal://p…-caldav.icloud.com/published/2/…` URL. Store it as `OWNER_ICS_URL`. The server fetches it as `https://`.

Why a dedicated calendar: an iCloud "public" calendar is readable by anyone who has the URL (it is unguessable but not private). Keeping personal events out of it means nothing sensitive leaks. She blocks off time by adding events to that calendar; all-day events block the whole day.

- `OWNER_ICS_URL` accepts a list, so her main calendar can be added later if she's comfortable with that.
- iCloud published feeds can lag a few minutes, and the 15-minute hold plus the double-booking index cover that window.

**Bookings: site → iCloud.** Owner booking emails carry an `.ics` attachment. On iPhone Mail she taps it, then *Add to Calendar*, and the session lands in her calendar with the meeting link. There is no CalDAV write access or Apple credentials in v1.

A later option is CalDAV write-back with an Apple app-specific password, so bookings appear automatically. It is deferred because it means storing an Apple credential.

### Flow

1. **Browse**: the client picks a type, and `/booking` loads open days and slots for the visible month.
2. **Hold**: the client picks a slot and fills in intake. `POST /api/booking/hold` inserts a `held` row that expires in 15 minutes.
3. **Confirm**, depending on the type's `mode`:
   - **`paid`**: Stripe Checkout (same helper as the shop, `metadata.kind='booking'`, `metadata.booking_id`). The webhook moves the booking `held → confirmed` atomically.
   - **`request`**: status becomes `pending`, and the owner gets an email with signed **Confirm / Decline** links.
4. **Notify**:
   - the client gets a confirmation email with an `.ics` attachment and signed **Cancel / Reschedule** links;
   - the owner gets a copy with an `.ics` too.
5. **Remind**: the cron Worker emails the client 24 hours before and expires stale holds.

### Availability computation (server)

```
open slots = weekly hours (booking.json)
           − active bookings (held | pending | confirmed)
           − owner's calendar busy times (private ICS feed)
           − blocked dates
           − min notice − beyond horizon
           ± buffer between sessions
```

- **Blocking time without an admin UI**: the owner's calendar (Google, Apple, Proton…) exposes a *secret iCal URL* (`OWNER_ICS_URL`).
  - The server fetches it, caches it for about 5 minutes and treats its events as busy, including recurring events.
  - The owner blocks days by adding events to their normal calendar.
- **Double-booking protection**: a partial unique index on active slots. A concurrent second hold fails the insert, and the API answers "slot just taken".
- **Timezones**: stored in UTC, computed in the owner's timezone and displayed in the client's (detected, and switchable).

### D1 tables

```sql
bookings(id, type_slug, start_utc, end_utc, status,  -- held|pending|confirmed|declined|cancelled|expired
         name, email, phone, notes, client_tz,
         stripe_session_id, hold_expires_at, created_at, updated_at)
CREATE UNIQUE INDEX one_active_per_slot ON bookings(start_utc)
  WHERE status IN ('held','pending','confirmed');
blocked_dates(date, reason)  -- optional manual override on top of the ICS feed
```

### API

| Route | Purpose |
|---|---|
| `GET /api/booking/availability?type=&month=` | Open days and slots |
| `POST /api/booking/hold` | Create a hold, return a Checkout URL or a pending state |
| `GET /api/booking/action?t=<signed token>` | Owner confirm or decline; client cancel. Tokens are HMAC-signed with an expiry (heavymeta's itsdangerous pattern, ported to WebCrypto). |
| `GET /booking/manage?t=` | Client page to cancel or reschedule |

### Libraries

- `ical.js` (Mozilla, MPL-2.0) parses the owner's ICS feed, including recurrence rules.
- `ics` generates invite attachments.
- `date-fns` + `@date-fns/tz` handle date and timezone math.
- **UI**: a custom Svelte month grid plus a slot list, fully on-brand.

### Cron

Cloudflare Pages has no scheduled handlers, so a tiny separate Worker (`workers/cron`) with a Cron Trigger shares the D1 binding. It runs every 10 minutes to expire holds and send 24-hour reminders.

### Content and privacy

- The intake form collects minimal health information. Health data raises privacy obligations, so collect as little as possible.
- Emails link to the booking and don't include intake details.

## 8. Email

- **Forwarding (inbound)**:
  - Cloudflare Email Routing (free) for `hello@`, `orders@`, `bookings@`, `privacy@` → owner's inbox.
  - DNS-only (MX + SPF records in Cloudflare); no code.
  - Document the aliases in the README.
- **Transactional (outbound): Mailtrap**, the same provider as heavymeta, to keep accounts consolidated.
  - Add `thedivinevine.org` as a sending domain in the existing Mailtrap account.
  - Workers can't use the Python SDK, so `lib/email.ts` calls Mailtrap's HTTP send API with `fetch` and supports attachments (for `.ics`).
  - Port heavymeta's structure:
    - one function per message;
    - a `DEBUG` bypass that logs instead of sending;
    - escaped HTML templates;
    - **set `reply_to`** (heavymeta's emails say "reply" but come from `noreply@`).
  - Messages (v1):

    | Message | To |
    |---|---|
    | Order confirmation | Buyer |
    | New order | Owner |
    | Contact form | Owner, `reply_to` = sender |
    | Booking: pending / confirmed / declined / cancelled / reminder | Client |
    | Booking: new request / confirmed / cancelled | Owner |
    | Newsletter confirm (double opt-in) | Subscriber |

  - DNS: Mailtrap DKIM ×2, SPF (`include:_spf.mailtrap.io`, merged with Email Routing's SPF into one record), DMARC.

### Newsletter

- A standard email field on the landing page.
- It is stored in our own D1, with no third-party list service, following heavymeta's waitlist pattern:
  - honeypot field;
  - rate limit;
  - email validation;
  - dedupe;
  - owner alert.
- `subscribers(email UNIQUE, status: pending|confirmed|unsubscribed, token, created_at, confirmed_at)`.
- **Double opt-in**: a confirm link via Mailtrap. Every mailing carries an unsubscribe link (`/api/newsletter/unsubscribe?t=`).
- Actually sending newsletters is out of scope for v1. Later: Mailtrap's bulk stream or an export.

## 9. Compliance notes (herbal-specific)

- **Stripe**: herbal supplements and nutraceuticals can trigger Stripe's restricted-business review. Describe products accurately at onboarding; avoid disease or cure claims.
- **FDA/DSHEA**: every page that makes a structure or function statement needs the disclaimer "These statements have not been evaluated by the Food and Drug Administration…". Product copy must not claim to diagnose, treat, cure or prevent disease.
- **Cautions** per product: pregnancy/nursing, medication interactions, allergens. These are a required frontmatter field.
- **Consultations**: educational, not medical advice. This goes in the booking terms and the intake form.
- **Sales tax**: Stripe Tax is off for v1. Revisit as sales grow, since tax on consumables varies by state and nexus thresholds matter.
- **Newsletter**: CAN-SPAM — include an unsubscribe link and a physical mailing address in mailings.

## 10. Config

```
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PUBLIC_SITE_URL,
MAILTRAP_API_TOKEN, EMAIL_FROM, OWNER_EMAIL,
OWNER_ICS_URL,                          # iCloud published calendar URL(s), comma-separated
SIGNING_SECRET,                         # HMAC for booking + newsletter tokens
DEBUG                                   # log emails instead of sending
D1 binding: DB
```

Guard: in dev, refuse any key that isn't `sk_test_`. This is heavymeta's guard.

## 11. Phases

1. **Scaffold**:
   - port the pernicious structure;
   - tokens, layout and mobile nav;
   - content schemas and placeholder products;
   - journal.
2. **Art layer**:
   - persistent canvas host;
   - glTF adapter and per-view triggers;
   - fallback;
   - the SkelForm adapter after a sample `.skf` is tested.
3. **Commerce**:
   - hardened checkout;
   - D1 orders and webhook;
   - Mailtrap emails;
   - thank-you page.
4. **Booking**:
   - config;
   - availability and ICS feed;
   - holds;
   - paid and request flows;
   - emails and the cron Worker.
5. **Newsletter and contact**: forms, D1, double opt-in.
6. **Launch**:
   - legal pages;
   - Email Routing and Mailtrap DNS;
   - Stripe live;
   - SEO/OG;
   - QA.

## 12. Open questions

1. **Placeholders to confirm with the owner** (all in config files, so no code changes are needed):
   - shipping rates;
   - hours;
   - session lengths;
   - the $75 booking price;
   - the FaceTime link.
2. **Sample art** (later): a test `.glb` and a `.skf` export.

## Decisions log

| Date | Decision |
|---|---|
| 2026-09-27 | Structure mirrors pernicious-remedies (Astro/Svelte/Tailwind/Cloudflare, one MDX file per product). |
| 2026-09-27 | Colors taken from the image references; the illustration style is not copied. |
| 2026-09-27 | Art layer: a persistent Three.js overlay with glTF + SkelForm adapters and optional per-view animation triggers. |
| 2026-09-27 | Booking is custom and self-hosted. Two types to start: "Schedule a Booking" (paid) and "Free Consult" (request), configured in `booking.json`. |
| 2026-09-27 | Launch products: teas, tinctures, salves. |
| 2026-09-27 | US-only shipping. Stripe Tax off. |
| 2026-09-27 | Mailtrap for transactional email (the same provider as heavymeta); Cloudflare Email Routing for forwarding. |
| 2026-09-27 | Keep the journal. Simple placeholder font. Newsletter signup on the landing page, stored in D1 with double opt-in. |
| 2026-09-27 | Estimated shipping: $6.95 standard, free ≥ $50, $12.95 priority (placeholders). |
| 2026-09-27 | Booking timezone is `America/Los_Angeles`. The owner uses an iPhone: a dedicated iCloud published calendar for blocking, `.ics` attachments for adding bookings, and a FaceTime link for sessions (best guess). |
| 2026-09-27 | Art layer ships with a placeholder adapter; the SkelForm adapter is a stub until sample art exists. |
| 2026-09-27 | Site is built for the owner (the user's sister). |
| 2026-09-27 | Brand is The Divine Vine; the domain is `thedivinevine.org`. |
