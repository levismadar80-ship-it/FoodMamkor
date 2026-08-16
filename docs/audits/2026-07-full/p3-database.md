# P3/8 — DB: Alembic chain · indexes · N+1 · constraints

> Pass 3 of the **MEH-1721** audit epic. **Read-only** — this report maps the
> DB layer; it changes no schema, adds no revision, and touches no model.
> Any fix arising from a finding here is **RED** (schema change → Alembic
> revision + explicit approval, per MEH-267) and belongs to a separate ticket.

---

## 1 · Snapshot

| | |
|---|---|
| **Baseline SHA** | `114e4c847617495a71058e180007797dfc83533f` (`114e4c84`) — pinned by the epic |
| **Audited tree** | `origin/staging` @ `5aa959ce` |
| **DB-layer drift vs baseline** | **none** — `git diff 114e4c84..origin/staging -- backend/app/models/ backend/alembic/` is empty |
| **Alembic revisions on disk** | 48 |
| **Tables declared in models** | 38 (37 `__tablename__` + 1 association `Table()`) |
| **Clone depth** | not shallow (`git rev-parse --is-shallow-repository` → `false`) |

The DB layer is **byte-identical** between the pinned baseline and current
`staging`, so every statement below describes both. (`backend/` as a whole
drifted by 2 files — `router_registry.py`, `admin_outreach.py` — neither under
`models/` or `alembic/`.)

### What was measured vs. what was inferred

**Alembic is not installed in the CC sandbox**, so `alembic heads` and
`alembic check` could **not** be run here. The head, root, orphan and
reachability numbers below come from an **AST parse of all 48 revision files**
(`revision` / `down_revision` assignments, merge tuples handled) — a graph
computation over the same data Alembic reads, not Alembic's own output. CI runs
the real thing on every backend PR (`alembic upgrade head` + `alembic check`,
`pr-checks.yml`), which is the authoritative signal.

**No database was available**, in the sandbox or otherwise (the production URL
is deny-listed for CC sessions, MEH-408). So **no finding here carries a query
plan**, and no table row-counts inform severity. Per the ticket's calibration
clause, every index finding is stated as **"suspected by static read"** and
severity is capped accordingly. An index gap on a 200-row table costs nothing;
the same gap at 200k rows is a page-load regression. **That multiplier is
unmeasured, and it is the single largest source of uncertainty in this pass.**

---

## 2 · Findings summary

| ID | Sev | Finding | Fix | Risk tier |
|---|---|---|---|---|
| F-1 | 🟡 Med | 17 FK columns carry no usable index; Postgres does **not** auto-index FKs | S–M | 🔴 RED (schema) |
| F-2 | 🟡 Low | `reports.py:103-105` — 2 queries per flagged producer (N+1) | S | 🟡 YELLOW |
| F-3 | 🟡 Low | `onboarding_followup.py:343` — per-candidate `User` lookup (N+1), compounded by F-1 | S | 🟡 YELLOW |
| F-4 | ⚪ Info | 66 columns are defaulted-but-nullable; one proven live NULL path | S | 🔴 RED (schema) |

**0 critical.** The four checks the ticket named as the pass's spine — chain
integrity, `EXPECTED_TABLES` drift, FK `ondelete` coverage, and eager-loading on
the consumer list paths — all came back **clean**, with numbers, in §3–§6.

---

## 3 · Alembic chain — clean

Graph over all 48 revisions:

| Property | Result |
|---|---|
| Roots (`down_revision = None`) | **1** — `ef8fb1858f5b` (`20260424_0815_..._baseline.py`) |
| Heads (no child) | **1** — `e8d4a2f6c9b3` (`20260727_1500_..._merge_meh1651_meh1577_heads.py`) |
| Orphans (`down_revision` naming an unknown id) | **0** |
| Reachable from root | **48 of 48** |
| Merge revisions | **3**, each closing exactly one fork |

The root matches the `ef8fb1858f5b` the ticket names as the baseline, and the
single head means no divergent branch is sitting unmerged on disk.

All three forks are properly closed:

