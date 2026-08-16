# P5/8 — Code quality: complexity · duplication · god files · dead code

> Pass 5 of the **MEH-1721** audit epic. **Read-only** — this report measures
> maintainability debt; it refactors nothing. Per the ticket's
> over-engineering guard, a finding here is **a metric and a location**, not a
> proposed restructure.

---

## 1 · Snapshot

| | |
|---|---|
| **Audited tree** | `origin/staging` @ `829dc028` (P4 merge) |
| **Tools actually run** | `radon` 6.0.1 · `jscpd` (frontend + backend) · `knip` · `vulture` 2.16 |
| **Python blocks analysed** | 800 |
| **Average cyclomatic complexity** | **A (3.38)** |
| **Blocks at C or worse** | 37 · **at D or worse: 6** |
| **Duplication** | frontend **0.18 %** · backend **0.19 %** |
| **Files > 300 LOC** | **79** · over 500 LOC: **34** |

Unlike P3 and P4, this pass had **every tool it needed**: `radon` and
`vulture` installed via pip, `jscpd` via npx, `knip` already in the repo. Nothing
in §2–§6 is a static guess — each number is tool output, reproduced in §8.

**The headline numbers are good.** Average complexity A, and duplication under
0.2 % on both halves of the codebase, are healthy figures — a SonarQube-style
gate would pass this repo on both. The findings below are concentrations, not a
systemic problem.

---

## 2 · Findings summary

| ID | Sev | Finding | Fix | Tier |
|---|---|---|---|---|
| F-1 | 🟠 High | `schemas.py` — 3,405 LOC, maintainability index **0.00**, **+231 % in 90 days** | L | 🟡 |
| F-2 | 🟡 Med | `register_producer()` — 331 lines, **CC 38** (highest in repo), builds `Producer(...)` twice | M | 🟡 |
| F-3 | 🟡 Low | Order-window concept spread over 4 surfaces with a duplicated day-key list | S–M | 🟢 |
| F-4 | ⚪ Info | 79 files > 300 LOC (34 > 500) | L | 🟡 |
| F-5 | ⚪ Info | Dead-code scan: 34 unused exports, 3 "unused" files — **1 verified false positive** | S | 🟢 |

**"High" on F-1 means maintainability risk, not a live defect.** Nothing in this
pass is a bug; nothing is exploitable. The severity is about the cost of the
*next* change to these files.

---

## 3 · Complexity

`radon cc` over `app/` — 800 blocks, **average A (3.38)**. Only **6** blocks
score D or worse:

| CC | Rank | Location |
|---|---|---|
| **38** | E | `backend/app/routers/auth.py:404` `register_producer` |
| **31** | E | `backend/app/routers/producer_me.py:650` `producer_analytics` |
| 27 | D | `backend/app/services/producer_listing.py:264` `_apply_scalar_filters` |
| 27 | D | `backend/app/routers/admin_extra.py:608` `get_dashboard` |
| 23 | D | `backend/app/routers/auth.py:855` `register_producer_oauth` |
| 21 | D | `backend/app/routers/auth.py:1314` `delete_account` |

Next tier (CC 12–15, grade C): `producer_import.py:205` · `search.py:84` ·
`producer_recipes.py:231` · `alerts.py:266` · `admin.py:216` ·
`oauth_verifiers.py:158` · `google_rating.py:132` · `schemas.py:34` ·
`schemas.py:1535` · `users_me.py:42` · `upload.py:66` · `admin_outreach.py:62` ·
`admin.py:816` · `startup.py:39`.

**Three of the six worst are in `auth.py`** — `register_producer` (38),
`register_producer_oauth` (23), `delete_account` (21). That concentration is the
real signal, not the individual scores.

`_apply_scalar_filters` (27) is worth a word of defence: it is a filter
dispatcher, so its branch count *is* the feature count. High CC there is
inherent to the shape, not accidental — the kind of case the ticket's
"metrics in context" framing is about.

### F-2 🟡 Med — `register_producer()`: 331 lines, CC 38, and the only backend clone

`backend/app/routers/auth.py:404-735`. Highest complexity in the codebase, and
`jscpd` found **exactly one** duplicate block in the entire backend — **inside
this one function**:

