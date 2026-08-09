# Sweep session log — s9-v3xq8w (2026-08-09, continuous drain resume)

> As-of: 2026-08-09T13:3xZ. Every claim measured at that time; re-derive before acting.

**MEH-160 finished (blast radius closed, 7 readers not 3) · MEH-514 re-verified and
its unfinished half shipped · MEH-1952 matrix re-run from scratch · ORDERS gained the
enumerate-all-readers rule.**

---

## 1 · MEH-160 — the park is closed, and the park's own lesson was the deliverable

The mechanism was already verified; what was unfinished was **blast radius**. Round
one deduped three of `producer_page_views`'s readers and left three raw, with all six
on one dashboard screen.

### The reader table — now the required artefact, not a nicety

| # | Reader | `file:line` | Round 1 | Now |
|---|---|---|---|---|
| 1–3 | `profile_views` · `search_appearances` · `views_by_day` | `producer_me.py` | deduped | via the shared helper |
| 4 | `top_cities` (producer) | `producer_me.py:975` | **raw** | deduped |
| 5 | `rank_in_city` | `producer_me.py:758` | **raw** | deduped + LEFT-JOIN gate |
| 6 | `weekly_trend` / `prev_7d_views` | `producer_me.py:1043` | **raw** | deduped |
| 7 | `top_cities` (admin) | `admin_extra.py:808` | **raw** | deduped **+ `scope_col`** |

The expression now lives once, in `services/analytics.py` — the module that writes the
rows owns the grain they are read at.

### Three defects round one created, none visible on screen

- `weekly_trend` read **"down" on perfectly flat traffic** — deduped `last_7d` minus
  raw `prev_7d`, so only one side of the subtraction deflates. Permanent.
- `conversion_rate` returned **200%**, which MEH-1118's `clampPercent` rendered as a
  healthy 100. Wrong contract, right-looking screen.
- `test_analytics.py::_seed_view` gave every view the **same** hash, so the whole file
  described one visitor. That was the CI red *and* the thing blocking `top_cities`.

### The contract decision was settled by a fact, not a preference

`producer_whatsapp_clicks` has **no viewer hash** (only a nullable `user_id`), so the
numerator cannot be deduped to match without a schema change. The ratio is therefore
"clicks per 100 unique daily viewers", legitimately >100, and the copy says exactly
that in both locales. **The clamp is gone** — it was hiding the wrong contract. Both
options drafted on the card; not blocking.

### MEH-1557's C2 guard was one-directional and stayed green through its own inversion

It forbade any tooltip claiming per-day dedup, because the code was raw. It could
catch copy running *ahead* of the code, never copy left *behind* by it. Re-pointed
with both directions. Proven: against the old string the new assertions go red
(`expected '…כל כניסה נספרת…' to contain 'מבקרות שונות'`); the old assertion passes on
**both** strings, so it had zero discrimination.

### The discrimination check disproved my own claim — twice

Written into the class docstring as a table, because it is the part that generalises:

| Construction | Result |
|---|---|
| Round 1 raw readers | `top_cities` `assert 3 == 1` ❌ · `weekly_trend` `'down' != 'stable'` ❌ · **2 passed** |
| Round 2 without `row_id_col` | `assert 1 == 0` ❌ |
| Option B (raw denominator) | `assert 50.0 == 200.0` ❌ |
| Admin reader without `scope_col` | `assert 1 == 2` ❌ |

I had asserted all four new tests failed against round 1. **Two did not** — a
`func.count(id)` scores an outer-join phantom correctly, and round 1 had already
deduped the conversion denominator. Both were re-aimed at the rival they *do*
separate. One test is now labelled in its own docstring as a refactor anchor that
proves nothing about the dedupe.

### The reviewer found the one thing I got wrong in the fix itself

Different model, isolated worktree, told explicitly not to touch the tree — and it
didn't. **The admin `top_cities` query spans every producer**, so deduping on
`(day, hash)` alone counts *distinct people per city*: one visitor opening five Haifa
businesses in a day collapsed to one Haifa view, and the admin figure stopped being
the sum of the per-producer figures. **My comment two lines above claimed it was "the
same unit".** Fixed with `scope_col`, and the test that pins it closes a gap
`docs/qa/manual-testing-matrix.md` had already flagged as unasserted.

It also reported a failure of its own worth carrying: inside its worktree, `Read`
silently returned the **wrong branch's** content. It caught that from `git rev-parse`
disagreeing with the tip and redid every inspection through `git show <ref>:<path>`.

