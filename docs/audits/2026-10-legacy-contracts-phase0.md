# LEGACY contracts — Phase 0 (read-only), 2026-10-21

> Measured on `origin/staging` `8804c97d`, the night of 21→22/10/2026, by a read-only
> sub-agent under MEH-2288. Nothing was edited for this report. Every claim carries a
> `file:line` from that ref; lines drift, identifiers do not. Source of the as-of rule:
> `.claude/rules/testing.md` § "Restoring an old artifact is not ratification".

**Why this exists.** Eleven `LEGACY(date, MEH-N)` markers expired between 07/09 and 21/10
while `staging` did not move, and `legacy-expiry-check` (MEH-1857) reds the required
*Repo guards* leg on every PR until each is either finished or deliberately extended.
PR #3519 extended all eleven to **2026-11-30**. This document is what the next session
needs to actually finish them, in order, without re-deriving it.

The eleven markers collapse into **six legacy things**:

| # | Marker (as of `8804c97d`) | Legacy thing | Ticket |
|---|---|---|---|
| 1 | `…97669fe803f5_meh1855_backfill_price_range.py:5` | `producers.starting_price_label` | MEH-1855 |
| 2 | `…9849fab1637a_meh1855_drop_starting_price_label.py:17` | same | MEH-1855 |
| 3 | `backend/app/models/models.py:63` | `producers.lat/lng` column pair | MEH-1938 (chunk 5b) |
| 4 | `…7c1e2a9f4b3d_meh2056_backfill_primary_locations.py:40` | `producers.opening_hours` read-fallback | MEH-1938 |
| 5 | `backend/app/routers/producer_me.py:692` | same | MEH-1938 |
| 6 | `frontend/lib/hours.js:163` | same | MEH-1938 |
| 7 | `frontend/lib/hours.js:185` | same | MEH-1938 |
| 8 | `frontend/__tests__/resolve-store-hours.test.js:9` | same | MEH-1938 |
| 9 | `backend/app/models/models.py:237` | `producers.top_product_name` | MEH-2137 (archived — no drop card) |
| 10 | `backend/app/models/models.py:944` | `products.price_range` | MEH-2064 |
| 11 | `backend/app/routers/producer_me.py:859` | legacy availability endpoints + `is_available_today` / `availability_status` | MEH-1854 → MEH-2272 / MEH-2273 |

---

## A. MEH-1855 — `producers.starting_price_label` (markers 1, 2) — **already done**

