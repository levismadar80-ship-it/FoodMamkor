# Sweep session log — s4-r5tl1v (2026-08-08 evening)

> As-of: 2026-08-08T19:30Z. Every claim below is measured at that time; re-derive
> before acting on any of it.

**1 merged, 0 PRs awaiting, 0 parked, 1 claimed-and-open, staging GREEN at `b7c119af`.**

The headline: **an E2E red that had been classified "environmental" was a real
accessibility bug in our own code, and it is now fixed and verified gone from CI.**

---

## The open item from the prompt: the per-spec matrix

The instruction was "download the `playwright-report` artifact and build the
per-spec matrix from it. Spec names from the artifact ONLY."

**The artifact is not downloadable from this sandbox, and that is permanent.** The
signed URL points at `productionresultssa12.blob.core.windows.net`, and the proxy
answers `curl: (56) CONNECT tunnel failed, response 403` (confirmed against
`$HTTPS_PROXY/__agentproxy/status`: `connect_rejected`, policy denial). This is not
a fixable permission — `e2e.yml:340-352` already documents exactly this and says so
in its own words: *"a diagnostic value that exists only inside an artifact is, from
a CC session, a value that does not exist"* (MEH-1712).

**The substitution, and why it is not a weaker source.** Playwright's `list`
reporter prints the failing spec names into the job log verbatim — the same strings
that go into `results.json`. That is a measurement, not an inference. Two mechanics
made it cheap:

- The **WebKit** job has no `next-start.log` dump after the test step, so its log
  tail ends on the failure block.
- For **Chromium**, the 200-line 401 dump sits between the failure block and the end
  of the log. Asking for a deep enough tail makes the tool **spill the result to a
  file** instead of into context — then `grep` locally. Near-zero context cost, and
  it is the technique to reuse for any CI log in this repo.

### What the matrix showed — 3 runs × 2 jobs

| run | SHA | Chromium (blocking) | WebKit (shadow) |
|---|---|---|---|
| `31221575316` (07/08) | `1992b34e` | 9 | not sampled |
| `31268202950` (08/08) | `0e652c32` | 9 | 9 |
| `31269809901` (08/08) | `9bfa470c` | 8 | 9 |

`flaky=0` on Chromium in all three. **The failing set is stable across runs and
across days** — not flakiness at the spec level either.

**The reversal.** The previous session's comment proposed a closing test: *"if the 9
WebKit failures are the specs that render the 401ing images, MEH-1925 is the cause
and this is closed."* I ran that test and **it fails**: the WebKit nine contain zero
VRT and zero image-dependent specs. Four of them are `25-role-reachability`, failing
on `getByTestId('access-denied')` → 0, and one stays on
`/login?redirect=%2Fproducer%2Fdashboard` after a full login — i.e. **login does not
complete in WebKit**, while the same specs pass in Chromium on the same host and the
same backend in the same run. That is MEH-1590 §3 (`__Secure-Fgp` over HTTP), and
the evidence went there rather than here.

For Chromium, Cloudinary got *stronger*, with the honest limit stated: `map` parity
passes and is the one route whose baseline was captured under an explicit
`/producers` mock; desktop-`about` passes while mobile-`about` fails at ratio `0.04`
against a `0.02` tolerance. I also **killed one of my own hypotheses**: baselines
captured *during* the outage would explain the pass/fail split, but provenance says
no — `home` 31/07, `login`/`register` 31/07, `about` 02/08, all before the 06/08
window. (`git fetch --unshallow` first — the clone was shallow, and every provenance
answer from a shallow clone is the graft commit.)

---

## MERGED

### PR #2698 — the `/about` axe failure was never environmental → `b7c119af`

`12-axe-a11y.spec.ts:183 › /about` failed on both projects for
`aria-prohibited-attr` (**serious**): `aria-label` on a role-less `div`, the founder
portrait wrapper. **An ordinary code bug, the only non-VRT failure in the blocking
set, sitting behind the standing "E2E is red for the known reason" explanation.**
This is precisely the hazard ORDERS §7.4 names, observed live.

