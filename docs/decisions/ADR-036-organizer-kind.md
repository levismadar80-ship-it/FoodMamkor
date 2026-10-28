# ADR-036: An event organizer is a `Producer` row with `kind='organizer'`, hidden from every business surface

**Status:** Accepted
**Date:** 2026-10-28
**Deciders:** Smadar Levi
**Source:** MEH-2458 (parent) · MEH-2459 (chunk 1) · PR #3708

## Context
Market organizers (שוק גלם and the like — travelling producers' markets in
Tel Aviv / Haifa) want to publish their markets as events on מהמקור. They sell
nothing themselves, hold no food-business license, and have no fixed address.
Today the only way onto the site is to register as a business, which is wrong
twice over: they are not a business, and the DNA lock says **licensed
businesses only, manual approval for every business** (`docs/CONTEXT.md`).
Meanwhile `events.producer_id` is `NOT NULL` (`models.py` class `Event`), so an
event must have a `producers` row behind it.

## Decision
An organizer is a `producers` row with **`kind='organizer'`** — a new
`VARCHAR(20) NOT NULL DEFAULT 'producer'` column with `CHECK kind IN
('producer','organizer')` (revision `f1a2b3c4d5e6`) — not a second entity. One
shared predicate, `producer_listing.is_business()` (`status='approved' AND
kind='producer'`), is composed by **every** surface that lists, counts,
searches, maps or resolves businesses, so an organizer is invisible as a
business everywhere at once and visible only through its events. A business
that also organizes markets stays `kind='producer'` and publishes its events
from its own page; `kind='organizer'` is only for someone who does not sell.

## Consequences
**Positive:**
- The DNA lock holds: an organizer is never *counted as* or *shown as* a
  business, so «עסקים מורשים בלבד» stays literally true of every business
  surface. The ADR records the one exception to "every row in `producers` is a
  business" instead of letting it live as tribal knowledge.
- No parallel owner for events (workflow smell #1): 24 routers and ~261
  frontend files keep one `Producer`.
- One owner for the decision "is this a business?" — the same shape as
  `catalog_default_availability_condition()` (MEH-1986), for the same reason:
  a rule converted in one reader and left raw in the others is a live
  disagreement.

**Negative:**
- `producers` now holds rows that are not businesses. Every *new* reader of
  the table must choose `is_business()` or justify not doing so; nothing stops
  a bare `status == "approved"` from leaking an organizer.
- The organizer carries business-shaped columns it never uses (license,
  kashrut, delivery mode). The `producer_location_mode` CHECK still applies, so
  registration (chunk 2) satisfies it with a server-side default.

**Mitigations:**
- `tests/test_organizer_kind.py` asserts the absence at the HTTP boundary on
  every public surface and the presence on `/events`; a new surface that
  forgets the predicate is caught the moment it is covered by a test there.
- `grep -rn 'Producer.status == "approved"' backend/app` dropped from 36 to 5
  on this PR; the five that remain are enumerated in the PR body with a reason
  each (events ×2 — organizers *included*; license and kashrut reminders —
  organizers excluded by `NULL` columns; the predicate itself).
- `grant-verified` refuses `kind='organizer'` with 409, so the «מאומת» tier
  cannot be stamped on an organizer by hand either.

## Alternatives considered
- **A separate `organizers` table + nullable `events.organizer_id`** — rejected:
  two owners for events, every event reader grows an `if`, and the admin
  queue, auth and dashboard would need a second code path for a row that
  differs from a business in one boolean.
- **A `vendor`/`stall` model with event↔vendor links (Farmish / USDA pattern)**
  — deferred, not rejected: it is a different feature (who sells *at* a
  market) and there is no demand from both sides yet. Nothing in this ADR
  blocks adding it later on top of `kind`.
- **A category "שווקים" for organizers** — rejected: a category is a food
  taxonomy for businesses; it would still list the organizer as a business.