---

## 2 · MEH-514 — Canceled stands, but half its AC was outstanding

The verdict was re-derived against the card's own DoD rather than accepted.

**What held:** option א is the card's *own stated default* (*"עלות: אפס. זו ברירת
המחדל אם לא מכריעים"*). Choosing it was not agent invention.

**What did not:** א has **two** acceptance criteria — close as Won't Do **and**
document the alternative in `security.md`. Only the first was done. The deferral
reason, *"repo read-only in this session"*, described that session, not the work:
`.claude/rules/*.md` is LOW-RISK CC-editable per `workflow.md`, and the hard deny
covers `.claude/settings.json` + `.claude/hooks/**`. **PR #2725 merged (`5f88da25`) is
the empirical proof**, verified by reading the file back off `origin/staging`.

Re-derived, not trusted: `check-bash-safety.sh:58` `continue`s on any `^git[[:space:]]`
segment, so the hook provably cannot see the command; and `grep` confirmed the
alternative was documented nowhere before the commit.

---

## 3 · MEH-1952 — the matrix is being re-run, because s8's was never committed

The prior session reported `EventExperienceAddress` 0/10 and `CityProfileBridge` 1/10,
but **no artefact of that run exists in the repo** — `grep -rn CityProfileBridge
docs/overnight/` returns nothing. Under the anti-stale rule that is an uncited claim
about the past, so it is being re-measured rather than re-pointed on trust.

**The first probe was broken and reported a clean matrix.** `--reporter=basic` is not
a valid vitest 4 reporter: 8 runs exited 1 having never started, and the script
printed eight tidy rows with `EEA=0 CPB=0`. Exactly the shape `.claude/rules/testing.md`
warns about — a probe whose reassuring output is an artefact of how it was asked.
Caught by validating it on a run whose answer was already known (a full green suite),
which is the cheap check that should precede any matrix.

Re-run in progress at write time on `staging`-tip. Runs 1–2: **2567 passed, both files
green.** Verdict deferred to the full matrix; a partial run is not evidence of absence.

---

## 4 · ORDERS gained item 8 — enumerate every reader of a shared source

The lesson MEH-160 paid for, written where the next session reads it:

> Changing how a SHARED data source is read means enumerating EVERY reader before the
> merge — by grep on the table or field name, not from memory — and stating, per
> reader, whether it changed and why. **A partial conversion is not a smaller version
> of the change; it is a new inconsistency, and it ships looking finished.**

With the part that made it survive self-check: round one ran the two obviously-related
test files, saw green, and read that as coverage. **Those files could not have
failed** — they exercise the readers that *were* converted. Running the probe that
cannot fail is item 7 wearing work clothes.

---

## 5 · Anti-stale gate paid immediately

The prompt's queue list is a photograph, as ORDERS §5 says. Measured against live
Linear: **MEH-1964, 1963, 1955, 1950, 1951, 1948 are already Done.** MEH-1964 in
particular was fully shipped in PR #2723 while the prompt still listed it as queued.

---

## In-flight ledger

| PR | MEH-XX | pushed | gate state | next revisit |
|---|---|---|---|---|
| #2725 | MEH-514 | 13:11Z | **MERGED** 13:17Z · verified on `origin/staging` | closed |
| #2721 | MEH-160 | 13:23Z | ready-for-review; review round pushed; required gates re-running on `36777fa8` | on gate completion |
| — | MEH-1952 | — | matrix ×8 running locally, 2/8 green | matrix completion |

**Vercel on #2721 reads `failure`:** `api-deployments-free-per-day`, the account quota.
No commit fixes it, it resets daily, and it is not a required check (ORDERS §3.2).
Named rather than left as an unexplained red.

---

## 6 · Process notes

**`git checkout --` ate an uncommitted fix again — s8's incident, my hand, second
occurrence.** Restoring a rival construction reverted the `scope_col` fix, which was
not yet committed. Caught within seconds by grepping for the marker immediately after
the recovery command, which is precisely what s8's lesson prescribes. **The lesson
worked; the habit that causes it has not changed.** The durable fix is to commit
before building any rival, not to remember harder — and that ordering is what the next
session should adopt.

**A subagent in a worktree is still a concurrent reader of `git` state.** The
reviewer's `Read` returning another branch's file is the read-side twin of s3's
write-side incident. Anything a worktree agent reports about file contents should come
from `git show <ref>:<path>`.