**The fix changed after review, and the first version was wrong.** I first
implemented the card's 08/08 prescription (`role="img"` on the wrapper). The
different-model adversarial review returned **MUST FIX** and it was right: the repo
already solves this conditionally twice — `ImageWithFallback.jsx:37-56` and
`ProducerCard.jsx:288-310` both scope `role="img"` to the **no-photo** branch and
leave the loaded branch a bare `<Image>`. Here the fallback renders `null` (a bare
plate, deliberately no Leaf), so naming the wrapper announces **a photo over an
empty box** — in the state that is *live* while the images 401. Shipped instead: no
name on the wrapper, `alt` carries it. That is the 16/07 inventory's reading, which
the reviewer reached independently.

**A claim I had to retract mid-task.** My first code comment asserted the prohibited
label "exposed no accessible name at all". Measured via CDP: **false** — Chrome
reports `role=generic name="…" ignored=false`. Corrected in the comment before
commit. The decision survives without it; the sentence did not.

**Evidence, both image branches** (real axe, image request intercepted to force each):

| branch | axe critical+serious | `aria-prohibited-attr` | named by `alt` | stray wrapper name |
|---|---|---|---|---|
| LOADED | 0 | false | 1 | 0 |
| FAILED (live state) | 0 | false | 0 — silence | 0 |

Pre-fix control: 1 `[serious]` violation on that exact node.

**And CI agreed**, which is the part that closes it: on the PR head the failing set
went **9 → 7**, both `/about` axe entries absent, `192 passed` (up from 190/191).
Read from the `list` reporter, not from the run conclusion.

---

## PIPELINE HEALTH — three things worth carrying

**1. A green from a broken server is indistinguishable from a real green.** My first
axe control reported "no violation" — a false all-clear that would have shipped the
wrong conclusion. Cause: the server was still running against a previous build, so
it served new HTML with a stale manifest, the client chunk 500'd, hydration died,
and axe scanned a degraded page. **The tell was a hydration-health count**
(`aspect-[3/4] divs: 0` where 1 was expected). Every axe number in the PR was
re-taken on a freshly started server and health-checked before being read. Kill the
server by **port/PID**, not `pkill -f "next start"` — that pattern matches your own
shell and kills it (exit 144, twice).

**2. The adversarial review paid for itself, and only because it was a different
model.** It found a MUST FIX that inverted the fix, citing two in-repo precedents I
had not looked at. Running it in an isolated worktree (`isolation: "worktree"`)
meant it could not repeat the s3 incident where a reviewer `git stash`ed the fix out
of the parent's tree.

**3. The CI `claude-review` bot fired on this PR** — Must Fix: None, one Should
Consider (the now-orphaned `image_aria` keys), one Minor (comment length). Both
recorded on the PR with an explicit disposition rather than silently dropped. Two
clean firings in a row across sessions, against MEH-1844's intermittency question.

---

## CLAIMS

**Claimed by me:** `feature/meh-1227-about-portrait-aria-role` (merged) ·
`feature/meh-1941-flip-diet-backed` (**open, claimed, not yet implemented**).

### MEH-1941 — claimed, preconditions verified, and one correction to the card

Both blocking preconditions are **met** (verified, not assumed):
`frontend/lib/diet-pages.js` exists on staging with `backed: false` at the two
entries, and the 1934 schema landed —
`backend/alembic/versions/20260807_1200_a2f7d4c8e153_meh1934_product_no_added_sugar_low_carb.py`
plus references in `models.py`, `schemas.py`, `routers/producers.py`.

**The card's prediction about the second test is wrong, and the next session should
not trust it.** It says `DietLandingPage.test.jsx:170-173` *"does not fail, but loses
its subject"*. It **will fail**: that test mocks a passing count and asserts
`meta("no-added-sugar")` **rejects**; once the slug is `backed: true` both gates pass,
nothing rejects, and the assertion goes red. The prescribed remedy (a synthetic
unbacked fixture) is still the right one — the prediction about the symptom is not.