| Fork point | Branches | Closed by |
|---|---|---|
| `c5e1a9d7f2b4` | `a3f1c9d2e4b7` (MEH-1291) · `f3a8c2d61e9b` (MEH-1297) | `b7e2a4c9d1f6` |
| `d7b2f4a9c6e1` | `e4a9c1f7b2d3` (MEH-1541) · `f4a1e9c3b7d2` (MEH-1543) | `b9d3f1a7c2e4` |
| `b9d3f1a7c2e4` | `c7e2a4f9b1d6` (MEH-1651) · `c7e2a4b91f38` (MEH-1577) | `e8d4a2f6c9b3` |

Three forks in ~10 days is the signature of concurrent feature branches each
adding a column to `producers`, then being merged. That is the intended
workflow, and the empty-merge-revision form it produces is explicitly sanctioned
(ADR-025 amendment, 18/07/2026).

> **A parser caveat worth recording**, because it produced a wrong answer before
> it produced the right one. A regex over `^down_revision\s*=` reported **8
> heads and 4 orphans** on this same tree — all false. Two causes: merge
> revisions assign a *tuple* of parents, and one revision
> (`d51508a7c9e2`) discusses its own `down_revision = a9f2c7d41b6e (…)` **inside
> its module docstring**, which the regex matched as an assignment. The AST
> parse resolves both. Noting it because "8 heads" is exactly the kind of
> alarming-looking number that gets escalated before it gets verified.

---

## 4 · `EXPECTED_TABLES` drift — none

`pr-checks.yml:354` pins `EXPECTED_TABLES=38` and compares it against
`information_schema.tables` after `alembic upgrade head` (excluding
`alembic_version`).

Counted from the models: **37** `__tablename__` declarations in
`app/models/models.py` + **1** association table (`producer_recipe_products`,
declared via `Table()` at `models.py:1504`) = **38**. Exact match, no drift.

No other module declares a table (`grep __tablename__` outside `models.py`
returns nothing), so `models.py` is the sole table authority — consistent with
MEH-267 having made Alembic the sole *schema* authority.

**The gate is stronger than a count.** `pr-checks.yml:377-379` also runs
`alembic check`, which diffs `Base.metadata` against the migrated schema — so
the "column added to a model without a paired revision" class is caught even
though the table *count* is unchanged. That covers the drift direction a bare
count would miss, and it is why §5's index inventory can be trusted: an index
declared in `__table_args__` but absent from migrations (or vice versa) would
red the gate. Verified by hand as well — the 40 `op.create_index` calls across
the revisions correspond to the model declarations, with no index existing only
in a migration.

---

## 5 · Indexes

### F-1 🟡 Med — 17 FK columns with no usable index

**Postgres does not create an index on a foreign-key column automatically**
(unlike MySQL/InnoDB). A declared `ForeignKey` gets a constraint, not an index.
Of **44** FK columns in `models.py`, **23** carry no `index=True`; applying the
leading-column rule to the composite and unique indexes that do exist, **6 of
those are in fact covered** and **17 are not**.

**Covered after all** — leading column of a composite/unique index, so a plain
equality lookup is served:

`alert_log.user_id` · `favorite_alerts.user_id` · `home_product_ratings.click_id` ·
`producer_followers.user_id` · `producer_reviews.producer_id` · `reports.reporter_id`

**Uncovered (17)** — grouped by why, with the number of `.filter()` /
join references each column has in `app/`:

| Column | `models.py` | Why uncovered | refs |
|---|---|---|---|
| `products.producer_id` | 552 | leading col of a **partial** index — see below | 7 |
| `users.producer_id` | 409 | no index at all | 8 |
| `reports.producer_id` | 920 | 2nd col of `UNIQUE(reporter_id, producer_id)` | 7 |
| `home_products.user_id` | 856 | no index at all | 5 |
| `delivery_areas.producer_id` | 614 | no index at all | 5 |
| `events.producer_id` | 975 | no index at all | 4 |
| `producer_reviews.user_id` | 1128 | 2nd col of `UNIQUE(producer_id, user_id)` | — |
| `producer_followers.producer_id` | 830 | 2nd col of `UNIQUE(user_id, producer_id)` | 3 |
| `favorite_alerts.producer_id` | 746 | 2nd col of `UNIQUE(user_id, producer_id)` | 3 |
| `alert_log.producer_id` | 799 | 2nd col of `ix_alert_log_cap_lookup` | — |
| `experiences.host_user_id` | 1036 | no index at all | 1 |
| `home_product_ratings.user_id` | 1157 | no index at all | — |
| `home_product_ratings.home_product_id` | 1160 | no index at all | — |
| `home_product_whatsapp_clicks.user_id` | 953 | no index at all | — |
| `home_product_whatsapp_clicks.home_product_id` | 956 | no index at all | — |
| `kashrut_badge_requests.reviewed_by` | 1431 | no index at all | — |
| `reports.resolved_by` | 938 | no index at all | — |