```
routers/auth.py:510  <->  routers/auth.py:625      48 lines
```

Both blocks are a full `Producer(...)` constructor with the same ~20-field list
(`name`, `description`, `short_description`, `city`, `address`, `lat`, `lng`,
`phone`, `instagram`, `website`, …). The function builds a producer **twice**,
in two branches, each spelling out every field.

That single fact explains all three metrics at once: the length, the CC score,
and the duplication. It also carries a concrete risk — **a new column added to
`Producer` must be added in both places**, and nothing enforces it. A field
added to only one branch produces a producer that is correct when registered one
way and incomplete when registered the other.

**Fix M** (hoist the field mapping into one helper both branches call).
🟡 YELLOW — `auth.py` is security-adjacent, so per `.claude/rules/security.md`
any change here needs the CVE check and chunked review; this is not a
drive-by cleanup.

---

## 4 · God files

**79 files exceed 300 LOC; 34 exceed 500.** The 15 largest:

| LOC | File |
|---|---|
| **3,405** | `backend/app/schemas/schemas.py` |
| 1,957 | `frontend/app/[locale]/producer/dashboard/edit/cards.jsx` |
| 1,680 | `backend/app/models/models.py` |
| 1,471 | `backend/app/routers/auth.py` |
| 1,398 | `backend/app/routers/producer_me.py` |
| 1,368 | `frontend/app/[locale]/producer/dashboard/edit/page.js` |
| 1,291 | `frontend/app/[locale]/register/producer/RegisterProducerClient.jsx` |
| 1,064 | `frontend/components/admin/ProducerForm.jsx` |
| 907 | `frontend/app/[locale]/producer/dashboard/page.js` |
| 891 | `frontend/components/MapComponent.jsx` |
| 861 | `backend/app/routers/admin.py` |
| 859 | `frontend/components/ProducersClient.jsx` |
| 834 | `backend/scripts/seed_demo_business.py` |
| 809 | `backend/app/routers/admin_extra.py` |
| 778 | `frontend/app/[locale]/settings/page.jsx` |

Tests, migrations, `node_modules` and `.next` are excluded.

### F-1 🟠 High — `schemas.py` is not just large, it is accelerating

This is the one finding where the **trend** carries the severity, exactly as the
ticket's §2 asks ("complexity rising over time worries more than stable high
complexity"). Measured from `git show` at four points on `staging`:

| | `schemas.py` | `auth.py` |
|---|---|---|
| 90 days ago | 1,027 | 1,082 |
| 60 days ago | 1,717 | 1,286 |
| 30 days ago | 2,066 | 1,376 |
| **now** | **3,405** | **1,471** |
| **90-day growth** | **+231 %** | +36 % |
| **last 30 days** | **+65 %** | +7 % |

`schemas.py` more than **tripled in 90 days**, and over half of that growth
landed in the last month. `auth.py` — a file three of the six worst functions
live in — grew 36 % over the same window, which is ordinary feature accretion.
The two are on completely different trajectories.

`radon mi` puts `schemas.py` at **maintainability index 0.00** — the floor of
the scale, and the only file in the codebase below grade A. The rest of the
worst-ten are A: `producer_me.py` 21.92, `auth.py` 28.17, `admin.py` 36.80,
`admin_extra.py` 38.15.

**Why this is High and F-4 is Info:** a 900-line router is a known, stable cost.
A file that tripled in a quarter, sits at the floor of the maintainability scale,
and is the single module every request and response shape passes through is a
different kind of risk — the next 90 days at this rate puts it past 10,000 lines.

**Fix L**, and deliberately not specified further. Splitting `schemas.py` is a
multi-PR structural change touching every router's imports; proposing a shape
for it inside an audit pass is exactly what the over-engineering guard forbids.
The finding is the **trajectory**, and it wants its own ticket. 🟡 YELLOW.

### F-4 ⚪ Info — the other 78

Recorded as inventory, not as 78 findings. Several are legitimately large:
`models.py` (38 tables in one module — the *intended* single table authority,
per MEH-267), `MapComponent.jsx` (one cohesive Leaflet integration), the two
`seed_demo_*` scripts (data, not logic). The dashboard-edit pair
(`cards.jsx` 1,957 + `page.js` 1,368 = 3,325 LOC across two files for one
screen) is the frontend concentration most worth a look, but sizing that work
needs a design view this pass does not have.