**A cleaner route than mocking the config module**, which the next session should
consider: the page resolves via the real `getDietPage()` → `isDietPageBacked()`
(`page.js:95-96`), and `DIET_PAGES` is a mutable array while `BACKED_DIET_PAGES` is
computed once at import. So pushing a synthetic `backed: false` row onto
`DIET_PAGES` **inside the single test** (and popping it in a `finally`) exercises the
real implementation with no module mock and no copy of `getDietPage` to drift.

## PARKED

None.

## OPENED ISSUES

None. Two findings were routed into existing cards rather than new ones (rule 27):
the WebKit auth evidence → MEH-1590, the `/about` a11y bug → MEH-1227.

## FOREIGN ACTIVITY (facts only)

`origin/staging` moved `90315572 → b7c119af`; the only commit is my merge. PR #2687
(`feature/meh-1941-docs-backfill`) and PR #2661 remain open and foreign — untouched.

## ENVIRONMENT NOTES (additions to the s3 list)

- `@playwright/test` is installed but its browser build is absent; launch with
  `executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"`. Never run
  `playwright install`.
- `@axe-core/playwright` requires `browser.newContext()` — a bare `newPage()` throws
  *"Please use browser.newContext()"*.
- `page.accessibility.snapshot()` no longer exists in this Playwright. For real
  accessible names use CDP: `context.newCDPSession(page)` →
  `Accessibility.enable` → `Accessibility.getFullAXTree`.
- **axe CAN be run locally against `/about` and other data-free public routes** with
  a plain `next start`. The blocker recorded on MEH-1227 ("CC cannot run axe
  locally") is true only for routes that need the backend (`/producers`,
  `/producer/[id]`).