**`products.producer_id` is the one to look at first, and not because of its
ref count — because it is a trap.** An index named `idx_products_dietary`
exists on exactly that column (`models.py:599-607`), so a reader checking
"is `products.producer_id` indexed?" sees an index on `producer_id` and moves
on. It is **partial**:

```
Index("idx_products_dietary", "producer_id",
      postgresql_where=text("is_gluten_free OR is_vegan OR is_vegetarian OR is_lactose_free"))
```

It serves the MEH-293 dietary EXISTS-subquery it was built for and **not** a
plain `WHERE producer_id = :id` — which is how the producer detail page loads a
catalog. The gap is invisible at a glance in a way the plain-missing ones are not.

**Suspected by static read.** No query plan, no row counts (§1). On today's data
volume several of these may be seq-scanned faster than indexed, and Postgres
would ignore the index anyway. What this finding establishes is *which* columns
have no index available if the planner wanted one — not that any query is
currently slow.

**Fix:** S per column (`index=True` + a revision), M as a batch. **RED** — every
one is a schema change requiring its own Alembic revision and explicit approval.
Triage should pick from this table by measured table size, not take it wholesale.

### `producers.status` — deliberately not raised as a finding

`Producer.status == "approved"` gates **every** public listing
(`producer_listing.py:132, 137, 187, 193`) and is referenced 34× across `app/`.
`producers.status` (`models.py:78`) has **no index**, and no migration creates one.

That combination looks like the headline finding of this pass. It is not, for
two reasons that survived checking:

1. **`status` is low-cardinality** (`pending` / `approved` / `rejected` / …) and
   the overwhelming majority of rows are presumably `approved` — the case where
   a btree is *correctly* ignored in favour of a seq scan. A plain
   `index=True` here could easily be dead weight.
2. **The hot query is `WHERE status='approved' ORDER BY created_at DESC`**, and
   `idx_producers_created_at` (`models.py:371`) already exists to serve that
   ordering.

The genuinely better shape is a composite `(status, created_at)` or a partial
index on `status = 'approved'` — but choosing between them needs a query plan
and a row count, neither of which this pass has. Raising "add an index on
`status`" from a static read would be a recommendation that might measurably
make things worse. **Recorded as unmeasured, deliberately not a finding.**

### Indexes that are present and well-shaped

Worth stating, since the section is otherwise a gap list:
`ix_alert_log_cap_lookup(user_id, producer_id, channel, sent_at)` and
`ix_contact_clicks_producer_at(producer_id, clicked_at)` are composite in the
query's own column order; `idx_producers_availability_state` and
`ix_producer_recipes_published_moderation` are partial on the selective side of
a skewed column. These are deliberate, not incidental.

---

## 6 · N+1

### The consumer list paths are clean

The ticket asked specifically about N+1 "in list pages (producers, events,
reviews)". Those paths **eager-load**: `producer_listing.py` uses
`selectinload` ×7 and `joinedload` ×6; `producers.py` 8+3, `events.py` 7,
`reviews.py` 7, `experiences.py` 6. The hot listing query
(`producer_listing.py:178-189`) pulls `categories`, `products`,
`delivery_areas` and `locations` in one shot. Exactly one relationship in
`models.py` sets an explicit `lazy=` (`"select"`), out of 47.

**So the class the ticket was aimed at is already handled.** The two findings
below come from elsewhere — an admin route and a background job.

