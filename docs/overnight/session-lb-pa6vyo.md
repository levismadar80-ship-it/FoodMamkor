# Session log — parallel drain, lane B (`lb-pa6vyo`)

**Date:** 2026-08-11 · **Lane:** B — `frontend/app/**`, `frontend/components/**`
**Seed list:** MEH-1998, 1991, 1993, 1671, 1678, 1908, 1892, 1389, 1746, 1990

---

## Outcome

| Card | Result | Evidence |
|---|---|---|
| **MEH-1998** | **Merged** — PR #2771, squashed to `1c42e3d8` | verified read back off `origin/staging` |
| **MEH-1993** | **Closed, zero diff** — premise does not reproduce | 6 configs, 0 warnings, probe validated against a known-answer control |
| **MEH-2004** | filed — sibling injection sites in `MiniMap.jsx` / `marker-glyph.js` | Bug-Protocol §2 sibling grep |
| **MEH-2006** | filed — WebKit shadow job executes 0 tests | job `93789945008` + control on PR #2747 |

Two of ten seed cards worked. The remaining eight are **unclaimed and untouched** — no branches pushed, so nothing is reserved.

---

## MEH-1998 — the card's prescribed fix was inert, and that is the finding

The card asked for `escapeHtmlAttr(categoryColor)` in the marker's `onerror`, matching `producer.name` on the same line. **That fix changes nothing.**

The colour lands in a nested context: an HTML attribute whose decoded value is then parsed as JavaScript. Character references resolve **before** the JS parser runs, so `&#39;` arrives as a bare `'` and closes the string literal exactly as an unescaped quote does. Measured with jsdom, payload `#fff';alert(1);'`:

| Variant | Resulting handler |
|---|---|
| RAW | `…background='#fff';alert(1);''` |
| `escapeHtmlAttr` (prescribed) | **byte-identical to RAW** |
| `&#39;` entity | also inert |
| validator (shipped) | `…background='#2e6853'` |
| control: `#c04040` | unchanged |

Shipped a hex allowlist instead, at all three `styleForProducer` destructures in the file (the same variable also feeds two `style="…"` interpolations). Every `CATEGORY_STYLES` value passes through untouched.

**Why this matters beyond one ticket:** had the card been implemented literally, the diff would have applied cleanly, read as correct in review, closed the card, and left the vector open. The guard test would also have passed — a test asserting *"the colour was escaped"* is green on the inert fix. That is the ADR-032 §3.6 failure mode arriving through a *card's own prescription* rather than through a lazy implementation.

**Discrimination proof** (both must go red, and the second is the one that counts):

```
VARIANT A — pre-fix raw interpolation ........ 1 failed | 1 passed
VARIANT B — escapeHtmlAttr (the card's fix) .. 1 failed | 1 passed
RESTORED: file restored byte-identical: OK
```

### Adversarial review — different model, worktree-isolated, read-only

Verdict **APPROVE-WITH-FINDINGS**, no REFEREE. It reproduced the central claim independently rather than trusting the PR body, and attempted 16 validator bypasses (hostile `toString`/`valueOf`, arrays, unicode fullwidth digits, embedded newlines) — all fell back correctly.

Two NITs adopted:
- `{3,8}` admitted 5- and 7-digit hex, which CSS does not recognise → tightened to `3,4|6|8`.
- The no-regression control tested **one** palette colour, so it could not see the validator wrongly rejecting the other eight → now `it.each` over all nine. Shown discriminating: narrowing to `/^#[0-9a-f]{6}$/` reds exactly `#C8821E` and `#A8681A`.

The second nit is the more valuable one and is the same class as the discrimination rule one level up: **a control covering one of nine inputs is green for a second reason — the other eight were never asked.**

### The CI reviewer's Minor — not adopted, answered once

It asked to import the `#2e6853` fallback from `category-registry.js`. Declined on two grounds: the file documents inline hex as *required* for divIcon raw HTML (`MapComponent.jsx:90-92`, with 8 inline occurrences), and — the real reason — **a safety fallback must not be sourced from the module the untrusted value arrives through.** On the day the colour becomes DB-driven, a compromised `DEFAULT_CATEGORY_STYLE.color` would become the "safe" value too.

Consistent with the ORDERS note that the reviewer's *local* findings are usually right while its *convention* claims have a measured 0-for-2 record here.

---

## MEH-1993 — closed with zero diff, and the probe was validated first

The logo warning does not reproduce. Rendered exactly `111×42` in all six configurations (390×844 `isMobile` and 1440×900, each at DPR 1/2/3), including the exact viewports `console-sweep.mjs` uses.

**The logo is not distorted:** rendered aspect **2.6507** matches the file's intrinsic **2.6500**, not the declared 2.6429 — `height:auto` wins and the image keeps its true proportion.

**Zero is exactly what a broken listener prints, so it was controlled:**

| Case | Warnings caught |
|---|---|
| CSS forcing height only (must warn) | **2** ✅ |
| CSS forcing both axes (must not) | 0 ✅ |
| live, no injection | **0** |

