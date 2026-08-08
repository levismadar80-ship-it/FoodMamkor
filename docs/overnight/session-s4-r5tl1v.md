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
