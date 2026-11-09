# MEH-1055 — pre-lock audit for the unanchored skills

**Status: CC half done — anchors computed, content audited. The lock write is
Sapir's.** CC deliberately did not run `backfill-skill-hashes.sh` and did not
edit `skills-lock.json`: it is the trust anchor of the skills supply chain, and
an agent that writes its own trust anchor removes a constraint rather than
adding one (workflow rule 32, and the card's own §"תיקון מדויק — CC לא נוגעת").

What follows is the evidence the card requires *before* any hash is frozen, plus
the four anchors ready to paste.

---

## 🔴 Headline — do not run the backfill blind. Two of the four would ratify unaudited content.

The card frames this as "add three missing lock entries." The measurement says
the number is **four**, and that **two of them cannot be locked on the strength
of the audit date they carry**. Locking a skill freezes its *current* content as
the audited truth; where content moved after the audit, the backfill silently
ratifies the drift — the MEH-1552 candidate-baseline trap, on a security surface.

| Skill | Verdict date in allowlist | Content last moved | Safe to lock now? |
|---|---|---|---|
| `grill-me` | 2026-07-09 | **2026-07-09** (`fe04fbfc`) | ✅ **Yes** — content is byte-identical to what was audited; never touched since |
| `backlog-groom` | 2026-08-09 | **2026-08-09** (`41a5775a`) | ✅ **Yes** — same day, single commit, never touched since |
| `mehamakor-dod` | 2026-07-09 | **2026-08-10** (`6dbf4e7b`) | ⛔ **No** — content is **four commits** past the audit |
| `grilling` | 2026-07-09 | **2026-07-23** (`c3d7ce88`) | ⛔ **No** — the audit date **predates the content by 14 days** |

### `grilling` — the audit date is not stale, it is impossible

`.claude/skills-allowlist.json` records `last_audit_date: 2026-07-09` for
`grilling`. The skill's content first landed on **2026-07-23** in `c3d7ce88`
("audit + install grilling from mattpocock/skills (MEH-1067) (#1546)"), and that
is its only commit.

**An audit cannot have been performed two weeks before the thing existed.** So
the date is not a stale-but-honest record of a real review — it is a value that
cannot describe any review of the shipped content. Whatever produced it copied
`2026-07-09` from its siblings. The `approved` verdict currently rests on it.

### `mehamakor-dod` — four commits past its audit

Created `2043e81f` (2026-07-09, the audited state). Modified since:

| Commit | Date | Subject |
|---|---|---|
| `e44ce793` | 2026-07-23 | honor rtl-allowlist path exceptions in `check.sh` step 4 (MEH-1513) |
| `d7d5e403` | 2026-07-23 | `rtl-scan.sh` allowlist uses fixed-string match; drop `check.sh` duplicate (MEH-1515) |
| `e1833848` | 2026-08-09 | vitest-guard — an exit-0 run that executed 0 tests now fails (MEH-1951) |
| `6dbf4e7b` | 2026-08-10 | name a downed Postgres instead of reporting it as a failing test suite (#2755) |

This skill ships an **executable** (`check.sh`), which is the category that most
needs an anchor and least tolerates one being frozen unreviewed. All four commits
look benign from their subjects and all four are ours — but "looks benign from
the subject line" is not an audit, and CC asserting one here would be the same
substitution the card is about.

> **Provenance note:** the working clone was **shallow**, in which `git log` names
> the graft commit as the origin of every file with no error or warning
> (workflow.md § Provenance, MEH-1519). Every date and SHA above was read after
> `git fetch --unshallow origin` (3,806 commits). Verified with
> `git rev-parse --is-shallow-repository` → `false`.

---

## 🔴 Second finding — it is four, not three, and that is the card's own thesis confirmed

The card measured **exactly three** unanchored skills on 07/08 and asked the
sharper question in its §"המסקנה לתיקון": *how did they get `approved` in the
first place — if the process lets the transitional verdict be skipped, the next
one inherits the same silence.*

**It did.** Measured 2026-08-12:

```
allowlist entries: 76 | lock entries: 72
missing from lock: ['backlog-groom', 'grill-me', 'grilling', 'mehamakor-dod']
```

`backlog-groom` was added on 2026-08-09 (`41a5775a`, MEH-1960) — **after** the
card was written — carrying `audit_verdict: "approved"` and no lock entry. Same
shape, same silence, one month later. It is the cleanest possible evidence that
the gap is in the *process*, not in three historical entries.

By `.claude/rules/skills.md`'s own verdict table, all four should read
`approved_local_unlocked` — the transitional verdict that exists for exactly
this state and starts a 30-day clock. Labelled `approved`, the clock never
starts, and the state announces itself nowhere.

**Also stale, as a consequence:** `.claude/rules/skills.md` opens with "75
allowlist entries covering 72 canonical skills plus 3 unmirrored directories."
Measured today: **76 / 72 / 4**. Not corrected in this PR — that file is a
security rules file and its numbers should be re-derived by whoever applies the
lock, in the same change.

---

## The anchors — computed, ready to paste

Produced with the repo's own tool, read-only:

```bash
bash .claude/scripts/compute-skill-hash.sh .claude/skills/<name>
```

| Skill | `computedHash` |
|---|---|
| `mehamakor-dod` | `6ac1cc219e406aea2cb38b2c794c6fcf9d347b17bd8eab081c898b9b772f8081` |
| `grill-me` | `2fe9f18df4f8153f3f2e7d9523a0969002d2010a2a5fefbaffc1dfed006e5ff8` |
| `grilling` | `d8e24653e7af00129e7e6a62a733c23d6ec990e6c5dadc0770e0bba7953d48f4` |
| `backlog-groom` | `cd2299d289c210e9f208a6a1234b6f4e6055cb51ec7cbd129f51500555721b10` |

**These are a cross-check, not the write path.** The sanctioned way to add them
is `backfill-skill-hashes.sh`, which computes the same values and writes them
atomically; `skills-lock.json` is never hand-edited
(`.claude/rules/skills.md` § Layer 4). If the backfill's output differs from any
row above, **stop** — that means content changed between this audit and the
lock, and the difference is the thing to look at.

Entry shape, from `skills-lock.json`'s existing rows:

```json
"grill-me": {
  "source": "mattpocock/skills",
  "sourceType": "github",
  "computedHash": "2fe9f18df4f8153f3f2e7d9523a0969002d2010a2a5fefbaffc1dfed006e5ff8"
}
```

`source` values to preserve (from the allowlist, unchanged by this work):
`mehamakor-dod` → `internal` · `grill-me` → `mattpocock/skills` ·
`grilling` → `mattpocock/skills` · `backlog-groom` → `internal`.

---

## Sapir's steps

**Step 1 — audit the two that need it, then lock all four.**

For `mehamakor-dod`, review the four diffs listed above:

```bash
git show e44ce793 -- .claude/skills/mehamakor-dod
git show d7d5e403 -- .claude/skills/mehamakor-dod
git show e1833848 -- .claude/skills/mehamakor-dod
git show 6dbf4e7b -- .claude/skills/mehamakor-dod
```

For `grilling`, the recorded audit cannot have covered the shipped content, so
read it fresh — it is third-party (`mattpocock/skills`) and anonymous-author
scrutiny applies (`.claude/rules/skills.md` § "When auditing skills manually"):

```bash
git show c3d7ce88 -- .claude/skills/grilling
```

**Step 2 — write the anchors (the only command that mutates the lock):**

```bash
bash .claude/scripts/backfill-skill-hashes.sh
```

**Step 3 — verify, exactly as CI does:**

```bash
bash .claude/scripts/audit-skills.sh --self-test     # must exit 1
bash .claude/scripts/audit-skills.sh                 # must exit 0
bash .claude/scripts/backfill-skill-hashes.sh --dry-run   # must exit 0
```

**Step 4 — the process fix, which is the part that stops this recurring.**
Locking four entries closes today's hole; it does not stop the fifth. The card's
own conclusion asks for this and `backlog-groom` proves it is needed. Options,
for your call — CC has not implemented any of them, since they are changes to
the guardrail layer and that is Sapir-only in both directions (rule 32):

- Make `audit-skills.sh` **fail** when an allowlist entry has
  `audit_verdict: "approved"` and no `skills-lock.json` row. That is the one
  mechanical check that makes the silence impossible, and it is additive.
- Or require new entries to start at `approved_local_unlocked`, so the 30-day
  clock actually starts and expiry forces the decision.

The first is preferable: it needs nobody to remember, and it fails loudly.

---

## What CC did not do, and why

- **Did not run `backfill-skill-hashes.sh`** and did not touch
  `skills-lock.json` — rule 32 / the card's explicit instruction.
- **Did not change any `audit_verdict` or `last_audit_date`** in the allowlist.
  Correcting `grilling`'s impossible date is a security-verdict edit, and it
  should be made by whoever performs the real audit, in the same change.
- **Did not migrate the skills to `.agents/skills/` + symlink.** The card's
  §"Prompt לClaude Code" describes that migration, but its 07/08 header
  supersedes it (*"הכרטיס נוסח כמיגרציית layout… זה לא מה שהוא"*) and reframes
  the card as a live trust-chain hole. Layout migration also changes what
  `compute-skill-hash.sh` sees — it refuses to hash a directory containing
  symlinks — so bundling it with the anchoring would move the content under the
  hash in the same commit that freezes it. **Anchor first, migrate separately.**
- **Did not fix the stale counts in `.claude/rules/skills.md`** (75/72/3 → 76/72/4).
  Same reason: re-derive them in the change that lands the lock, so the file and
  the anchor agree at one point in time.

---

## ✅ 09/11/2026 — re-audit, migration and lock (MEH-1055, under the 27/10 delegation)

**Authority:** the card's 27/10 header: Sapir delegated every decision («תכריע על כל הדברים… שום דבר לא עליי, אתה עושה הכל», 25/10), and the lock write moved to CC. This section is the evidence that header asks the PR to carry.

### Re-audit: read end to end, at the content being locked

Method: `.claude/rules/skills.md` § "When auditing skills manually" — every file read whole, checked for the six red-flag classes. The clone is not shallow (`git rev-parse --is-shallow-repository` → `false`).

| skill | files | what it does | red-flag classes | verdict |
|---|---|---|---|---|
| `mehamakor-dod` | `SKILL.md`, `check.sh` (173 lines) | Runs the repo's own toolchain: `npm run build`, `node scripts/vitest-guard.mjs`, `pytest tests/test_api.py`, `pg_isready`, `.claude/scripts/rtl-scan.sh`, `grep`. Writes only `/tmp/dod-*.log`, and only when explicitly run. | Shell to local tools only. No network, no `os.environ` / `process.env`, no credentials, no injection phrases. | **clean** |
| `grill-me` | `SKILL.md` (7 lines) | One line chaining to `/grilling` | none | **clean** |
| `grilling` | `SKILL.md` (12 lines) | Four prose paragraphs: an interview method | none | **clean** |
| `backlog-groom` | `SKILL.md` + `references/{verdicts,verification,lessons}.md` | Prose method, plus quoted read-only `git` commands for the operator | none (the quoted commands are documentation, not invoked) | **clean** |

**The two flags from 12/08 are resolved:**
- `mehamakor-dod` was "four commits past its audit". All four were read in their current form: MEH-1513/1515 (RTL delegation), MEH-1951 (vitest-guard) and #2755 (`pg_isready`).
- `grilling`'s audit date was older than its content. It has now been audited against the content itself (single commit c3d7ce88e, 2026-07-23).

### Hashes: written by the script, matching the 12/08 anchors

`backfill-skill-hashes.sh` computed and wrote the four hashes. The lock gained four entries with `source` / `sourceType` and an empty `computedHash`; the script filled the hashes. **All four equal the anchors computed independently on 12/08 (table above),** so the content has not changed since that audit, and the move to `.agents/skills/` did not change it either.

### CI stages, run locally

| stage | must | got |
|---|---|---|
| `audit-skills.sh --self-test` | exit 1 | **1** |
| `audit-skills.sh` | exit 0 | **0** (0 critical, 15 single-class warnings, as before) |
| `backfill-skill-hashes.sh --dry-run` | exit 0 | **0**: "All 76 hashes match" |

**The lock now protects them.** I added one byte to `grilling/SKILL.md` and ran `audit-skills.sh`. It answered `[HASH-DRIFT] grilling — content drifted from skills-lock.json`, exit 1. Before this change, the same edit had no anchor to drift from.

### Layout and allowlist

- All four skills moved to `.agents/skills/<name>/` (`git mv`, so the history follows). Each `.claude/skills/<name>` is now a symlink (`120000`) to `../../.agents/skills/<name>`, the same form as the other 72.
- Every reference in the repo uses `.claude/skills/<name>/…`, and those paths still resolve. `check.sh` stays executable through the symlink.
- Allowlist changes:
  - `last_audit_date` is now 2026-11-09 for all four, and each note records the re-audit.
  - `mehamakor-dod` and `backlog-groom` changed `source` from `internal` to `local`. That is the house value (`resolve-conflicts`), and the lock's `sourceType: "local"` matches it. The card named `mehamakor-dod`; `backlog-groom` is the same case, added after the card was written.
  - `grill-me` and `grilling` keep `mattpocock/skills` / `github`.

### The process gap, closed in the same PR

**How did a skill reach `approved` without a lock entry? Nothing checked for it.** This is the card's thesis, and `backlog-groom` reproduced it a month later. Three blind spots:
- Pass 1 scans only `.agents/skills/`, so a real directory under `.claude/skills/` is never pattern-scanned.
- Pass 2 accepts any valid verdict string.
- Pass 4 iterates the lock, so an unlocked skill has no hash that could drift.

`audit-skills.sh` gains **Pass 2b** (`pass2b_check`, also callable as `--pass2b-only ROOT [TODAY]`), and the new **`scripts/checks/skills-layout-guard.sh`** runs it in **Repo guards**, which feeds the required CI gate. The skills-audit workflow itself is not aggregated by any required gate, so a red there never blocked a merge (fresh review).

| tag | fires when |
|---|---|
| `[UNLOCKED]` | any verdict but `blocked` (or a live `approved_local_unlocked`) with no `skills-lock.json` entry — `review_needed` included, since Layer 5 locks at the first commit |
| `[UNLOCKED-NO-DATE]` / `[UNLOCKED-FUTURE]` / `[UNLOCKED-EXPIRED]` | `approved_local_unlocked` without a strict `YYYY-MM-DD` date (empty, null and relative dates like `tomorrow` all fail), dated in the future, or past 30 days. `skills.md` describes this clock; nothing enforced it until now. |
| `[NOT-CANONICAL]` | `.claude/skills/<name>` is a real directory, **or a symlink pointing anywhere but `../../.agents/skills/<name>`** (the harness would load content the lock does not hash) |

**The guard's self-test** runs the same function on 11 fixture trees, one per case, each with a known answer: clean, real dir, retargeted link, approved unlocked, review_needed unlocked, live clock, expired, empty date, null date, `tomorrow`, 2099. If any answer is wrong, the guard fails before it looks at the repo. Because it runs on every PR, the 30-day clock fires on the next PR of any kind; no schedule is needed.

**Shown failing:**

| run | result |
|---|---|
| Pass 2b against `origin/staging`'s tree (the four real, unlocked dirs) | 4 `[UNLOCKED]` + 4 `[NOT-CANONICAL]`, exit 1 |
| the old audit, same tree | 0 critical |
| guard with the symlink-target check removed | `retarget` case red |
| guard with the date-format check removed | `clock-empty`, `clock-null`, `clock-relative` red |
| guard with the lock required only for `approved` (this PR's first version) | `review-unlocked` red |
| this branch | 11/11 self-test, real repo clean |

*Correction to the sentence above "written by the script":* the backfill wrote the four **hashes**. The four lock entries' `source` / `sourceType` fields were added by hand first (with an empty hash), because `backfill-skill-hashes.sh` only updates entries that already exist.
