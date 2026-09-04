# Demo-seed coverage contract

`ruach-hasadeh` (the flagship demo business, seeded by
`backend/scripts/seed_demo_business.py`) is the end-to-end proof surface for
every shipped feature. This table is the coverage contract: every row is a
feature surface, whether it has a seeded row today, and how severe the gap is
if it doesn't. MEH-1706 is the card this document was written for.

**Verified against `backend/scripts/seed_demo_business.py` on 2026-08-13** —
re-grep the file before trusting a row after that date; seed coverage moves
with every feature PR and this table does not update itself.

## Coverage table

| # | Surface | Model / column | Seeded by | Status | Severity |
|---|---|---|---|---|---|
| — | Profile, contact, images, hours, license | `Producer` core fields | `seed_demo_business.py::seed_demo_business` | ✅ covered | — |
| — | Products (4) | `Product` | `seed_demo_business.py::seed_demo_business` (`DEMO_PRODUCTS`) | ✅ covered | — |
| — | Delivery areas (3 cities) | `DeliveryArea` | `seed_demo_business.py::seed_demo_business` (`DEMO_DELIVERY_AREAS`) | ✅ covered | — |
| — | Locations (10, incl. one pickup-only delivery variant) | `producer_locations` | `seed_demo_business.py::seed_demo_business` (`DEMO_LOCATIONS`) | ✅ covered | — |
| — | Recipe | `Recipe` | `seed_demo_business.py::seed_demo_business` (`DEMO_RECIPE`) | ✅ covered | — |
| — | Event (1) | `Event` | `seed_demo_business.py::seed_demo_business` (`DEMO_EVENT`) | ✅ covered | — |
| — | Reviews (3, one with owner reply) | `ProducerReview` | `seed_demo_business.py::seed_demo_business` (`DEMO_REVIEWS`) | ✅ covered | — |
| — | Verified tier (ADR-022) + verified phone | `Producer.verified_at`, `.phone_verified` | `seed_demo_business.py::seed_demo_business` | ✅ covered | — |
| — | Owner / consumer / admin QA logins | `User` (roles `producer`/`consumer`/`admin`) | `seed_demo_business.py::seed_demo_business` + `_sync_users` | ✅ covered | — |
| — | Delivery-only producer (pickup, no own lat/lng) | `Producer` + `producer_locations` | `seed_demo_business.py::seed_demo_business` | ✅ covered | — |
| — | Dietary scope demos (gluten facility × 3 states, vegan/vegetarian scope) | `Producer.gluten_free_facility` etc. | `seed_demo_business.py::seed_dietary_scope_demos` (`DIETARY_SCOPE_DEMOS`) | ✅ covered | — |
| 1 | Group buys | `GroupBuy`, `GroupBuyCommit` | not imported, zero rows | ❌ uncovered | 🔴 |
| 2 | Experiences + moderation states | `Experience.status` / `.moderation_status` | `seed_demo_business.py::seed_demo_business` (`DEMO_EXPERIENCES`) | ⚠️ **partial** — 3 rows exist, but all three carry `status="approved"` / `moderation_status="APPROVED"`. No `pending` or `changes_requested` row, so the moderation queue itself has nothing to show against this producer. | 🟠 (downgraded from 🔴 — rows exist, status variety is the gap) |
| 3 | Order window | `producers.order_window` (JSONB) | not referenced, zero rows | ❌ uncovered | 🔴 |
| 4 | Kashrut certificate | `KashrutBadgeRequest.cert_url`, `producers.kashrut_badges` | not referenced; `kosher="כשר"` string only | ❌ uncovered | 🔴 |
| 5 | Contact channels | `website` / `facebook` / `external_order_form` / `whatsapp_group` / `contact_email` | only `instagram` is set (1 of 7 channels) | ❌ uncovered | 🟠 |
| 6 | Google rating | `producers.google_place_id` | not referenced | ❌ uncovered | 🟠 |
| 7 | Owner story | `owner_bio`, `owner_photo_url` | not referenced | ❌ uncovered | 🟠 |
| 8 | Nationwide delivery with exclusions | `delivery_nationwide` + `delivery_excluded_cities` | `delivery_nationwide=True` is set once (delivery-only producer); `delivery_excluded_cities` never referenced — the exclusion mode itself is unexercised | ❌ uncovered | 🟠 |
| 9 | Availability states | `full_this_week`, `on_vacation` + `vacation_until` | every seeded producer is `availability_state="accepting_orders"` | ❌ uncovered | 🟠 |
| 10 | Analytics | `ProducerPageView`, `ProducerContactClick`, `SearchQuery` | not referenced | ❌ uncovered | 🟡 (out of scope) |
| 11 | Favorites | `Favorite`, `FavoriteAlert` | not referenced | ❌ uncovered | 🟡 (out of scope) |
| 12 | Admin queues | `Report`, `CategoryRequest`, `OutreachLead` | not referenced | ❌ uncovered | 🟡 (out of scope) |
| 13 | Misc | `story_card_url` (MEH-53), `HomeProduct*`, `ReferralClick` | not referenced | ❌ uncovered | 🟡 (out of scope) |
| 14 | Admin pre-approval review checklist | `AdminChecklistItem` | **the migration**, not a seed script — revision `d4a9c31e6f82` ends in a `bulk_insert` of 7 reference rows | ✅ covered | — |
| — | Admin review audit trail | `ProducerReviewCheck` | nothing, by design — a row is written when an admin ticks an item, so absence of a row IS the unchecked state | ⬜ exempt | — |