---

## 5 · Duplication

`jscpd`, min 25 lines / 120 tokens.

| | Lines scanned | Clones | Duplicated lines | **%** |
|---|---|---|---|---|
| frontend | 88,114 | 4 | 159 | **0.18 %** |
| backend | 24,996 | 1 | 47 | **0.19 %** |

Both are low by any standard. Every clone found:

| Lines | Location | Verdict |
|---|---|---|
| 48 | `auth.py:510` ↔ `auth.py:625` | **F-2** — the real one |
| 47 | `HoursEditor.jsx:173` ↔ `OrderWindowEditor.jsx:134` | **F-3** |
| 39 | `app/[locale]/[slug]/page.js:39` ↔ `app/[locale]/producer/[id]/page.js:29` | two routes to the same producer page; shared metadata/JSON-LD head. Structural, low value to merge |
| 27 | `privacy/page.js:75` ↔ `terms/page.js:68` | legal-page boilerplate. Benign |
| 50 | `package-lock.json` ↔ `package.json` | scanner noise, not code |

### F-3 🟡 Low — the order-window concept lives on four surfaces

Not a single duplicate but a scattered one, and it is the clearest instance of
the ticket's "same problem solved differently in different places":

| Surface | What it owns |
|---|---|
| `frontend/lib/order-window.js` (3.4 KB, 2 consumers) | editor ↔ backend JSONB serialization |
| `frontend/lib/orderWindow.js` (7.3 KB, 5 consumers) | open / closing-soon / closed status + display ranges |
| `HoursEditor.jsx:173` | 47 lines shared with ↓ |
| `OrderWindowEditor.jsx:134` | …this |

The two `lib/` modules have **genuinely different responsibilities**, so this is
not a "delete one" case — and it would be wrong to report it as one. But two
things are real:

1. **The weekday list has two owners.** `ORDER_WINDOW_DAYS`
   (`order-window.js:21`) and `ORDER_DAY_KEYS` (`orderWindow.js:27`) are
   **byte-identical** seven-element arrays. That is Smell #1 from
   `.claude/rules/workflow.md` — two parallel mechanisms owning one fact, each
   working fine on its own, drift invisible until it bites.
2. **The filenames differ only by casing convention** — `order-window.js` vs
   `orderWindow.js` in the same directory. Independently of the duplication,
   that is a trap for anyone importing by memory.

**Fix S** for the shared constant, **M** for the editor clone. 🟢 GREEN
(pure frontend, no schema, no auth). Related open work: **MEH-1691 / PR #2351**
("state the order window once on the producer page") is in the same domain —
worth checking for overlap before opening anything new, per Rule 27.

---

## 6 · Dead code

### F-5 ⚪ Info — and the false-positive rate is the finding

`knip` (frontend) reports **34 unused exports**, **3 unused files**, 1 unused
dependency, 1 unlisted. `vulture` (backend, ≥ 90 % confidence) reports 113 items.

**Per the ticket's calibration clause, everything here is "suspected dead,
verify before removal" — and verification changed the answer three times.**

**1 · `components/HomepageMiniMap.jsx` — knip says unused. It is live.**

```
app/[locale]/page.js:31   const HomepageMiniMap = dynamic(() => import("@/components/HomepageMiniMap"), {…})
app/[locale]/page.js:96   <HomepageMiniMap />
```

Knip does not resolve the `dynamic(() => import(...))` form, so a component that
is rendered above the fold on the **homepage** reads as an unused file. Deleting
it on the tool's say-so would remove the homepage map. This is the single most
important line in this report: the other two "unused files"
(`lib/env.server.js`, `lib/useFirstVisit.js`) are **unverified** and must get
the same treatment before anyone touches them.