Both markers are **prose inside alembic module docstrings** quoting the marker template.
The column is already dropped: `9849fab1637a` runs
`op.drop_column("producers", "starting_price_label")` (`…drop_starting_price_label.py:60`,
PR #3316, 2026-09-04) and `c4e81b7a2f96` has `down_revision = "9849fab1637a"`.
`docs/MIGRATIONS.md:95` already records the marker as retired. The gate matched these two
only because `ANY_RE='LEGACY\('` scans every file under `backend/`
(`legacy-expiry-check.sh:82,88`) — `MIGRATIONS.md:108` warns against writing the literal
template in `backend/` for exactly this reason.

Readers/writers of `starting_price_label` in app code, schemas, openapi, Zod: **0**.
Residual mentions are historical (baseline DDL `ef8fb1858f5b:101`, the
`DROPPED_PRICE_ALIAS` absence-assertion in `tests/test_meh1856_closed_write_paths.py:54`,
two stale fixture keys).

**Fix:** reword the two docstrings so the literal `LEGACY(` token leaves `backend/` —
**PR #3523** (chunk 0). The date extension was the wrong lever for these two.

---

## B. MEH-1938 chunk 5b — `producers.lat` / `producers.lng` (marker 3)

`models.py:63-77`: business-level mirror of the primary `producer_locations` row. The
marker: chunk 5b must "rewire those helpers to take coordinates directly and drop both
columns — [DESTRUCTIVE], its own revision, ≥7-day soak, R2 backup ≤24h, the MEH-2056
count query = 0 on production".

**Census** (consumer READ paths of the column: **0**, by design since 5a):

| Role | Location |
|---|---|
| ORM | `models.py:78-79` |
| Column WRITERS | `routers/auth.py:528, 747`; `routers/admin.py:558`, `:842-843` setattr loop (`ProducerUpdate.lat/lng` `schemas.py:1941-1942`); `services/producer_queries.py:524-525`; `services/producer_import.py:283-284`; `seed_data.py:410-411`; `scripts/seed_demo_producers.py:831-832`; `scripts/seed_demo_business.py` (`**DEMO_PRODUCER` spread) |
| Column READERS (write-direction only) | `producer_queries.py:383, 392-393` (`create_primary_branch_location`), `:496-497` (`upsert_primary_branch_location`) |
| Owner PUT | closed — `data_ownership.py:49-50`, `producer_me.py:579-584` |
| Pydantic in | `ProducerCreate` `:1690-1691`, `ProducerAdminCreate` `:1742-1743`, `ProducerUpdate` `:1941-1942` |
| Pydantic out | `ProducerListOut.lat/lng` `:2423-2424` — **derived** by `_derive_lat_lng_from_primary_location` `:2703-2729`; stays |
| Frontend | 3 files read `producer.lat/lng` — the **API field**, not the column; **0 frontend changes for the drop** |
| Alembic | baseline `ef8fb1858f5b:85-86`; `7c1e2a9f4b3d:84-85,100-103` (GAP_COUNT_SQL + backfill) |
| Tests asserting the column | ~11 files (`test_meh1938_ch5a_*`, `test_meh1939_register_dual_write`, `test_meh2059_admin_dual_write`, `test_meh2140_import_dual_write`, `test_meh2056_*`, `test_meh2100_draft_submit`, `test_meh1938_ch5_strict_followup`, `test_producer_location_types`) |

**Tier:** schema (`drop_column` ×2, class A). No `EXPECTED_TABLES` change. **Sequence:**
1. YELLOW code PR — helpers take coordinates from the payload; close the writers; keep
   `ProducerListOut.lat/lng` derived; update tests → **PR #3525** (held).
2. RED `[DESTRUCTIVE]` revision — drop both + model removal + remove
   `data_ownership.py:49-50` in the same PR (`test_data_ownership.py:75` asserts every
   entry is a real column). `conftest.py::make_producer:315-316` and two fixtures still
   construct `Producer(lat=…)` — the drop PR's job.

**Unsafe today:** the two helpers still read the columns to populate the row (fixed by
#3525); GAP_COUNT_SQL (`7c1e2a9f4b3d:82-89`) must read 0 on production at drop time; the
backfill only WARNs on a non-zero `after` (`:155-163`).

---

## C. MEH-1938 — `producers.opening_hours` read-fallback (markers 4–8)

Code branch, not a column drop (yet). `hours.js:177-190` `resolveStoreHours`: primary
location's `opening_hours` wins, else `producer.opening_hours` (`:186`), else null. The
markers promise removing the **read arm** only; the column (`models.py:403`) has no drop
ticket.

| Role | Location |
|---|---|
| ORM | `models.py:403` |
| WRITERS still live | **admin PUT** `admin.py:842-843` setattr (`ProducerUpdate.opening_hours` `schemas.py:1977`); `scripts/seed_demo_business.py:135` |
| Admin UI writer | `components/admin/ProducerForm.jsx:157, 329, 443, 1165-1168` |
| Owner PUT | closed — `data_ownership.py:43`, `producer_me.py:678-693` |
| Frontend READERS of the business field | **1** — `hours.js:186`; consumed by `ProducerSections.jsx:146→736`, `lib/seo.js:311`, `lib/producer-completeness.js:111` |
| Tests | `resolve-store-hours.test.js` (`:36-63, 71-76, 123-127` exercise the legacy arm), `producer-completeness-hours.test.js`, `seo.test.js:36,377,397,404` |

**Unsafe today, two reasons:**
1. Admin wrote hours **only** to the legacy column; `upsert_primary_branch_location`
   mirrored city/address/lat/lng, never hours. Deleting `hours.js:186` would blank public
   hours, SEO `openingHoursSpecification` and the completeness card for any business
   whose hours an admin typed after 02/09. → **PR #3524** (held) adds the write-through
   (expand phase; both stores written) + `backend/scripts/count_hours_gap.py`.
2. No count query existed. The script's SQL must mirror `hours.js` row selection
   (`is_primary`, **and** the no-primary-row case where the frontend falls straight
   through to the column) — the first version used an inner JOIN and missed that class;
   fixed on #3524 after adversarial review.

**Open product question (not decided):** delivery-only businesses (MEH-213) have no
primary row by design; when the fallback is removed they lose their hours display unless
hours get a home that is not a location row. Needs a ruling before the contract PR.

**Sequence:** #3524 → `count_hours_gap.py` = 0 on production → GREEN PR deleting
`hours.js:185-187` + its test cases + rewording markers 4–5. Column drop afterwards: RED,
own ticket, same pattern as B.

---

## D. MEH-2137 — `producers.top_product_name` (marker 9)

Superseded by `top_product_id` (`f4b1c8e0a297`). Still written and served. **No drop
ticket exists** — MEH-2137 itself does not resolve in Linear (archived-because-Done); one
must be opened before #3528 merges.

| Role | Location |
|---|---|
| WRITERS | owner PUT whitelist `producer_me.py:609` (free text); `_resolve_top_product` sync `:528, 544`; admin create `admin.py:571`; admin PUT setattr (`ProducerUpdate.top_product_name` `schemas.py:1960`); seeds |
| READERS | `producer_queries.py:134-138` overwrites the attribute from the FK at serialization; falls through to the column when FK NULL |
| Frontend | `ProducerSections.jsx:182` (`hasSignature` gate), `:206-208` (name-match fallback when `top_product_id == null`), `:322-347`; `ProducerDetail.jsx:215`; `ProducerCard.jsx:248`; dashboard `edit/page.js:537-835`; `ProductsSection.jsx:221, 231` |
| Frontend WRITER | `admin/ProducerForm.jsx:176, 324, 463, 1098-1099` |
| Contract | `producer_contract_snapshot.json:76,162`; `openapi.json` ×7; `api.zod.js` ×12 |

**Sequence:** YELLOW code PR closing free-text writers + removing the name-match
fallback, keeping the API field derived → **PR #3528** (held; input schema fields kept
declared and ignored server-side so `openapi.json` does not drift). Then RED drop, after
`top_product_name IS NOT NULL AND top_product_id IS NULL` reads 0 on production.

**Two rulings surfaced by #3528:** (1) stale name + NULL FK: PR removes the signature
*product*, keeps the *section*; hiding the block is a gate+serializer decision. (2)
Pre-existing gap: admin PUT writes `top_product_id` with no ownership check and no name
sync — candidate for its own card.

---

## E. MEH-2064 — `products.price_range` (marker 10)

Free-text `String(50)` superseded by `price_min/price_max` (`e4790e538aa2`, MEH-295).
Distinct from `producers.price_range` (`models.py:283`), which is canonical and stays.

| Role | Location |
|---|---|
| WRITERS | owner product create/update via `ProductCreate.price_range` `schemas.py:1585`, `ProductUpdate.price_range` `:1622`; `seed_data.py` ×6 |
| Frontend READERS (fallbacks) | `ProducerSections.jsx:269, :395`; `public/ProductSheet.jsx:299`; `public/RecipeDetail.jsx:192-193`; `ProductsSection.jsx:591-602` — **5 files / 6 sites** |
| Frontend WRITER | none |
| Contract | `openapi.json` ×10, `api.zod.js` ×25, `lib/schemas.js:95` |

**Sequence:** (1) count `price_range IS NOT NULL AND price_min IS NULL` on staging +
production — **never recorded**, and `e4790e538aa2:16-18` says there was deliberately no
backfill; (2) YELLOW PR removing the 6 fallbacks + 3 Pydantic fields + **regen of
openapi/Zod** (needs `orval` — not available in the cloud sandbox; local CC session);
(3) RED `[DESTRUCTIVE]` revision.

---

## F. MEH-1854 — legacy availability endpoints + two columns (marker 11)

`producer_me.py:859-876`: `POST /producers/me/availability` (`:898-941`) and
`POST /producers/me/availability-status` (`:952-993`) are the legacy write paths.
MEH-2271 already removed the dual-write; both endpoints now write `availability_state`
only. MEH-2273 deletes both endpoints and the columns; MEH-2272 removes the derived API
keys (`:938, 1093`, `producer_listing.py:732, 740`).

| Role | Location |
|---|---|
| ORM | `models.py:387` (`is_available_today`), `:391` (`availability_status`) — Python defaults still write both on INSERT |
| READERS (derived) | `ProducerListOut:2498, 2500` via `state_to_legacy` `:2675`; legacy filter `producers.py:162, 247` → `producer_listing.py:725-745` (logs `removed_in="MEH-2272"`) |
| Frontend | **0 readers, 0 callers** of the legacy endpoints; 7 fixture files carry the keys |
| Contract | `openapi.json` ×14 fields + 3 paths; `api.zod.js` ×24; `lib/schemas.js:280-281` |

**Sequence:** MEH-2272 (YELLOW, contract regen — local CC session) → MEH-2273 (RED:
endpoints + `drop_column` ×2 in one `[DESTRUCTIVE]` PR; remove `data_ownership.py:40`
and `ProducerUpdate:2033, 2067` + validator with it). Safest of the drops: columns are
write-dead since MEH-2271, desync measured 0/29 on staging 06/09. Read the deprecation
logs at `producer_listing.py:728-741` for external consumers before 2272.

---

## Suggested order (summary)

| Order | Chunk | Markers | Tier | Status 22/10 |
|---|---|---|---|---|
| 0 | Reword the two MEH-1855 docstrings | 1, 2 | GREEN | **#3523** |
| 1 | MEH-2272 contract keys | 11 (part) | YELLOW | needs regen — local CC |
| 2 | MEH-1938 5b code | 3 | YELLOW | **#3525** held |
| 3 | MEH-1938 hours write-through + gap count | 4–8 prep | YELLOW | **#3524** held (reviewed, 2 fixes) |
| 4 | MEH-1938 hours contract (delete the arm) | 4–8 | GREEN | after 3 = 0 on prod + delivery-only ruling |
| 5 | MEH-2137 free-text writers + fallback | 9 | YELLOW | **#3528** held; drop card to open |
| 6 | MEH-2064 code | 10 | YELLOW | needs regen — local CC |
| 7–10 | `[DESTRUCTIVE]` revisions, one per column set, each after ≥7-day soak + R2 ≤24h | 11, 3, 9, 10 | **RED — Sapir merges** | after 1–6 |

Every drop PR removes the model column in the same PR (`alembic check`) and the matching
`data_ownership.py` entry (`test_data_ownership.py:75`). No `EXPECTED_TABLES` change
anywhere. #3524 and #3525 both touch `upsert_primary_branch_location`'s signature —
whichever merges second needs a rebase.
