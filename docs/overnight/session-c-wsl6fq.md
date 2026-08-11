# Session C — `wsl6fq` (parallel drain, Lane C)

**Lane paths:** `e2e/**` · `frontend/tests/**` · `backend/tests/**` · `messages/*.json` · `docs/**`
**Seed list:** MEH-1974, 1799, 215, 217, 1980, 1523, 1511, 1969, 1502, 1965
**Worktrees:** `/tmp/claude-0/wt-lane-c` (MEH-1799), `/tmp/claude-0/wt-1974` (MEH-1974)

---

## 1 · Anti-stale results — two of the first two seed items had moved

Both top items were checked against the **repo and the API** before any build, and
both had changed since the card was written.

### MEH-1974 (Urgent) — the card's premise no longer holds

The card asserts *"every run that actually ran the suite is red, on the same 7
specs"*. Measured on **11/08**, run `31491050433` (push, head `73238b9b`):

| | |
|---|---|
| `Playwright E2E (Vercel preview)` | **success** |
| `Run E2E tests` step | 12:27:23Z → 12:31:28Z = **245 s** (a real execution) |
| Playwright summary | `217 passed (4.1m)` · `29 skipped` |
| `E2E coverage floor` | `executed=217 (expected=217 unexpected=0 flaky=0 skipped=29 specs=246)` |

`unexpected=0 flaky=0`, with `--fail-on-flaky-tests` on.

**The masked-green world was ruled out, not assumed away.** The other explanation
for that green is "the parity specs skipped". They did not: the 7 specs the card
names (home/login/register/about × desktop/mobile) carry **no** `test.skip`. Every
skip in `parity.spec.ts` — `:594`, `:624`, `:657`, and four
`test.skip(true, "No producer on staging…")` — is a **producer-detail** variant.
That also accounts for the 29 skipped.

**Cloudinary 401s are gone from the E2E path.** `/tmp/next-start.log` for that run
is 12 lines with **zero** 401s; on the red runs it was full of
`upstream image response failed … 401`. **Boundary stated on the card:** that log
records failures through the Next *image optimizer* only — `HomeHero.jsx:21` uses
a direct `background-image` that bypasses it, so this says the optimizer path is
clean, **not** that delivery is healthy and **not** that production is fixed.
MEH-1925 is untouched and still Sapir's.

**Green run #2 landed during this session** — run `31492561220`, head `41d02377`:
`Run E2E tests` 12:46:42Z → 12:51:38Z = **296 s**, `success`, coverage floor passed.
Two consecutive *real* (>5 min) green Chromium runs on `staging`: 12:31:28Z and
12:51:38Z.

**Separate observation, not mine and not blocking:** the
`Playwright E2E (WebKit — shadow, non-blocking)` job failed on **both** of those
runs (12:34:25Z and 12:53:50Z). It sits outside `e2e-gate`'s `needs:` by design, so
it gates nothing — but it is a standing red on a non-required check, which is the
decay ORDERS §3.3 describes. It predates this session's work; **flagged, not
adopted**, and not attributed to any cause I have measured.

**Not closed.** The DoD wants **≥3 consecutive real green runs**; there are **two**.
Closing on a single conclusion is the exact error the card was reopened for.
Recommendation posted: when it does close, close it **without** regenerating
baselines — a green suite means there is no drift to capture, so a regen would be
a change with no cause, and would re-run the MEH-1552 candidate-baseline risk for
nothing.

### MEH-1799 — a proven, already-applied precedent existed

`docs/ci/ci-gate-skip-green.patch.md` had already solved the same class for the
*other* aggregator, and it is **live** (`pr-checks.yml:754`, `strict_ok`/
`check_ran`) with a committed harness at `scripts/ci-gate-selftest.sh`. The patch
doc mirrors its structure rather than inventing one.

---

## 2 · Delivered — PR #2770 (MEH-1799)

`docs/ci/e2e-skip-green.patch.md`. Both required gates `success`; guards ran (not
skipped): Repo guards, Branch name gate, Env drift, qa-artifacts size cap,
DO-NOT-MERGE gate, Linear mention guard.