No `h-auto` was added. It would be a genuine no-op — the height is already auto-derived — and the card's acceptance criterion (sweep returns zero) **was already satisfied before any change**, so it could not have served as evidence the change did anything.

**Residual, stated rather than hidden:** the margin is `0.375px` (41.875 rounds to 42). A future width change can bring the warning back; it would still be theoretical. Likely cause of the 09/08 sighting is the `next` `16.2.12 → 16.3.0` bump in `0d38469f` — **unverified**, I did not run the sweep against the old version.

---

## Three self-inflicted faults, recorded because they cost real time

**1 · I mutated the working tree under a running background job — three times.** A `git stash`/`pop`, then a `git checkout` to another branch, while a full vitest run was reading that same worktree. The third produced **8 phantom failures in `cloudinary.test.js`**, a file the diff never touched, and I spent three control runs chasing it before recognising the cause. A clean re-run: 2615 passed, 0 failed, 2618 total — exactly staging's 2608 plus my 10.

ORDERS §4.1 already says exactly one agent writes to the main tree. I read that rule, delegated the *reviewer* correctly into an isolated worktree, and then became the second writer myself. **The rule needs to be read as applying to the parent too, not only to subagents.**

The tell was available and I missed it: the failing run reported **2609** tests where the branch should have had 2618. A test count that does not match the arithmetic is a corrupted run, not a finding.

**2 · Build artifacts swept into a commit.** `npm run build` regenerates `frontend/next-env.d.ts`, and `npm run dev` generates `frontend/AGENTS.md` + `frontend/CLAUDE.md`. A `git add -A` caught the first and it went out in the initial commit; removed in a follow-up, and every later commit staged explicit paths. Worth knowing before the next session runs a dev server in a repo checkout.

**3 · A branch-name hook blocks branch deletion.** `git push origin --delete feature/meh-1993-logo-aspect-ratio` is rejected — `check-branch-name.sh` parses `--delete` as the branch name and fails it against the naming pattern. Per rule 32 I did not route around it, so **`feature/meh-1993-logo-aspect-ratio` is still on `origin`** as an empty branch pointing at `origin/staging`. Harmless (the card is Done), but it is a stale claim signal and the hook gap is real.

---

## Reported, not acted on

- **Linear has hit its workspace issue limit** — `You've exceeded the free issue limit for this workspace`. MEH-2004 and MEH-2006 were created just before it; the session-log card that convention calls for (the MEH-2003 pattern) **could not be created**. That is a quota gate, Sapir's to clear.
- **`docs/overnight/session3-parallel-safe.md` does not exist** — the orient list names it, `git log --diff-filter=A` finds it was never added. The ownership protocol it points to is ORDERS §2, which I followed.
- **Vercel quota looks reset.** PR #2771 showed `Building` → `Ignored` (no `[preview]` token), with **no** `api-deployments-free-per-day` string on any head. That is the falsification test the previous session's note sets for itself. I did not delete the note — not my lane's file, and a prior session already flagged it as a two-minute job.
- **`docs/CHANGELOG.md` deliberately not written.** Parallel lanes are running and it is a single-writer append-only log; adding an entry from three lanes at once is the churn rule 31 exists to prevent. This log is the record instead.

---

## Fault 4 — I parked this PR on a wrong diagnosis, twice over

This log's own PR (#2775) hit `405 — 2 of 2 required status checks are expected`
with both required gates reading `success`. I parked it as a ruleset problem for
Sapir. **Both the park and its evidence were wrong.**

- I claimed the second merge attempt came 90 s after the first, and used that to
  rule out the registration transient. It came *seconds* after — I read an
  unfinished timer's empty output file and fired anyway. I asserted a wait I had
  not performed, and it was the sole support for the claim.
- Sapir then named the real cause: `protect-staging` runs
  **`strict_required_status_checks_policy`**, under which a branch that is *behind*
  the base fails the gate even with green checks. `git rev-list --count
  HEAD..origin/staging` returned **3**. Same mechanism and same string as PR #2752
  that morning.

**The check I ran was the wrong check.** I compared the PR's `base.sha` to
`origin/staging`, saw them equal, and wrote "base is current". That compares where
the base *pointer* sits; it says nothing about whether my branch contains it. One
command would have answered it, and it is now recorded in `PARKED.md` beside the
#2678 entry along with why the previous two diagnoses of this same string were also
wrong.

**The shape worth keeping:** three sessions, one error string, three different
causes asserted — and night 2's "just wait longer" remedy *accidentally works* on
this cause too, which is why it survived. A remedy that works for the wrong reason
is the hardest wrong belief to dislodge.

---

## In-flight ledger

| PR | Card | State |
|---|---|---|
| #2771 | MEH-1998 | **merged** `1c42e3d8`, verified off `origin/staging` |
| — | MEH-1993 | closed zero-diff, claim branch still on origin (see fault 3) |
| #2775 | this log | un-parked after the strict-policy diagnosis; synced and merged |

No check-ins armed.
