# Session log — parallel-drain **LANE B** (`frontend/**`), id `b-9tq4xw`, 12/08

**Lane paths:** `frontend/**`. Never `backend/**`, `.github/**`, `docs/CHANGELOG.md`,
`HANDOFF.md`.

> **This file exists so Lane C can backfill `docs/CHANGELOG.md` and `HANDOFF.md`** —
> LANES.md §2 makes C their single writer, and rule 31 keeps them off any code branch.
> The **Landed / open** section below is the backfill source.

---

## In-flight ledger — closed

| PR | Card | landed | how | final head |
|---|---|---|---|---|
| [#2838](https://github.com/levismadar80-ship-it/FoodMamkor/pull/2838) | MEH-2029 | **merged 13/08 07:30:46Z** | **squash** → `59f4bfcb`, one commit carrying the crafted body | `8eeadcae` |

Both required gates were green on that head — `CI gate` ✅ 07:30:43Z,
`Deploy gate` ✅ 07:25:11Z — and the enforced legs were read from the gate's own
log rather than taken from its conclusion.

**Merge method was the whole reason this needed watching.** A parallel actor
armed auto-merge with `mergeMethod: merge` **six times** across this PR's life,
which discards the crafted squash message and lands the reasoning, the
`Builder-Model:` trailer and the closing keyword as unreadable branch history.
Each was disabled. The landing above is a squash, so the message survived —
`git log -1 --format=%B origin/staging` carries it.

**A GitHub API shape worth remembering:** `pull_request_read get` returned
`state: open, merged: false` at 07:30:4x while the merge webhook for the same PR
arrived seconds later. The read was not wrong, it was **stale** — an API read is
an as-of, and on a live object the as-of is the whole claim.

---

## Landed / open

### 🟢 MEH-2029 — the build no longer touches the network for fonts · PR #2838 · MERGED

`next/font/google` self-hosted at RUNTIME but still downloaded from
`fonts.gstatic.com` at BUILD time. Migrated all four families to
`next/font/local` with the `.woff2` files committed under `frontend/app/fonts/`.

**The single most useful discovery, and it shaped everything after it:** all four
families are **variable** fonts. Google serves ONE file per subset covering the
whole `wght` axis — which is why the old build emitted **60 `@font-face` rules
backed by only 20 files**. So the migration is 7 files, not 21, and every weight
is its own `src` entry pointing at the same path (declaring `weight: "400 900"`
instead would have handed the browser a real interpolation where it previously
snapped to the nearest declared face — a rendering change wearing a tidier syntax).

**The committed binaries are byte-for-byte copies of what the previous build
emitted into `.next/static/media`.** Not re-fetched, not re-subsetted, not
re-encoded. That was a deliberate choice over downloading from Google and
subsetting with fonttools: it removes "did the glyphs change?" from the review
entirely, and it needed no network and no toolchain. **214 KiB ships (219,240
bytes), down from 482 KiB (493,144);** the 13 dropped `latin-ext` / cyrillic /
vietnamese / math faces were 267 KiB, 56% of the payload.

_(Those three numbers were first written as 228 / 524 / 313 KB, which were `du`
**block** counts — disk occupancy at the filesystem's allocation granularity, not
bytes transferred. Corrected from apparent size before the PR merged. A unit that
is nearly right is the kind that never gets questioned.)_

**The trap that cost the first two builds:** Turbopack's SWC transform
**serialises `localFont()` arguments statically and DROPS whatever it cannot
evaluate.** A `src: atWeights({...})` helper produced `missing field 'src'` at
resolve time. A dropped `src` fails loudly — but a dropped `declarations` would
fail **silently**, costing a subset's `unicode-range` with nothing going red.
`__tests__/fonts-are-local.test.js` guards exactly that, and its
discrimination cases separate a real helper call from prose in a comment that
merely mentions one (the first run failed on `app/fonts.js` for precisely that
false positive).

**The ordering rule, which is the part a future session must not undo:** a family
needing two unicode-ranges needs two `localFont()` calls, because `declarations`
applies to every face in a call. The half carrying the size-adjusted fallback
face goes **LAST** in every stack — that face is `local(Arial)` with no
unicode-range, so ahead of a real face it swallows that face's entire script.
That is PR #2505's Arial-captures-Hebrew failure, one level up.

### Verification, and what each control bought

| Claim | Instrument | Control that made it mean something |
|---|---|---|
| build makes zero font-host requests | build with proxies pointed at a dead port | **`origin/staging` in a worktree exits 1** on `Failed to fetch Heebo from Google Fonts`; this branch exits 0 |
| typefaces unchanged | CDP `CSS.getPlatformFontsForNode` | a headline node whose face is not in question; harness exits 1 if it resolves nothing |
| pixels unchanged | two servers, one per build, 12 surfaces | same-build noise floor, **plus** a self-test that blocks the `.woff2` and requires the gate to fail (35.05%, delta 220) |

**Three probe defects caught by controls, all of which would have shipped as
findings.** Recorded because this is the class the repo keeps paying for:

1. **The first blocked-build control failed for the WRONG REASON.** Turbopack
   rejected a symlinked `node_modules` ("points out of the filesystem root") and
   never reached the font fetch. A red is not evidence of discrimination just
   because it is red. Re-run with `cp -al`.
2. **The first parity harness reported 100% differences on three surfaces.**
   `fullPage` screenshots vary in height between two loads of the same build, and
   unequal canvases scored as 100%. **The same-build floor was also 100% on those
   surfaces** — that is what caught it. Without the floor it reads as a finding.
3. **"333 test files failed" was an artifact of the shell's cwd resetting between
   tool calls**, so vitest resolved the repo root instead of `frontend/`. Run from
   the right directory: **308 passed, 2714 tests**. Alarming, confident, wrong —
   and nothing in the output said so.

A fourth near-miss worth its own line: reading the OLD build's emitted CSS showed
a `DM Sans Fallback` face present **despite `adjustFontFallback: false`**, which
read as a live Arial-captures-Hebrew regression on staging. Measuring it with CDP
showed Hebrew still resolving to **Heebo** — `local(Arial)` finds no font
literally named Arial on Linux, so the face never loaded. The artifact was real;
the conclusion drawn from it would have been false.

### Post-merge — the claim re-measured on `origin/staging`, both directions

The pre-merge control ran against the branch. **A merged tree is a different
artifact, and "the build passed" is not the claim the card makes** — the claim is
that the build reaches no font host. So both arms were re-run after the merge, in
the same container, minutes apart, with `HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY`
pointed at a dead port:

| Tree | Result |
|---|---|
| `59f4bfcb` — merged staging tip (`next/font/local`) | **exit 0**, `✓ Compiled successfully in 18.4s`, **7** `.woff2` emitted, **zero** `gstatic` occurrences in the emitted CSS |
| `889d9043` — its parent, pre-merge staging (`next/font/google`) | **exit 1**, `Failed to fetch Cormorant Garamond / DM Sans / Frank Ruhl Libre / Heebo from Google Fonts`, **0** `.woff2` emitted |

`.next` was moved aside before each run, so neither result came out of a cache.

**The control is why the green means anything**, and re-running it after the
merge — rather than quoting the earlier one — is the point: a control
establishes that the block bites *in the environment and at the moment you are
claiming it bit*. The pre-merge run had that property for the pre-merge tree
only.

**One precision the error text supplies for free:** the loader fails on
`fonts.googleapis.com` (the CSS metadata request) before it ever reaches
`fonts.gstatic.com` (the binaries). Both hosts are gone from the build path; a
claim naming only `gstatic` would be describing the second half of a request
chain whose first half is what actually fails.

### `adjustFontFallback` — measured, not assumed

`next/font/google` reads metrics from a precomputed DB; `next/font/local` reads
them from the file. Largest movement **1.16 percentage points** (Cormorant
ascent). Full before/after table in the PR body. These govern the pre-swap
fallback box, not the settled render.

DM Sans's `adjustFontFallback: false` now takes effect for the first time — under
Turbopack the google loader emitted the fallback face anyway. The intent is
restored, not dropped.

### ⛔ MEH-1962 (Lighthouse baseline) — NOT STARTED, blocker re-verified

Third session to reach this card, and the blocker holds. **I did not re-derive
it** — two prior comments (16:56Z, 18:17Z) already carry the analysis. I
re-measured only the load-bearing fact, with a control:

| Probe | Result |
|---|---|
| `registry.npmjs.org` (control — must be reachable) | **200**, connect 0.004s |
| `foodmamkor-staging.up.railway.app/producers?limit=1` | **000**, connect 0.0004s — refused, not timed out |
| `producer-card` count on the local build's `/he/producers` | **0** |

4 of the card's 5 routes are data-driven. Measuring them here yields LCP with no
images, transfer-KB with no catalog, CLS with no content settling — numbers that
are wrong **in the flattering direction** and would be recorded as a ceiling
nobody re-verifies. The brief for this task asked for a known-answer instrument
control; the control is what fails.

**No numbers cited, no code written, no branch pushed.** Needs an environment
that can see the backend (Sapir's machine or CI). Note also that
`/producers/by-slug/*` currently 500s (MEH-1906), so even an authorised
environment would measure error pages today.

---

## Findings worth carrying, beyond the cards

### `StoryCardCanvas.jsx` still fetches gstatic at RUNTIME → **filed as MEH-2043**

`components/StoryCardCanvas.jsx:35-36` carries two hardcoded
`https://fonts.gstatic.com/...woff2` URLs. **So the CSP `font-src
https://fonts.gstatic.com` entry is still required** — I went to tighten it after
the migration and found the reason it must stay. Not touched here (a CSP edit is
its own risk class, and MEH-1959 owns security headers).

The card carries one trap that a fast fix would walk into: the canvas draws a
**Hebrew** business name, and the local `frank-ruhl-libre-latin.woff2` is latin
only. Pointing it at the wrong committed subset produces a default-font export
with nothing failing.

### `next/font/google` ignores `adjustFontFallback: false` under Turbopack

Measured from the emitted CSS of a `origin/staging` build. Now moot for this repo
— nothing uses that loader after #2838 — but it means the tuning PR #2505
documented as load-bearing was not actually in effect for some time.

### `frontend/.ds-sync-css/input.css:4` has an `@import` from fonts.googleapis.com

Design-sync scratch input, not shipped. Recorded so the next `grep` for
google-font references does not read it as live.

---

## Lane-boundary calls made this session — stated, not assumed

- **`frontend/e2e/**` and `frontend/__tests__/**` are outside the declared lane**,
  but the card's DoD names a CDP verification and ORDERS §3 requires an evidence
  bundle. Wrote them, same call the previous Lane B session made and recorded.
  Files: `e2e/qa-meh2029-font-resolution.mjs`,
  `e2e/qa-meh2029-visual-parity.mjs`, `__tests__/fonts-are-local.test.js`,
  and an extension to `__tests__/FontVariableTokens.test.js`.
- **`__tests__/FontVariableTokens.test.js` was EXTENDED, not loosened.** It is
  PR #2505's guard and it correctly went red: `--font-[a-z]+` cannot match
  `--font-headline-latin`, and its family→variable map assumed one variable per
  family. Both were widened to the two-variable model and two self-test fixtures
  were corrected so each still fails for the reason it names.
- **`docs/CHANGELOG.md` / `HANDOFF.md` never touched** — hence this file.
- **No worktree for the lane.** One session in this container. A throwaway
  worktree WAS created at `/tmp/meh2029/control` to hold `origin/staging` for the
  blocked-build control and the pixel comparison; it is not a lane worktree and
  is removed at session end.
- **A parallel actor pushed staging syncs onto this branch twice**, once
  rejecting my push as non-fast-forward. Theirs was adopted
  (`git checkout -B … origin/…`) and the diff re-verified intact rather than
  re-applied — ORDERS §2 makes a foreign write on a shared branch something to
  reconcile, not something to overwrite.

## One finding retracted on the PR, in public

I attributed five failing producer specs to the `/producers/by-slug/*` 500s
(MEH-1906) that the server log was full of. **A re-run of the identical head
passed those specs while the 500s were still present**, which refutes the
attribution outright; a fourth E2E sample later showed the inverse — no backend
500s in the log at all, and the same failure count. Four samples, and the two
variables never moved together.

The retraction was posted on the PR rather than quietly dropped, because a
withdrawn finding is evidence the reasoning was checked and a silent one is not.
What the samples do support is narrower and was stated as such: the final failure
set (`30-login-journey-c.spec.ts:394`, desktop + mobile) is **exactly staging's
own**, so it is inherited, not caused here.

**The shape to notice:** a loud, plausible, *co-occurring* fault is the most
comfortable explanation available for an unrelated failure, and it is exactly the
one the Bug Protocol's §6 forbids adopting without proof. It was adopted anyway,
and only a control run — same head, twice — separated them.

## Review status

**The different-model adversarial review was NOT run.** This session's harness
instructions forbid spawning subagents unless explicitly requested, and no such
request was made. Maker and checker are the same session. Stated in the PR body
rather than dressed up as a review.