**Fresh evidence replacing the card's 31/07 data** — re-measured at job level:

| Time (UTC) | Run | Push | `Playwright E2E` | Duration | `E2E gate` |
|---|---|---|---|---|---|
| 12:19:51 | `31387507043` | code | ran | 483 s | **failure** |
| 12:23:09 | `31387761417` | docs-only | `skipped` | 29 s | **success** |
| 12:32:07 | `31388477139` | docs-only | `skipped` | 29 s | **success** ← tip |

Thirteen minutes after a real red, the tip of `staging` read green.

**Recommendation:** option (b) — suppress the gate job on a *skipped push* so the
tip carries `skipped` rather than a false `success`. PR behaviour byte-identical,
so MEH-892 cannot re-open. The branch-protection question the card asked to verify
is answered: **no side effect**, now or after promotion — required contexts gate
PR merges, and a push to `staging` is post-merge.

**The finding worth carrying:** the guard needs a **third** conjunct,
`needs.filter.result == 'success'`. Without it, a broken paths-filter goes from a
blocking failure to silence — the patch would have closed one fail-open hole and
opened another. This is not asserted, it is **shown**: the harness exits 1 on the
two-conjunct variant. That control is the whole reason the harness is worth
having; the five-scenario table alone would have passed either version.

**Two DoD items deliberately not done, both lane boundary** (§4 of the doc, and
the PR body):
- `.claude/rules/testing.md` line → drafted in Appendix B, not applied.
- Harness not committed to `scripts/` as the precedent did → embedded in
  Appendix A, copy-paste runnable, flagged as worth promoting.

**Nit reported, not diagnosed:** `e2e.yml:564` is `name: E2E gate ` with a
trailing space. Matters only if the gate is ever added to ruleset 15240090; I did
not verify whether GitHub trims it.

---

## 3 · Lane-boundary skips (one line each, per the STOP condition)

- **MEH-1523** — gate script + its fixtures live under `scripts/`, and the doc
  item is `.claude/rules/workflow.md`. Three of five DoD items are outside Lane C;
  only the pasted YAML diff is inside. **Parked, not started.** Its §4 open
  question (can CC manage GitHub labels?) is still unanswered and blocks it
  regardless of lane.
- **MEH-1980** — `scripts/checks/coverage-ratchet.sh` is DoD item 3 and is outside
  the lane. The baseline report (`docs/reports/`) and the CI patch doc are inside.
  **Not started;** a session owning `scripts/` should take it whole rather than
  have it split across two lanes.

## 4 · Foreign claims — read-only, untouched

- `feature/meh-1511-qa-gate-rule-23` — pushed by session `sd`, Phase 0 done, not
  built. Past the 2-hour orphan threshold and therefore adoptable, but adopting
  needs a PR comment first; **left alone**.
- `feature/meh-215-e2e-login-c` — foreign. MEH-215 journey C is claimed.

---

## In-flight ledger

| PR | Card | pushed | gate state | next revisit |
|---|---|---|---|---|
| **#2770** | MEH-1799 | 11/08 12:56Z | **both required gates `success`**, guards ran (not skipped). **Auto-merge NOT armed** — different-model adversarial review had not returned at write time (ORDERS §4.1) | on reviewer completion |
| — | MEH-1974 | 11/08 13:4xZ | claim branch only, no commits. Evidence posted to the card. **2 of 3** real green runs observed | when a 3rd real (>5 min) green run lands |
| this log | — | — | rides #2770 — that PR is already docs-only, so rule 31's guard is satisfied and a second PR would be noise | with #2770 |

## Not done, and named

- **MEH-1974 not closed** — two real green runs, DoD wants three.
- **MEH-1523 · MEH-1980** — parked on lane boundary, §3.
- **MEH-215 journeys B/D · MEH-217** — not started; both were already parked by
  earlier sessions, and journey C is foreign-claimed.
- **MEH-1969 · MEH-1502 · MEH-1965** — not reached.
