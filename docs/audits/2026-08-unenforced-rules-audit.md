# סקירת כללים-בלי-אכיפה — 2026-08-07

> **בעברית, בקצרה:** יש בריפו **תשעה כללים** שהאכיפה היחידה שלהם היא שסשן יזכור לקרוא
> אותם. שלושה מהם יושבים **בתוך הקובץ שמגדיר שהדפוס הזה הוא באג** (`workflow.md`,
> Smell #2). זה הממצא. הטבלה למטה היא התוצר; הכרטיסים הם רק המעקב.
>
> פריט אחד ברשימה **אינו** תזכורת שנשכחה אלא **חור פתוח בשרשרת אמון** — שלושה skills
> מסומנים `approved` בלי עוגן hash. הוא הועלה ל-pre-launch ומשויך לספיר (MEH-1055).

**Scope:** every `.claude/rules/*.md` and the always-loaded `CLAUDE.md`, cross-referenced
against every mechanical enforcement surface in the repo.
**Method:** enforcement inventory first, then rule-by-rule. Claims marked *verified* were
checked with a command; claims marked *inferred* rest on absence from the inventory.
**Trigger:** two confirmed instances in one week of a lesson living only in prose — the
alembic head count (below) and the staging-freshness rule, which #2630 made mechanical.

---

## The finding

`.claude/rules/workflow.md` § *Architectural smell detection (MEH-271)* defines the class:

> **Smell #2 — "Remember to update X when you change Y" in docs.**
> *Signal: any sentence in `CLAUDE.md` or `.claude/rules/` that says "remember to update
> X", "keep X in sync with Y", or "also update X after changing Y" — this is a docs patch
> over a missing enforcement mechanism.*

It then gives two examples of the smell — and **both of its own examples are live rules in
that same file**:

| Smell #2's example | Where it actually lives | Enforced? |
|---|---|---|
| *"After changing `backend/app/models/`, update `docs/DATA.md`"* | workflow.md **rule 11** | ❌ |
| *"After changing auth routes, update `.ai/diagrams/auth-flow.md`"* | workflow.md **rule 12** | ❌ |

A third instance sits alongside them: **Bug Protocol 2b** (regenerate VRT baselines in the
same PR). So the file that names the smell, prescribes the remedy, and instructs you to
*"keep the note in place until the ticket ships"* — carries three unshipped instances of it.

**This is not a gotcha.** The doctrine is correct and the diagnosis was right the first
time. What it demonstrates is the thing the doctrine itself asserts: **writing a rule down,
even writing down that writing-it-down is insufficient, does not enforce it.** The rule
survived because it was never converted, and nothing in the repo notices that.

### The proof, from this week

`docs/MIGRATIONS.md` § *ספירת ראשים — `alembic heads` בלבד. לא grep.* was written on
**06/08**. It names the trap, the mechanism, and the exact file — a `down_revision` line in
a **docstring**, as unquoted prose, above the real assignment:

```python
"""
down_revision = a9f2c7d41b6e (MEH-1490 ...) — the single     # <- line 24, PROSE
"""
down_revision: Union[str, None] = "a9f2c7d41b6e"             # <- line 38, REAL
```

On **07/08** — the next day — a different session wrote that same regex, on that same file,
and reported **two heads on a healthy chain**. The doc was correct, complete, and sitting
in the repo. It changed nothing, because reading it was optional.

That instance is now closed by `scripts/checks/alembic-head-guard.sh` (PR #2653). It is the
template for the rest: **a rule you have to remember is a rule that fails.**

---

## The tier table

Ranked by (cost of forgetting) × (cheapness of mechanising).

### 🔴 Tier 1 — convert these

| # | Rule | Source | Status | Ticket |
|---|---|---|---|---|
| 1 | **code change → doc/diagram update in the same PR** | workflow.md rules 11–12 | *verified* — no guard, hook or job | [MEH-1927](https://linear.app/mehamakor/issue/MEH-1927) |
| 2 | **VRT baselines regenerated in the SAME PR** when a `he.json` value on a covered route changes | workflow.md Bug Protocol 2b | *verified* — none. Compounded by `maxDiffPixelRatio: 0.02`, which lets a whole copy change pass green | [MEH-1928](https://linear.app/mehamakor/issue/MEH-1928) |
| 3 | **`CLAUDE.md` ≤ 80 lines** | CLAUDE.md § *How to update this file* | *verified* — none. **78/80 today.** The rule says "measure with `wc -l`, never from memory", then relies on memory | [MEH-1929](https://linear.app/mehamakor/issue/MEH-1929) |
| 4 | **3 skills `approved` with no hash anchor** | skills.md | *verified live* — 75 allowlist entries, 72 locked. **Not a forgotten reminder — an open hole.** See below | [MEH-1055](https://linear.app/mehamakor/issue/MEH-1055) |

### 🟠 Tier 2 — mechanisable with real effort

| # | Rule | Source | Status |
|---|---|---|---|
| 5 | **every new guard test shown failing** (+ the construction must *discriminate*) | testing.md MEH-1619 | *verified* none. **Promoted to enforcement** → [MEH-1930](https://linear.app/mehamakor/issue/MEH-1930) |
| 6 | CVE web-search when `auth.py` / `upload.py` / permissions change | security.md, rule 5a | *inferred* none — stays prose |
| 7 | Zod validation before consuming an API response | workflow.md rule 19 | *verified* — no eslint rule exists — stays prose |
| 8 | 401/403/409 guard tests must send schema-valid payloads | workflow.md regression rule 6 | *inferred* none — stays prose |
| 9 | Conditional-UI 5-state matrix (0/1/many × open/closed) | CLAUDE.md | *verified* none — stays prose |

**Only #5 was promoted.** 6–9 stay prose by decision, not by oversight: their false-positive
cost is high relative to what a diff-shape check can actually see.

### ⚪ Tier 3 — accept as prose

Rule 27 (search Linear first) · rule 22 (copy approval) · file-preservation's *"before
correcting a document, prove the document is wrong"* · *"a paginated listing is evidence of
presence, never of absence"* · all of `meta-patterns.md`.

`meta-patterns.md` is the honest one, and worth quoting because it is the correct posture
for this whole tier:

> *Compliance note: prose rules in this file are advisory. Claude may ignore them. Rules
> that require 100% enforcement belong in `.claude/hooks/` or CI, not here.*

A rule that **declares** itself advisory is not the failure mode. The failure mode is a rule
that reads as binding and isn't.

---

## Item 4 is a different animal

Everything else here is a reminder nobody enforces. This one is a **live gap in a guarantee
the repo believes it has**.

| skill | `audit_verdict` | in `skills-lock.json` |
|---|---|---|
| `mehamakor-dod` | `approved` | **no** |
| `grill-me` | `approved` | **no** |
| `grilling` | `approved` | **no** |

Layer-4 hash enforcement iterates `skills-lock.json`. A skill absent from it has **no trust
anchor at all** — its content can change post-audit with no `[HASH-DRIFT]`, and CI stays
green. That is precisely the guarantee MEH-420 was built to provide after MEH-402 found
`computedHash` was decorative metadata no script read.

Worse: by `skills.md`'s own semantics these should carry `approved_local_unlocked`, a
transitional verdict that starts a **30-day clock** from `last_audit_date` (all three:
`2026-07-09`, so it would have expired **08/08/2026**). Labelled `approved`, **the clock
never started** — which is worse than holding the transitional verdict, because the state
looks final and healthy.

**CC touched nothing here.** `skills-lock.json` is the trust anchor, and an agent writing
its own trust anchor defeats its purpose (rule 32). Remediation is in MEH-1055, Sapir's.

---

## Enforcement inventory (what does exist)

For contrast, and so the next audit can diff against it.

| Surface | Count | Notes |
|---|---|---|
| `scripts/checks/*.sh` | 12 | discovered by `run-all.sh` under **Repo guards** — a new guard is a file drop, no workflow edit |
| `.claude/hooks/` | 12 | PreToolUse; `settings.json` `permissions.deny` is the real boundary |
| `scripts/` validators | 4 | `check_api_contract.py`, `check_env_drift.sh`, `validate-registry-paths.py`, `audit-skills.sh` |
| vitest contract tests | 2 | `LabelScopeContract`, `NoEmojiInComponents` |
| pre-commit | 4 hooks | `ruff`, `ruff-format`, `validate-registry-paths`, `eslint` — *verified*, that is the whole list |

**`scripts/checks/` is why Tier 1 is cheap.** `.github/workflows/**` is CC-deny (MEH-671),
so guards used to be bottlenecked on one person. They are not any more — items 1–3 are each
a few lines in a file drop.

---

## Method, and what this audit cannot tell you

- **Verified** items were checked with a command against the working tree. **Inferred** items
  rest on absence from the inventory above — and *absence in a search is weaker than presence*
  (CLAUDE.md § *Any paginated listing is evidence of PRESENCE, never of ABSENCE*). An inferred
  "no guard" could be a guard I failed to grep for.
- **Two probes in this audit returned confident wrong answers and were caught by validation,
  not by review.** A `delivery_cities` grep at whole-tree scope implied a release breach that
  did not exist (the gate is per-revision, and the column is pre-existing on `main`); and a
  JSON reader auto-detected the wrong container in `skills-allowlist.json` twice, reporting
  three entries `ABSENT` that are present. Both are recorded because a withdrawn finding is
  evidence the probe was checked and a silent one is not.
- **This audit is itself prose.** It enforces nothing. Its value expires the moment the tier
  table stops matching the repo — so treat the table as an as-of, and re-derive before acting
  on any row.

---

## Cross-references

`.claude/rules/workflow.md` § *Architectural smell detection (MEH-271)* — the doctrine ·
`.claude/rules/testing.md` § MEH-1619 and § *A green that has two possible causes is not a
signal* · `docs/MIGRATIONS.md` § *ספירת ראשים* · `docs/audits/silent-failure-audit.md` ·
`scripts/checks/README.md` — the guard-authoring contract.

> **Note for whoever adds the pointer from `.claude/rules/workflow.md` § Smell #2 to this
> file:** that edit is Sapir's. `.claude/rules/**` is RED for CC, so this audit could not
> link itself from the rule it is about — which is, appropriately, one more thing that
> depends on a human remembering.