An AST sweep over `app/` for ORM calls inside loop **bodies** (excluding the
loop's own iterable, which is one query, not N) found 14 sites. Most are
bounded and fine:

- `admin_extra.py:359, 364, 739` — fixed `range(5, -1, -1)`; 12 queries, constant.
- `admin_extra.py:492` — bounded by `DEFAULT_SETTINGS` keys.
- `auth.py:541, 656` — per `category_id`, and `category_ids` is **capped at ≤3**
  by `_cap_categories_validator` (MEH-1297). Bounded at 3. *This one was worth
  checking rather than assuming: an uncapped list on the registration endpoint
  would have made it a request-amplification finding rather than a non-issue.*
- `onboarding_followup.py:333` — one candidate query per entry in
  `_FOLLOWUP_STEPS`, a 4-element module constant. Bounded at 4.
- `whatsapp_webhook.py:427` — bounded by users sharing one phone number.
- `producer_import.py:258` · `admin.py:838` — per-row work in an explicit
  import/bulk path, inherent to dedupe and to `ON CONFLICT DO NOTHING`.

### F-2 🟡 Low — `reports.py:102-105`, 2 queries per flagged producer

```
routers/reports.py:102   for producer_id, report_count in results:
routers/reports.py:103       producer = db.query(Producer).filter(Producer.id == producer_id).first()
routers/reports.py:105       reports  = db.query(Report).filter(Report.producer_id == producer_id, ...).all()
```

The outer query already groups open reports by `producer_id`; the loop then
issues 2 queries per group. Unbounded by data — it scales with the number of
producers holding an open report.

Admin-only surface, so the blast radius is one admin page, which is why this is
Low and not Med. **Fix S:** one `Producer.id.in_(ids)` fetch plus one
`Report.producer_id.in_(ids)` fetch, grouped in Python — 2 queries total instead
of 2N. **YELLOW** (router logic, no schema change).

### F-3 🟡 Low — `onboarding_followup.py:341-343`, per-candidate user lookup

```
services/onboarding_followup.py:341   for p in candidates:
services/onboarding_followup.py:343       user = db.query(User).filter(User.producer_id == p.id).first()
```

One `User` query per eligible producer, per followup step, in the scheduled
followup job. Background rather than request-path, hence Low.

**It compounds with F-1**: `users.producer_id` is one of the 17 uncovered FK
columns, so each of these N lookups is the case with no index available. The
two findings are individually minor and share a single fix site — worth
triaging together rather than separately.

**Fix S:** one `User.producer_id.in_([p.id for p in candidates])` fetch into a
dict before the loop. **YELLOW**.

---

## 7 · Constraints

### FK `ondelete` — 44 / 44

Every one of the 44 `ForeignKey(...)` declarations in `models.py` specifies
`ondelete`. Zero exceptions. This is the check most likely to turn up something
in a codebase this size, and it is clean.

### `producers` CHECK constraints

Three are declared (`models.py:379-393`): `producer_location_mode`,
`delivery_nationwide_xor_cities`, `delivery_excluded_requires_nationwide`. The
MEH-272 comment above them records why they exist in the ORM at all — two had
been created by the removed `_migrate_columns()` raw SQL and so were missing on
freshly-bootstrapped DBs while present on prod/staging. That is the MEH-265/267
failure mode, already closed.

### F-4 ⚪ Info — 66 defaulted-but-nullable columns, one proven live NULL path

**66 columns** declare a Python-side `default=` but carry neither
`nullable=False` nor `server_default`. The default is applied by the ORM, so any
write path that does not go through the ORM leaves the column NULL — while
application code treats it as always-present.

Named because the app's own reads assume a value:
`producers.status` (78) · `producers.avg_rating` / `reviews_count` (264-265) ·
`users.role` (408) · `users.is_blocked` (416) · `home_products.moderation_status`
(888) · `producer_reviews.is_hidden` (1133) · `experiences.status` (1065).

**How much of this is live, measured rather than assumed:** `app/` contains
exactly **one** raw-SQL write site —

```
routers/admin.py:839   text("INSERT INTO cities (name_he, lat, lng) VALUES (…) ON CONFLICT (name_he) DO NOTHING")
```

— and `cities.created_at` (`models.py:41`) is `default=datetime.utcnow`,
nullable, no `server_default`. **Every city imported through that admin endpoint
therefore has `created_at = NULL`.** That is a demonstrated instance, not a
hypothetical one. Its consequence today is **nil**: `grep` finds no reader of
`cities.created_at` anywhere in `app/`.

That is the honest shape of this finding — a real class, with exactly one
currently-reachable instance, and that instance harmless. The security-relevant
columns (`users.role`, `users.is_blocked`, `moderation_status`) are **not**
reachable by any raw-SQL path in the app; they are written through the ORM,
which supplies the default. `seed_data.py` sets `status` and
`moderation_status` explicitly.

The exposure that remains is **future**: the next raw INSERT, bulk import, or
`psql` fix-up against a table in this list silently produces a NULL in a column
the app reads as a value. Three-valued logic then makes both `= 'approved'` and
`<> 'approved'` exclude the row — the row becomes invisible to SQL-side filters
in *both* directions, while Python-side comparisons on the same field
(`None != "approved"` → `True`) go the other way. A row that is hidden by one
layer and visible to the other is the expensive version of this bug.

**Fix S** per column (`server_default` + backfill + `nullable=False`), and it is
**RED** — schema change, one Alembic revision each, Expand-Contract for the
NOT NULL step (ADR-007). Deliberately **not** proposed as a 66-column sweep;
per the ticket's over-engineering guard, a triage would pick the handful whose
NULL would change a visibility or permission decision.

---

## 8 · Not measured

Stated explicitly so nothing here is mistaken for a clean result:

- **No query plans.** No `EXPLAIN`, no `pg_stat_user_indexes`, no row counts —
  no DB was reachable (sandbox has none; production is deny-listed, MEH-408).
  Every index statement in §5 is a static read of declarations.
- **`alembic heads` / `alembic check` not run here** (alembic not installed in
  the sandbox). §3 is an AST computation over the revision files; CI runs the
  real commands on every backend PR.
- **Index *bloat* and unused indexes not assessed.** This pass looks only for
  missing indexes. An index that exists and is never used costs write
  throughput, and that direction was not examined at all.
- **Downgrade paths not tested.** `downgrade()` bodies were not executed or
  reviewed for correctness; only the `revision` / `down_revision` graph was read.
- **`producer_locations` (MEH-1388) not assessed for its future shape.** The
  epic ticket notes P3 would illuminate dependencies there; the table exists and
  is indexed on `producer_id` and `city`, but the multi-branch schema work that
  epic implies is not evaluated here.
- **Table sizes, and therefore the real cost of every §5 finding.** This is the
  gap that most limits the pass, and it cannot be closed from a CC session.

---

## 9 · Appendix — commands and raw results

### Revision graph (AST over all 48 files)

```
total revisions: 48
roots:  [('ef8fb1858f5b', '20260424_0815_ef8fb1858f5b_baseline.py')]
HEADS:  [('e8d4a2f6c9b3', '20260727_1500_e8d4a2f6c9b3_merge_meh1651_meh1577_heads.py')]
orphans: []
merge revisions: 3
    b7e2a4c9d1f6 <- ('a3f1c9d2e4b7', 'f3a8c2d61e9b')
    b9d3f1a7c2e4 <- ('e4a9c1f7b2d3', 'f4a1e9c3b7d2')
    e8d4a2f6c9b3 <- ('c7e2a4f9b1d6', 'c7e2a4b91f38')
reachable from root: 48 of 48
UNREACHABLE: []
```

### Table count

```
models.py __tablename__ count: 37
sa.Table(...) definitions: ['producer_recipe_products']
                                          -> 38   (pr-checks.yml:354 EXPECTED_TABLES=38)
grep __tablename__ outside app/models/models.py  -> (no results)
```

### FK `ondelete`

```
ForeignKey( occurrences:            44
  ... containing ondelete:          44
FKs WITHOUT ondelete:               (none)
```

### Baseline drift

```
$ git diff --stat 114e4c84..origin/staging -- backend/app/models/ backend/alembic/
(empty)

$ git diff --stat 114e4c84..origin/staging -- backend/
 backend/app/router_registry.py        | 28 ++++++++++++++++++++++++++++
 backend/app/routers/admin_outreach.py | 13 +++++++++++--
 2 files changed, 39 insertions(+), 2 deletions(-)

$ git rev-parse --is-shallow-repository
false
```

### N+1 sweep (loop bodies only)

```
14 sites; triage in §6.
app/routers/admin.py:838 · admin_extra.py:359,364,492,739 · auth.py:541,656
reports.py:103,105 · whatsapp_webhook.py:427
services/onboarding_followup.py:333,343 · producer_import.py:258
```

### Raw-SQL write sites in `app/`

```
app/routers/admin.py:839  INSERT
total: 1
```
