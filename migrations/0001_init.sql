-- Initial schema (DESIGN.md §6–8). Times are ISO-8601 UTC strings; money is integer cents.

CREATE TABLE orders (
  id                TEXT PRIMARY KEY,
  status            TEXT NOT NULL CHECK (status IN ('awaiting_payment', 'paid', 'expired', 'fulfilled', 'refunded')),
  items_json        TEXT NOT NULL,           -- [{ slug, name, unitAmountCents, quantity }]
  subtotal_cents    INTEGER NOT NULL,
  shipping_cents    INTEGER,
  total_cents       INTEGER,
  email             TEXT,
  shipping_name     TEXT,
  shipping_address_json TEXT,
  stripe_session_id TEXT UNIQUE,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  paid_at           TEXT,
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Webhook dedupe: insert the event id first; a conflict means it was already handled.
CREATE TABLE stripe_processed_events (
  event_id     TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE bookings (
  id                TEXT PRIMARY KEY,
  type_slug         TEXT NOT NULL,
  start_utc         TEXT NOT NULL,
  end_utc           TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('held', 'pending', 'confirmed', 'declined', 'cancelled', 'expired')),
  name              TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  notes             TEXT,
  client_tz         TEXT,
  stripe_session_id TEXT UNIQUE,
  hold_expires_at   TEXT,
  reminder_sent_at  TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Double-booking guard: a second active booking for the same start fails the insert.
CREATE UNIQUE INDEX one_active_per_slot ON bookings (start_utc)
  WHERE status IN ('held', 'pending', 'confirmed');
CREATE INDEX bookings_status_start ON bookings (status, start_utc);

-- Manual override on top of the owner's ICS feed.
CREATE TABLE blocked_dates (
  date   TEXT PRIMARY KEY,                   -- YYYY-MM-DD in the booking timezone
  reason TEXT
);

CREATE TABLE subscribers (
  email        TEXT PRIMARY KEY COLLATE NOCASE,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  confirmed_at TEXT
);

-- Fixed-window counters for public forms (contact, newsletter, booking holds).
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,             -- e.g. "contact:<ip>:<window>"
  count        INTEGER NOT NULL,
  expires_at   TEXT NOT NULL
);