**2 · "Unused export" ≠ "unused code".** Knip flags `ORDER_DAY_KEYS`
(`orderWindow.js:27`) as an unused export — accurate, and harmless: the constant
is used three times *inside its own module* (`:85`, `:158`, `:174`). Only the
`export` keyword is unnecessary. The same applies to the
`components/ui/index.js` entries (`EmptyState`, `Popover`, `Tooltip`,
`BackLink`): the **barrel re-export** is unused because consumers import
directly — `EmptyState` from 10 files, `Popover` from 4. The components are
very much alive. Reading that list as "4 dead UI components" would be exactly
backwards.

**3 · `vulture` is not usable on this codebase without a whitelist.** All 113
of its 100 %-confidence hits are `unused variable 'cls'` in
`schemas.py` — `cls` is a **required parameter** of every Pydantic
`@field_validator` `@classmethod`. Zero of the 113 are real. Lowering the
threshold to 60 % yields 613 items, i.e. more noise. Recorded so nobody re-runs
it and treats the output as a work list.

**Commented-out code: none found.** A heuristic scan flagged 21 blocks of ≥ 5
consecutive code-shaped comment lines; the three largest
(`auth.py:1365`, `models.py:170`, `admin.py:374`) are all **prose
documentation** — explanatory comments citing `file:line` references and column
names, which is why a regex looking for `(`, `:`, `.` matched them. This repo has
an unusually high explanatory-comment density, and the heuristic mistook that
for dead code. **Not reported as a finding.**

---

## 7 · Not measured

- **Frontend cyclomatic complexity.** `radon` is Python-only; no JS complexity
  reporter was run, so §3's numbers cover `backend/` only. The frontend's
  contribution to §4 is LOC-based.
- **`cards.jsx` growth trend.** `git show` at 30/60/90 days returned nothing at
  that path — the file was created or moved inside the window, so no trend line
  exists for the second-largest file. Only `schemas.py` and `auth.py` have
  verified trends.
- **Test-code quality.** `tests/`, `e2e/` and `__tests__/` were excluded per the
  ticket's scope. P6 (MEH-1730) owns that.
- **Whether any "unused export" is safe to delete.** 34 were reported; **2 were
  verified** (§6). The remaining 32 are unverified and carry the same
  false-positive risk that caught `HomepageMiniMap`.
- **Duplication below 25 lines / 120 tokens.** Smaller repeated idioms exist
  (§5's day-key list is 9 lines and was found by hand, not by `jscpd`).

---

## 8 · Appendix — commands and raw output

```
$ python3 -m radon cc app/ --total-average
800 blocks (classes, functions, methods) analyzed.
Average complexity: A (3.37875)
blocks at C or worse: 37   (D or worse: 6)

$ python3 -m radon mi app/ -s          # worst 10
app/schemas/schemas.py            C (0.00)
app/routers/producer_me.py        A (21.92)
app/routers/auth.py               A (28.17)
app/routers/admin.py              A (36.80)
app/routers/admin_extra.py        A (38.15)
app/routers/whatsapp_webhook.py   A (43.45)
app/routers/home_products.py      A (43.57)
app/routers/reviews.py            A (48.13)
app/routers/group_buys.py         A (51.12)
app/services/producer_listing.py  A (51.37)

$ npx jscpd --min-lines 25 --min-tokens 120   (frontend)
lines 88,114 · tokens 415,762 · clones 4 · duplicatedLines 159 · 0.180 %

$ npx jscpd --min-lines 25 --min-tokens 120 --format python app/   (backend)
lines 24,996 · clones 1 · duplicatedLines 47 · 0.188 %
  48 lines | routers/auth.py:510 <-> routers/auth.py:625
            (both inside register_producer(), lines 404-735)

$ npx knip --reporter json
files with issues 19 — exports 34 · files 3 · dependencies 1 · devDependencies 1 · unlisted 1

$ python3 -m vulture app/ --min-confidence 90 | wc -l
113        # all "unused variable 'cls'" — Pydantic validator signatures, 0 real

$ git show <sha>:backend/app/schemas/schemas.py | wc -l
90d 1027 → 60d 1717 → 30d 2066 → now 3405        (+231 %)
$ git show <sha>:backend/app/routers/auth.py | wc -l
90d 1082 → 60d 1286 → 30d 1376 → now 1471        (+36 %)

files >300 LOC: 79   |   >500 LOC: 34
```
