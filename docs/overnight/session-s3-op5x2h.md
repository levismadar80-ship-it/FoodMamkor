# Sweep session log — s3-op5x2h (2026-08-08 evening)

> As-of: 2026-08-08T17:15Z. Every claim below is measured at that time; re-derive
> before acting on any of it.

**1 merged, 0 PRs awaiting, 0 parked, 0 quarantined, 2 claimed-elsewhere, staging GREEN at
`9bfa470c`.**

---

## The headline: the orders' "immediate backlog" was already empty

`<authority>` opened with "IMMEDIATE BACKLOG OF WAITING PRs — clear it first: merge
#2677 and #2683 … #2665 … #2680". **All four were already merged before this session
started**, verified against the API rather than inferred:

| PR | Orders said | Live state (17:00Z) |
|---|---|---|
| #2665 | run copy self-check, merge | **merged** 2026-08-08T11:08:29Z by sapirschnapp |
| #2680 | decide א/ב/ג, merge | **merged** 2026-08-08T10:26:44Z by sapirschnapp |
| #2677 | merge after self-check | not in the open list; staging carries the work |
| #2683 | merge after self-check | same |

Staging had moved from the orders' snapshot to `d5d05344`, four commits past
`9764c45a` (the commit that landed ORDERS.md itself). This is the exact failure the
anti-stale gate exists for, and it is the second sweep running to hit it — night 1
found 4/8 seed items already done. **The orders' queue list should be treated as a
hint, never as state.**

`docs/overnight/ORDERS.md` already exists on staging and is current, so the
`<bootstrap>` step was a no-op.

---

## MERGED

### PR #2695 — MEH-1945, FilterSheet sticky apply footer on mobile → `9bfa470c`

Both required gates green (`CI gate` ✓, `Deploy gate` ✓). Post-merge verified by
reading the file back off `origin/staging`, not by trusting the merge event: both
`sticky bottom-0 -mx-4` and `data-testid="filter-sheet-apply-footer"` are present.
Card set Done with the DoD evidence.

**The CI adversarial reviewer fired on this PR — twice, and usefully.** First head:
*Must Fix None · Should Consider None · Minor* — both my guards located the footer as
the panel's `lastElementChild`, a positional handle that would keep passing while
describing a different element if anything were appended after it. That is a fair
catch on a guard whose whole job is to notice breakage, so I fixed it (a
`data-testid`, plus a hard throw in the harness if the locator ever misses) rather
than merging past a Minor. Second head, after the fix: **all three sections `None.`**
Worth recording against MEH-1844's intermittency question as two clean firings in a
row.

**What to check:** that the mobile footer really is reachable without scrolling on a
physical iPhone. Everything in the PR is Chromium emulation, and the change touches
`position: sticky` inside an overflow container plus `env(safe-area-inset-bottom)` —
the two things emulation is least trustworthy about. The PR deliberately does **not**
claim "נבדק בנייד".

**What to check:** that the mobile footer really is reachable without scrolling on a
physical iPhone. Everything in the PR is Chromium emulation, and the change touches
`position: sticky` inside an overflow container plus `env(safe-area-inset-bottom)` —
the two things emulation is least trustworthy about. The PR deliberately does **not**
claim "נבדק בנייד".

Measured before the fix at 390×844: `/producers` footer at y=924 (80px below the
fold), `/map` at y=1143 (**299px** below). The footer is the sheet's only exit
besides the backdrop.

Three things worth carrying forward from this one:

1. **`position: sticky; bottom: 0` resolves against the scrollport — the container's
   *padding* box.** So the panel's `pb-[calc(env(safe-area-inset-bottom)+16px)] `
   would have parked the footer above the sheet edge with content sliding through the
   gap. Measured: container `pb: 32px` → footer bottom 812 against an 844 panel edge;
   `pb-0` → 844, flush. Moving the inset onto the footer was necessary, not tidying.
2. **Two runtime A/B probes for the desktop-regression question were built, run, and
   retracted as invalid** — both swapped the old class string onto a live element,
   and Tailwind's JIT had purged those `lg:` classes from the build, so the "before"
   arm measured *missing CSS*. A safelist file to force emission was also not picked
   up: `tailwind.config.js:60-63` globs only `./app/**` and `./components/**`, and the
   file sat at `frontend/`. Reported as retractions rather than as findings.
3. **The reviewer then answered the question properly** by swapping the real component
   file and rebuilding — desktop confirmed unchanged at 1440×900.

## STATUS-SYNCED

- **MEH-1945** → In Progress, `cc-queue` applied, PR #2695 auto-attached.

## PARKED

None.

## CIRCUIT EVENTS

None.

## CLAIMS

**Claimed by me:** `feature/meh-1945-mobile-sticky-apply` (claim commit pushed before
the first edit, per the branch-claim protocol).

**Skipped as claimed / not mine:**