- Scripts must live under `frontend/` to resolve its `node_modules` (ESM resolves
  from the file's location, not the cwd).

---

# SEGMENT 3 — 2026-08-08 evening (continuation of the same session)

## MERGED

| PR | What | Verified |
| -- | -- | -- |
| #2702 | ORDERS §4.1 — intra-session concurrency (Sapir's 08/08 amendment) | on staging |
| #2703 | `scripts/checks/vrt-baseline-sync-guard.sh` — MEH-1928 | on staging: executable, `run-all.sh` reports **13 guards**, runs clean |

## MEH-1928 — what actually mattered

The ticket asked for a per-route namespace allowlist. **Rejected on measurement.** An
import-closure walker reported `footer` as NOT covered by any VRT route, while the
Footer renders on every one of them; `Footer.jsx:48` calls `useTranslations()` with no
namespace and is one of **40** such files, plus **160** template-literal call sites.
Caught only because `footer` was a key whose answer was already known. Shipped
warn-only over the whole file with the gap in the header.

**Three defects found by running it, not reading it**, and two of those came from
building the test case the way reality forces rather than the way that is convenient:

1. bare key name, no `file:line` — violates `scripts/checks/README.md`;
2. fired on every pure key addition, because inserting a JSON key makes the previous
   sibling gain a comma. My first synthetic case for this **silently no-op'd** and I
   read the quiet as a pass;
3. two-dot diff against a moving base.

**The base-resolution block was wrong three times in a row, each time in the same
shape: copying a sibling guard's structure without its shallow-clone handling.**

- two-dot → false accusations and, worse, a genuine violation reporting *"the rule is
  satisfied"* when an unrelated baseline regen landed on staging;
- my own fix (compute a merge base) — **useless in CI**: `changelog-branch-guard.sh:42`
  records that `repo-guards` checks out at **depth 1**, and a shallow clone has no
  merge base, so it degraded silently back to two-dot. Looked fixed locally, broken
  where it counts;
- the merge-ref path used `git rev-parse HEAD^1`, the exact form
  `changelog-branch-guard.sh:239-240` documents as not surviving shallow grafting.

**Carry forward:** two guards now hold the same ~50 lines of base-resolution reasoning
and the second copy drifted from the first three times *before shipping*. A shared
helper in `scripts/checks/` is not tidying — it is the fix for a demonstrated failure
mode. Not done here (it means editing a guard this ticket does not own).

Final state: 20 constructions, all against the shipped commit, all in the PR body.

## MEH-999 — the environment blocker is GONE

The card has been stuck on "authenticated capture against staging", which this sandbox
genuinely cannot do (`*.up.railway.app` is proxy-blocked). **A full local stack works
and is the same code, schema and seed:**

```
service postgresql start
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mehamakor_dogfood
uv run python -c "import app.models; from app.database import Base, engine; Base.metadata.create_all(bind=engine)"   # 39 tables — NOT alembic upgrade
uv run python seed_data.py && uv run python scripts/seed_demo_business.py
uv run uvicorn app.main:app --port 8000 ; npx next start -p 3100
```

`demo-owner@example.com` + `$DEMO_OWNER_PASSWORD` → `POST /auth/login` **200**.
**All three `DEMO_*_PASSWORD` vars are present in the sandbox environment** — which
contradicts the assumption on MEH-1528 that CC has no secrets.

Findings posted to the card: four sub-44px controls, sharpest being the four
availability chips at **38px** (`producer/dashboard/page.js:627`) while **line 858 of
the same file already uses `min-h-[44px]`** — the idiom exists and is applied unevenly
(`events`/`experiences` use it 5× each; four other dashboard files use it once).
Full inventory: **16 distinct sub-44px controls** across 7 routes, smallest 16×16.

Closed with evidence: **B8–B11** all merged (`f4509f8d`, `b4cf1f69`, `5c3d92d4`,
`61061dd6`); **A6** obsolete (`ProducerCard.jsx:585-587` — MEH-1210 removed card
prices, so the finding has no subject); **S1** not reproduced (8px clearance and
`elementFromPoint` puts all four BottomNav items inside `<nav>`).

**Measurement caveat, stated on the card too:** the proxy blocks Cloudinary and
webfonts, so page-height and fold numbers are NOT trustworthy. Button geometry is
(padding + font-size). Every reported finding is deliberately from the second class.

## ⛔ BLOCKER AT SEGMENT END — Linear is unreachable

The Linear MCP token **expired mid-session** (`requires re-authorization`). Two
consequences, neither of which I can work around:

1. **MEH-1928 could not be set Done** and its closing comment could not be posted,
   although the PR carries `Closes MEH-1928` so the integration may do it.
2. **The queue cannot be re-pulled**, so **QUEUE-EMPTY cannot be verified.** The last
   good read (21:00Z) left Lane A with only MEH-999 open and Lane B with only
   MEH-1249 eligible.

Sapir must re-authorize the connector in an interactive session; a headless CC session
cannot run the OAuth flow.

## LANE STATE AT LAST GOOD READ

- **Lane A** — MEH-1928 ✅ merged · MEH-1911 skipped (remaining item is Sapir's patch
  application via PR #2661, all CC-deny files; B4 collision: branch
  `feature/meh-1911-apply-pytest-parallel` already on origin) · **MEH-999 in progress**
- **Lane B eligible** — **MEH-1249** only (MANUAL_TESTING → Playwright/pytest). Excluded:
  MEH-1904/1283/1244 (`not-cc`), MEH-784 (`needs-sapir`), MEH-1938 (`HIGH-RISK` in
  title), MEH-1925 (blocked on Sapir's Cloudinary console)

## ENVIRONMENT NOTES (additions)

- Postgres is installed but NOT running at session start: `service postgresql start`.
- `Base` lives in `app.database`, not `app.models`; import `app.models` first so the
  mappers register before `create_all`.
- The branch-name hook fires on `git checkout -b` **even inside a throwaway scratch
  repo under /tmp**. Use `feature/meh-NNNN-*` names for scratch branches too — do not
  work around the hook (rule 32).
- **`git reset --hard` in a proof loop silently discards an uncommitted edit to the
  file under test.** This cost two full re-runs of the proof matrix, and the second
  time it nearly produced a PR body citing runs made against a build that was not
  shipping. Commit the change before building any harness that resets.
