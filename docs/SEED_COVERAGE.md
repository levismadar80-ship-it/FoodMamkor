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

🟡 rows are explicitly out of scope for the seed work this contract tracks
(chunk B of MEH-1706) — listed here so the gap is visible, not because
closing them is planned.

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
