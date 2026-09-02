# Data ownership registry — one fact, one owner

For every fact the product states about a business, this file names **the
canonical field**, **the single editor allowed to write it**, and **the stale
aliases that must not be written**. It is the prose half of a pair: the
machine-checkable half is `backend/app/data_ownership.py`, and
`tests/test_data_ownership.py` fails if a closed field becomes owner-writable
again.

> **Why a registry rather than comments.** The dispositions existed — they were
> spread across inline comments in `producer_me.py`, ticket descriptions, and
> two audit docs. Spread-out truth is not a source of truth: MEH-1959 carried a
> claim that was already false when it was written and survived **two**
> refutations because both lived in comment threads nobody re-reads
> (workflow.md rule 34). One table, one guard.

## How to read a row

- **Canonical field** — where the value lives. A reader that needs this fact
  reads here, or reads a resolver that prefers here.
- **Single editor** — the one surface allowed to write it. "admin / import"
  means the owner cannot, by design; the column stays because those paths do.
- **Deprecated aliases** — still present, still readable, **not** to be written
  by the owner. Each carries the ticket that removes it.
- **Contract ticket** — who finishes the Expand-Contract (ADR-007). A dated
  `LEGACY(YYYY-MM-DD, MEH-XXXX)` marker in the source is what makes the
  deadline enforceable, via `scripts/checks/legacy-expiry-check.sh` (MEH-1857).

## The registry

| Fact | Canonical field | Single editor | Deprecated aliases (do not write) | Contract |
|---|---|---|---|---|
| **Where the business is** | `producer_locations` rows (`kind`, `lat`, `lng`, `city`, `address`, `is_primary`) | owner — `LocationsEditor.jsx` | `producers.address` (owner path closed, MEH-1856); `producers.lat`/`lng` (owner path closed, MEH-1938 chunk 5a; no reader falls back to them since the same chunk; `ProducerListOut.lat/lng` are derived from the `is_primary` row or null — same rule as `primaryPoint()` on the frontend, STRICT by ruling 02/09; `LEGACY(2026-10-15)` on the columns; drop is chunk 5b) | MEH-1938 |
| **Which town it is listed under** | `producer_locations.city` of the **primary** row | owner — `LocationsEditor.jsx`; `producers.city` follows automatically | `producers.city` as an independently-edited value (owner path on `PUT /producers/me` closed, MEH-1938 chunk 5a — ruling A, 02/09) | MEH-2141 |
| **When it is open** | `producer_locations.opening_hours` of the primary row | owner — `LocationsEditor.jsx` | `producers.opening_hours` (owner path closed, MEH-2142; read fallback behind `LEGACY(2026-10-01, MEH-1938)`) | MEH-1938 |
| **Whether it is kosher** | `producers.kashrut_verified_at` + the certificate (badge flow) | admin — verification, per חוק איסור הונאה בכשרות | `producers.kosher` free text (owner path closed, MEH-2143; no consumer surface has rendered it since MEH-986) | — |
| **What it costs** | `products.price_min` / `price_max` | owner — product form | `products.price_range` free text · `producers.starting_price_label` (owner path closed, MEH-1851; `LEGACY(2026-09-01, MEH-1855)`) | MEH-2064 · MEH-1855 |
| **Whether it is taking orders** | `producers.availability_state` (4-value, MEH-291) | owner — `POST /producers/me/availability-state` | `producers.is_available_today` (owner PUT path closed, MEH-1851) · `producers.availability_status` | MEH-1854 |
| **Whether you can collect in person** | `producer_locations.kind in ('pickup','market_stand')` | owner — `LocationsEditor.jsx` | `producers.pickup_points` boolean (owner path closed, MEH-1856) | MEH-2060 |
| **Which product is featured** | `producers.top_product_name` **today** | owner — dashboard | — *(see the note below: `top_product_id` is the incoming canonical, not yet the canonical)* | MEH-2137 |
| **The business's public URL** | `producers.slug` | admin / system | owner writes (closed, MEH-1856 — an owner edit silently breaks every shared link) | — |
| **The business's name** | `producers.name` | admin — with re-moderation | owner writes (closed, MEH-1851 — a DNA-LOCK hole, not a missing feature) | MEH-1872 |
| **Dietary scope of the business** | `producers.vegan_scope` / `vegetarian_scope` / `gluten_free_facility` | owner — `DietaryScopeCard.jsx` | `producers.lactose_free_facility` (closed, MEH-1856 — its question was cut: `DietaryScopeCard.jsx:17` "Does NOT: … touch lactose", and `:79` leaves it at the DB default) | — |

### The featured-product row is deliberately not what it looks like

`producers.top_product_id` landed in MEH-2137 chunk 1/3 as the **expand** step,
and `models.py` says so at the column: *"top_product_name is NOT deprecated by
this commit — it stays the sole writer and reader until the switch step."* So
the canonical field for that fact is still the **name** today. Recording the id
as canonical here would be documenting an intention as a fact, and the next
reader would inherit it as one. The row moves when chunk 2 switches the readers.

## The rule this registry encodes

> **A field whose owner write path is closed stays closed until its editor
> ships in the same PR.**

Closing a write path is not a deprecation of the column. Admin, the XLSX
import and the seeds keep writing every field above; historical values are
still read and still served. What is closed is the one path where the API
accepted a value that **no owner UI could produce**, or that **no consumer
surface would ever render** — a value the owner had no way to see the effect
of. That is the shape MEH-1851 catalogued and MEH-1856 started closing.

`backend/app/data_ownership.py` holds those fields; the guard test asserts the
set does not intersect `_PRODUCER_WRITABLE_FIELDS`. The guard is a fitness
function, not a lock: re-adding a field is allowed, and the condition is that
its editor ships alongside and its row here moves with it.

## What this file does NOT do

- It does not enforce expiry dates. `LEGACY(YYYY-MM-DD, MEH-XXXX)` markers in
  the source do, through `scripts/checks/legacy-expiry-check.sh` (MEH-1857).
  Extending a date is a human decision made in a reviewed PR — never a
  side effect of touching a row here.
- It does not police admin or import writes. Those are the reason the columns
  exist.
- It is not a schema reference. `docs/DATA.md` owns the columns and endpoints;
  this file owns *who may write which one*.

## Cross-references

- `docs/MIGRATIONS.md` — the Expand-Contract workflow and the LEGACY convention
- `docs/decisions/ADR-007-expand-contract-schema-changes.md` — the pattern
- `backend/app/routers/producer_me.py` — `_PRODUCER_WRITABLE_FIELDS`, with the
  per-field dispositions inline
- `tests/test_meh1856_closed_write_paths.py` and its per-field siblings — the
  behavioural half (the endpoint really ignores these); this registry is the
  structural half (they cannot come back unnoticed)