🟡 rows are explicitly out of scope for the seed work this contract tracks
(chunk B of MEH-1706) — listed here so the gap is visible, not because
closing them is planned.

## ארכיטיפ×ערוץ — the primary-CTA matrix (MEH-2189)

The table above is the **feature-surface** axis: one flagship business
(`ruach-hasadeh`) carrying as many features as possible. This section is the
**perpendicular** axis — one business per outreach archetype, each on a
different `primary_contact_method`, so every branch of
`getPrimaryContactHref` (`frontend/lib/contact-method.js:35-81`) renders on a
live page.

Why a second axis was needed, measured rather than assumed: MEH-1706 chunk B
(PR #2931, `bc660e9f`) filled the flagship's channel **fields** — `facebook`,
`external_order_form`, `contact_email` — but left
`primary_contact_method="whatsapp"` on that row. Filling a field is not
selecting a channel: `getPrimaryMethod` (`contact-method.js:25-28`) reads only
`primary_contact_method`, so six of the seven CTA states had still never
rendered anywhere. Two of them (`facebook`, `external_order`) have no field in
the registration form at all (`backend/app/routers/auth.py`) and are settable
only from the dashboard — seeding is the only way they reach a page.

Source of truth: `ARCHETYPE_BUSINESSES` in
`backend/scripts/seed_demo_producers.py`.

| # | slug | archetype | category | `primary_contact_method` | field that must be filled |
|---|---|---|---|---|---|
| 1 | `sdot-zahav` | מאפייה | לחמים ואפייה | `whatsapp` | `phone` |
| 2 | `machlevet-ramat-yotam` | מחלבה | חלב וגבינות | `phone` | `phone` |
| 3 | `yekev-karmei-alona` | יקב | יין, בירה ומשקאות | `website` | `website` |
| 4 | `kaveret-or-habosmat` | כוורת / דבש | דבש | `instagram` | `instagram` |
| 5 | `beit-habad-sivan` | בית בד | שמנים | `email` | `contact_email` |
| 6 | `shulchan-aroch-catering` | קייטרינג | מוצרים מוכנים | `external_order` | `external_order_form` |
| 7 | `arugot-noam` | חוות ירקות | ירקות | `facebook` | `facebook` |
| 8 | `maadaniyat-ben-shemen` | מעדנייה | בשר | `phone` | **`phone` is NULL — edge** |

Row 1 is `whatsapp` on purpose: it is the regression control. Without it, a
change that broke the historical path would go unnoticed beside seven new
states that all looked fine.

Row 8 is the **edge**, and it is the row most likely to be "fixed" by mistake.
`getPrimaryContactHref` returns `null` for method `phone` when `producer.phone`
is falsy (`contact-method.js:50-53`), and `PrimaryContactButton.jsx:72` does
`if (!rawHref) return null`. So the correct rendering is **no CTA at all**, not
a `tel:` link with nothing after the colon. Do not give this row a phone
number; the whole point is that the dead-link rule has a live fixture.

Two categories are nearest-match, not exact — there is no `קייטרינג` row and no
`מעדנייה` row in `seed_data.CATEGORIES`, so those two map to `מוצרים מוכנים`
and `בשר`. That is a data choice; no category was created (`_seed_one` looks
categories up by name and aborts if one is missing — it never creates one).

**Teardown.** These eight rows follow the same convention as the ten
`DEMO_BUSINESSES` rows: none of their names contains any `TEST_NAME_PATTERNS`
substring, so `--reset` does not sweep them. That is the existing contract for
demo rows, stated at `seed_demo_producers.py:56-57`, not a new exemption.

**Flags** (the script's real interface — there is no `--refresh` here; that
flag belongs to `seed_demo_business.py`):

```
python -m scripts.seed_demo_producers                    # dry-run, no writes
python -m scripts.seed_demo_producers --confirm          # insert (idempotent)
python -m scripts.seed_demo_producers --reset --confirm  # sweep TEST rows, then insert
```

Re-running with `--confirm` and no `--reset` inserts nothing: `_seed_one` skips
any slug that already exists.

## Adding a feature

1. Add a seed row for the new surface to `seed_demo_business.py` (or the
   relevant seed script) so `ruach-hasadeh` exercises it.
2. Update this table — add or correct the row for that surface.
3. `check_seed_coverage.py` (chunk C, not yet built) stays green because the
   surface it lists now has a matching row.

## What this gate does NOT cover

The eventual CI gate (chunk C) runs `check_seed_coverage.py` against a
**CI-local database**, seeded fresh inside the workflow run. It protects
against **code drift** — a new feature shipping without a matching seed
row — not against **staging's actual DB state**. A staging database that has
been reset, partially migrated, or otherwise diverged from a fresh seed can
still be missing rows this table says are "covered," and the gate will not
catch that, because it never touches staging.

Staging's protection is operational, not this gate:

- MEH-1707 excludes the flagship business from `--reset`, so a routine reset
  no longer deletes the producer that carries this coverage.
- `seed_demo_business.py --refresh` is the manual recovery path when staging
  needs to be restored to match this table.

There is no `--staging` mode planned for the eventual CI gate, and none
should be added under this card — that would be a different, larger piece of
work (a live-staging health check) than a code-drift gate.
