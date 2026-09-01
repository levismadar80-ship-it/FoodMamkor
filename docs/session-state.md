# Session state — 2026-09-01, drain טז' (session `0113JYkWvGYY…`)

> This file was **stale by six days** when this window opened — it still described
> the 26/08 batch. That is the same failure the window itself was called to fix:
> a state document nobody rewrote reads exactly like a state document that is
> current. Rewritten in full.

**One line:** every one of the five briefed items turned out to rest on a premise
that had already moved, and the window's real output is the corrections plus two
instruments that can now see what they could not.

---

## STEP 0 — the reporter lied, and it said `control: ok` while doing it

`bash scripts/wake-when.sh` on the container **as handed over**:

```
2 OPEN · 5 parked · 0 satisfied · 5 skipped · 1 void
```

Void. Two independent instrument faults, both caught before the numbers were used:

1. `--self-test` **FAILED 1/11** — `baseline_drift()` blind on a shallow clone.
2. `git fetch origin staging` → `+ 17011b6...826b6df (forced update)` — the ref
   was **four commits stale**.

After `git fetch --unshallow origin` and the fetch, self-test is 11/11 and the
true reading is `0 OPEN · 7 parked · 1 satisfied · 0 void`. Three verdicts flipped:

| row | as handed over | true |
|---|---|---|
| MEH-1855 ch2 | **OPEN** `now=0` | parked `now=1` |
| MEH-1915 s1 | **REGRESSED** — "CODEOWNERS is GONE" | SATISFIED — it is on the base |
| MEH-1694 B | VOID | parked, 77 commits |

**The shallow half had a detector; the staleness half had none.** `control: ok`
printed in both runs, because it asked whether `$REF` *resolves*, never whether
it is *current*. Closed in PR #3260.

> **For the next session, this is the operative line:** run
> `git fetch --unshallow origin && git fetch origin staging` **before** STEP 0,
> or read the new `currency:` line and believe it.

---

## What a new session must know

1. **Three of the five briefed items were duplicate or already-refuted work, and
   none of them announced it.** The pattern is not carelessness in the briefs —
   it is that a card's own description is an append-only claim that rots (rule 34),
   and every one of these was measured false against live state in minutes.

2. **MEH-2189 chunks B and C are both MERGED** (`1144a656`, PR #3115). The 8
   archetype rows are in `seed_demo_producers.py` (`sdot-zahav` …
   `maadaniyat-ben-shemen`) and `frontend/e2e/flows/35-archetype-channel-smoke.spec.ts`
   exists. **Nothing was re-run.** What is missing is unchanged and is Sapir's:
   `python -m scripts.seed_demo_producers --confirm` on Railway. Until that runs,
   "8 live demo pages" is false and the smoke has nothing to measure.

3. **MEH-1976's card is wrong on its face and was not corrected for three weeks.**
   Its 11/08 table says items 1 and 2 "❌ do not exist". Both are on staging
   (`scripts/ops/cloudinary-export.py`, `docs/runbooks/MEDIA-RESTORE.md`, PR #2780);
   item 3 shipped in #2757. **All three deliverables are code-complete.**
   `--self-test` → *"OK — 17 assertions, 7 of them against real account data"*, exit 0.
   **The gap is not code. There is no backup.** No export has ever run; the three
   `CLOUDINARY_*` vars are unset here (`--dry-run` exits 3) and the script writes
   outside the repo by design. A script that can take a backup is not a backup.

4. **MEH-2226 is a permanent workaround, now written into the repo** as
   `.claude/rules/workflow.md` rule 35 — it had lived only on the card, which is
   why it kept reading like a bug someone would fix. It will not be fixed: the
   mangling layer is outside the repo, with controls in both directions.

5. **⚠️ Both claims the brief carried about dependabot were false, in opposite
   directions. Do not re-inherit either.**
   - `#2943` / `#2129` ignores **ARE in effect** — Sapir posted them clean on
     30/08 at `08:23:10Z` / `08:23:17Z` and dependabot acknowledged 3-4 seconds
     later (*"won't notify you about version 5.x.x / 7.x.x again"*).
   - **`#2940`'s `recreate` DID take.** *"edited by someone other than Dependabot"*
     was dependabot's documented reply to **`rebase`**, and it names `recreate` as
     the remedy in the same sentence. `recreate` was issued and worked — branch
     retargeted `73.0.0 → 74.0.0`, head `46dce07c`, fresh CI 11:15Z.
   - What IS true: `#3079`'s park was misattributed. Its only command was the
     mangled one, and dependabot **never replied at all**.

6. **`docs/MIGRATIONS.md` asserted the opposite of the code, at line 4, in the
   file a migrations author reads first.** It said `create_all` "was removed from
   the boot path in MEH-267". It is at `startup.py:150`. MEH-267 removed
   `_migrate_columns()`; ADR-003 §Consequences **retained** `create_all`
   deliberately; MEH-352 (27/04, *after* MEH-267) **added** it. Corrected here.

7. **MEH-2219 chunk 2 cannot be executed as written, and that is the Phase 0
   finding — not a scheduling note.** Its acceptance criteria require a test that
   boot completes with `create_all` monkeypatched to raise. `tests/test_lifespan_init.py`
   is the MEH-352 regression test and requires the exact opposite: it drops every
   table and asserts the lifespan repopulates them. Both cannot hold while
   `_run_db_init_sync` is the only schema path at boot, and the chunk's own
   over-engineering guard forbids the obvious reconciliation ("no boot-time
   alembic invocation from Python"). Removing the call also reverses two locked
   decisions — ADR-003 and `docs/REFACTOR_PLAN.md:306` (*"leave behind … do not
   touch this block"*). **This needs a decision, not an implementation.**

---

## Next 3

1. **Sapir** — `seed_demo_producers --confirm` on Railway (MEH-2189), and the two
   `@dependabot` commands are **done**, nothing pending there any more.
2. **Sapir** — decide MEH-2219 chunk 2: it contradicts ADR-003 as specified. Either
   amend the ADR or close the chunk. CC cannot resolve a locked-decision conflict.
3. **CC** — MEH-2107 is unblocked, `cc-queue`, High, and untracked since 01/09. It
   now carries the first `UNSTART` row. Its title still says `[חסום ע"י MEH-1906]`,
   which is false.

## PRs this window

| PR | What | Notes |
|---|---|---|
| #3260 | `scripts/wake-when.sh` — currency control + `UNSTARTED` verdict + 3 rows | self-test 11 → 17, shown failing 3/17 against the wrong implementation |
| (this) | rule 35, `MIGRATIONS.md` correction, STATE + logs | docs-only |

## Guards

18 ran, **0 fail**, 4 warned — `claude-md-line-cap`, `dnm-matcher`, `israel-clock`,
`openapi-codegen-drift`. All four measured present on a clean `origin/staging`
with the diff stashed; none is this window's.

## No preview

Neither PR carries `[preview]` in a commit message, so `frontend/vercel.json`'s
`ignoreCommand` skips the build (MEH-1900). That is the configured behaviour —
`Ignored`, **not** rate-limited, and not a fault. No preview URL is reported,
because none rendered this diff (rule 9).