- **MEH-1911** — the orders' item #2 asks for "the ×5 stability proof under clean
  conditions". **That proof is already done and checked off in the card**: ×3 `-n
  auto`, ×1 `-n 2`, ×1 `-n 4`, all green, 2,738 collected in each, 0.0pt coverage
  drift, landed in PR #2633 (merged 07/08 10:41:05Z). Re-running it would have been
  pure duplication. The card's one open item is applying
  `docs/ci/meh-1911-pytest-parallel.patch.md` via **PR #2661**, which touches
  `pr-checks.yml` + `pyproject.toml` + `uv.lock` — all CC-deny — so it is Sapir's by
  policy, and the orders' own CI-tooling rule ("ANY workflow change = patch file, PR
  open, no merge") says the same. #2661 also had a push at 15:39Z, i.e. ~1.5h before
  I looked, so it is **not** an orphan under the >2h rule and I did not touch it.
- **PR #2661** — foreign and recent, see above.

## FOREIGN ACTIVITY (facts only)

- `origin/staging` advanced `f2c9524d → d5d05344` during the session; four commits,
  including the two `delivery_fee` fixes (#2693 read side, #2694 write side) that the
  previous session's log flagged as "broken on BOTH sides, only one has a ticket".
  Both sides are now closed.
- A dependency bump arrived with the staging sync (`frontend/package.json` +
  lockfile, 256 lines). Build and the full vitest suite were re-run against the
  merged tree afterwards rather than reporting pre-merge numbers.

## OPENED ISSUES

None. One finding is recorded in the PR body rather than as a new card, per rule 27
(search first, prefer extending): **`/map` renders the filter trigger twice** — once
per shell (`hidden lg:grid` / `lg:hidden`) — and at 390px the desktop copy sits in the
DOM at 0×0. It silently swallows a `.first()` click. Measured while building the
harness locator; it is cosmetic-to-harmless for users but a live trap for any spec
that locates that control.

## PIPELINE HEALTH

**A background review subagent mutated my working tree mid-task, and it cost a
near-miss.** The `/adversarial-review-coverage` run was correctly spawned in a
different model (maker ≠ checker) and returned a genuinely useful review — but to
verify the guard tests it stashed `FilterSheet.jsx` back to the pre-change version,
and the restore left the file at HEAD. **I caught it only because `git status` showed
the component missing from a staging list I expected it in.** Had I not looked, the
commit would have contained the tests and the harness but *not the fix* — and both
the vitest tripwires and the harness would have gone red, so it would have been
caught, but only after a wasted CI cycle.

The lesson is not "don't use a review subagent" — the review was worth it, and it
answered the one question I could not. It is that **a subagent sharing the parent's
working tree is a concurrent writer**, and the "do not edit files" instruction I gave
it does not cover `git stash`. Next time: give the reviewer a read-only copy (a
worktree or a clone), or diff the tree against expectation immediately before every
`git commit`. The reviewer itself read the symptom as a parallel-session incident
(CLAUDE.md rule 1) and said so, which is the right instinct on the evidence it had —
it just happened to be us.

**The orders' "E2E gate is red for the documented Cloudinary reason (MEH-1925)" is not
what the data shows, and the difference matters.** `e2e.yml` on `staging` pushes today
**alternates** pass and fail on commits that contain none of my work: `3fa86023`
success · `0e652c32` **failure** · `d5d05344` success · `6c8186dc` **failure** ·
`9764c45a` success · `13c06c8f` success · `bd9c9eea` **failure** · `0a65deaa` success.
Cloudinary 401s appear in the *green* runs too, so they cannot by themselves be the
cause. This is an **intermittent suite on the base branch**, not a surface blocked on
one console credential — a different problem, with a different owner, and treating it
as a standing excuse is how it stays unfixed. Posted on PR #2695 with the table.

I did **not** enumerate the failing spec names — the `E2E gate` job only aggregates and
the QA-report comment says "at least one spec failed" without naming them, so that
needs the `playwright-report` artifact. So I am not claiming "no failing spec relates to
my diff" as verified; what bounds it is that the diff adds one attribute and edits two
className strings, touching no element, id, existing testid, text or structure.

**The qa-artifacts size cap is easy to trip by re-running a harness.** The harness
writes ~1.8 MB of raw PNGs; compressing to WebP gets that to 401 KB. But a *second*
harness run recreates the PNGs alongside the WebPs, and the staged total hit
2,253,055 bytes against the 2,097,152 cap — it would have reddened the required
gate. Caught before commit. A note now sits in the harness docstring so the next
runner does not rediscover it.

**Environment setup in a fresh container, for the next session:**
- `frontend/node_modules` absent → `npm ci` first.
- Backend: `python -m venv` + `pip install -r requirements.txt` **fails** — there is
  no `requirements.txt`; the backend is `pyproject.toml` + `uv.lock`. Use
  `uv sync --frozen` from `backend/`, which works.
- Postgres is not running and the DBs do not exist: `pg_ctlcluster 16 main start`,
  set the `postgres` password, create `mehamakor` **and** `mehamakor_test`, then
  `alembic upgrade head`, `python seed_data.py`, and
  `python scripts/seed_demo_producers.py --confirm` (it is **dry-run without
  `--confirm`** — easy to think it seeded when it did not). That yields 15 approved
  businesses, enough for both filter surfaces to render a full chip set.
- Frontend `/api/*` proxies to `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`),
  read at server boot — so pass it on the `next start` command line.
- `rm` is blocked by the bash-safety hook. Use `mv` into the scratchpad to remove
  scratch files from the repo.

**MEH-1603 metric (parks caused by stale-base / expected-checks): 0.** No park of any
kind this run, so this contributes no evidence either way about the update-branch
setting. The one merge-mechanics event was the routine staging sync, which
fast-forwarded cleanly.
