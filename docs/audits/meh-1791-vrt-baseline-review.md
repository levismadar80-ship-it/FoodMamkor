# MEH-1791 — candidate-baseline review: `login` + `register` (desktop + mobile)

**Date:** 2026-07-31 · **Reviewed commit:** `ddfe11e7` (vrt-update bot regen, merged to
`staging` in PR #2446) · **Verdict: RATIFIED — every diff traces to a deliberate commit.**

**An eye pass already happened, and this is not a claim that it didn't.** PR #2446's body
carries a per-baseline table, states all four PNGs were opened, and records that Sapir
reviewed them independently and approved. That is the
[MEH-1552](https://linear.app/mehamakor/issue/MEH-1552) rule being followed, not skipped.

This is a **second, independent pass** — worth running for one reason: PR #2446's review was
written by the session that produced the regen, and its own checklist says so
(*"maker and checker are the same session"*). A review confirms what it went looking for.
That one checked the **expected** delta — the Google button — and found it, correctly.

It did not catalogue what else was riding along. **Two further changes are in those four PNGs
and appear nowhere in that table** (§2, rows 2–3): the desktop LanguageToggle and the removal
of the mobile ChatWidget launcher. Both are legitimate and both trace to deliberate commits —
but both had been invisible to VRT since 21/07 and 28/07, and this regen is what committed
them. Finding them is what a second pair of eyes buys.

---

## 1. The ticket's diagnosis was wrong on two load-bearing points

Recorded here because MEH-1791 is cited as *"ההוכחה האמפירית הראשונה"* for
[MEH-1601](https://linear.app/mehamakor/issue/MEH-1601), and an empirical proof that rests
on a false premise is worth less than no proof at all.

### 1a. E2E **did** run on both commits

MEH-1791: *"כל דחיפה ל-staging מאז הייתה docs-only, ולכן `Playwright E2E` → `skipped`."*

The `push` runs on `staging` say otherwise:

| Commit | Run | Conclusion |
|---|---|---|
| `896cced0` (home chips) | `30633727614` | success |
| `cccb7861` (register/producer AddressSearch) | `30633862902` | **success — the suite ran** |
| `a175f267` (arm 09-login-console-clean) | `30633891325` | **failure — the suite ran and went red** |

Nothing was hidden. `a175f267` broke VRT **in the open**, and its own commit body says so:

> *"The parity.spec.ts login+register baselines are also now stale (the OAuth section
> renders where it previously did not) and need a VRT regen."*

That is an announced, deliberately-deferred regen — not a silent skip.

### 1b. `cccb7861` did not touch these baselines at all

MEH-1791 attributes the `register` drift to `cccb7861` (canonical `AddressSearch` wired into
producer registration). That commit changes `RegisterProducerClient.jsx`, which renders
**`/register/producer`**. The parity spec captures **`/register`** — the consumer form
(`parity.spec.ts:704-716`, `page.goto("/register")`). Different route, different component
tree. `/register/producer` has no VRT baseline.

### 1c. `ProducerOAuthButtons.jsx` is not on the `/login` tree either

MEH-1791 also says `a175f267` *"נגע ב-`ProducerOAuthButtons.jsx` (מרונדר ב-login → מסביר את
+104px שם)."* Two errors in one clause:

- **It is not rendered on `/login`.** `ProducerOAuthButtons` has exactly one consumer,
  `app/[locale]/register/producer/RegisterProducerClient.jsx`. `/login` and `/register` render
  `GoogleAuthButton` + `AppleAuthButton` (`LoginClient.jsx:198,204`;
  `RegisterClient.jsx:195-197`).
- **The change to it was comment-only.** `git show a175f267 -- frontend/components/ProducerOAuthButtons.jsx`
  is a single replaced comment block correcting a false one-initialize-per-page claim. Zero
  executable lines. It cannot move a pixel.

### The actual cause

**The whole drift has one cause**, and it is `a175f267` — not any component change in it, but
the *workflow* change: it set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `e2e.yml`. `RegisterClient.jsx:195`
gates the OAuth section on `!!env.NEXT_PUBLIC_GOOGLE_CLIENT_ID`, and
`use-google-sign-in.js:26` returns early without it — so the block rendered in CI **for the
first time**. Everything else follows from that one env var.

---

## 2. What changed, and what each change traces to

`qa-artifacts/MEH-1791/01-04` carry the before/after pairs (left = pre-`ddfe11e7`,
right = the committed baseline).

| # | Change | Where | Traces to | Deliberate? | Named in PR #2446's review? |
|---|---|---|---|---|---|
| 1 | Google sign-in button + `או` divider appears | all 4 | `a175f267` (MEH-1778) — `NEXT_PUBLIC_GOOGLE_CLIENT_ID` added to `e2e.yml` | ✅ announced in the commit body | ✅ yes — the whole table |
| 2 | Globe **LanguageToggle** appears in the desktop header | `login-desktop`, `register-desktop` | `9fe84a06` (2026-07-28) *"restore the desktop LanguageToggle — /en was a one-way door"* | ✅ | ❌ **no** |
| 3 | ChatWidget launcher **disappears** on mobile | `register-mobile` | `e4b725a0` (2026-07-21, #2012) *"restore ChatWidget to desktop-only (>=768px)"* — `ChatWidget.jsx:239` `if (!isDesktop) return null` | ✅ | ❌ **no** |

Rows 2 and 3 are the finding. Not because they are wrong — they are both correct product
behaviour — but because a baseline regen is the moment accumulated invisible drift gets
written down, and a review that only confirms the change it expected will pass over it.

Heights, measured from the PNG headers:

| Baseline | Before | After | Δ |
|---|---|---|---|
| `login-desktop` | 1440×1442 | 1440×1442 | 0 (fixed-height hero split) |
| `login-mobile` | 393×1670 | 393×**1774** | **+104** |
| `register-desktop` | 1440×1422 | 1440×**1516** | **+94** |
| `register-mobile` | 393×1852 | 393×**1948** | **+96** |

`+104` / `+96` match the deltas MEH-1791 reported from CI exactly.

### Why changes 2 and 3 were riding along in a login/register regen

Neither is new. They landed on 21/07 and 28/07 and **VRT never caught either**, because each
fits under the tolerance: `playwright.config.ts:61` sets `maxDiffPixelRatio: 0.02`, which on
mobile (393×1852) is a **14,556 px** budget. A ~56 px ChatWidget launcher is ≈2,500 px.

This is [MEH-1765](https://linear.app/mehamakor/issue/MEH-1765) verbatim, and it is why the
tolerance question stays in MEH-1765 and is **not** touched here.

**Internal consistency check that makes the attribution safe rather than plausible:** the two
mobile baselines were captured on different dates — `register-mobile` on 18/07 (`01ff4793`),
`login-mobile` on 29/07 (`e9a02c98`). The ChatWidget gate landed 21/07, *between* them. So the
prediction is that the pre-regen `register-mobile` shows the launcher and the pre-regen
`login-mobile` does not. **It does, and it doesn't** — visible in artifacts `02` and `04`.
A coincidental or regression-shaped explanation does not produce that split.

---

## 3. Ratification against a live render of today's code

A trace argument explains the diffs; it does not prove the committed PNG matches what the app
renders **now**. That needs a capture.

**Harness discipline (HANDOFF QA-harness rule).** Port 3000 was confirmed free before
starting; the tree was rebuilt with CI's exact env
(`NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, per `e2e.yml:130-149`); and the
running server was proven to serve **that** build rather than a stale `next start` — a served
chunk was byte-compared against the one on disk:

```
d2bcd5c85e7e04fdc3c5fd5afd88ba83571932238370a6d67057261b3ca54b8a  (served over HTTP)
d2bcd5c85e7e04fdc3c5fd5afd88ba83571932238370a6d67057261b3ca54b8a  .next/static/chunks/08wim6u7-nkq7.js
```

**This is not a VRT run, and must not be read as one.** `parity.spec.ts` is pinned to chromium
**v1234**; the sandbox has **v1194**, and `cdn.playwright.dev` is proxy-blocked
(`403 request rejected: host not permitted`), so the pinned build cannot be fetched. Comparing
pixels across two renderers would prove nothing in either direction. What the capture
establishes is **content**, which per MEH-1765 is the more valuable check anyway.

Result (artifacts `05`, `06` — left = committed baseline, right = fresh sandbox render):

- **`login-mobile`: baseline 393×1774, fresh 393×1770 — a 4 px difference.**
- `register-mobile`: 1948 vs 1924.
- Every gap is accounted for by two hosts the sandbox blocks: `accounts.google.com`
  (so Google's button iframe never paints — the container and the `או` divider are both
  present and correctly positioned) and Cloudinary (hero image).
- Copy, field order, footer, and nav are identical.

**The authoritative VRT signal is CI, and it is green.** Run **`30645351152`** on `staging`
(`0799e3c6`, 16:05Z today):

```
✓ e2e/visual/parity.spec.ts:691 › Visual parity — MEH-991 › login
✓ e2e/visual/parity.spec.ts:704 › Visual parity — MEH-991 › register
2 failed  32 skipped  186 passed
```

Both failures are `09-login-console-clean › no GSI double-init warning`, desktop + mobile —
the pre-existing MEH-1776 / MEH-282 defect that MEH-1778 armed the detector for, and which
`a175f267` states is **expected red** until it lands. Not VRT, and not in this ticket's scope.

> **As-of note — the world moved while this PR was open, which is the whole point of §3.**
> `f3f59a20` (MEH-1784, *"initialize GSI once per document without losing per-consumer
> callbacks"*) merged to `staging` at 19:19 IDT, after run `30645351152` was captured. It is
> the fix those two reds were waiting for, so the "2 failed" figure above is **true as of
> 16:05Z and expected to be stale now** — cite the run, not the count.
>
> It does **not** invalidate the four baselines. The change is confined to `initialize()`
> de-duplication and callback ownership in `use-google-sign-in.js`; it adds no markup and
> does not touch `renderButton`, so what the OAuth block *looks like* is unchanged. This
> branch carries the merge, and its own `Playwright E2E` run is the check on that claim —
> read it rather than this paragraph.

---

## 4. Verdict

**Ratified. No unexplained diff, so nothing was blessed.** All three visual changes trace to
named, deliberate commits; the committed baselines reproduce against a live render of today's
code to within 4 px on the tightest case, with every remaining gap attributable to a blocked
external host.

**Nothing to regenerate.** `ddfe11e7` already did it, correctly, and it merged at 17:12 IDT —
**two minutes before MEH-1791 was filed at 17:14.** The ticket describes a state that had
already been resolved; every one of its four "מה צריך לעשות" items was either done or moot
before it was written. Regenerating again would have rewritten four correct PNGs for no
reason — and, on the MEH-1765 argument, would have been a *worse* outcome than leaving them
alone, since a second regen produces no diff for anyone to review.

What this ticket was actually worth is in §1 (two wrong attributions, now corrected), rows 2–3
of §2 (drift the first review did not name), and §5 (the gate). None of that needed a
baseline touched.

---

## 5. The gate finding — and it is not the one the ticket names

`E2E gate` **is not a required check.** On PR #2446 it reported `failure` and the PR merged
anyway — no override needed, because a non-required context cannot block. The required
contexts carry the suffix in their names — `CI gate (required)` and `Deploy gate (required)` —
and `E2E gate` does not. This is *documented and intentional*:
`.claude/rules/testing.md` records precondition **B** (the suite must be green before the
context joins ruleset 15240090), and the suite is not green — MEH-1776 keeps it red. So a red
E2E blocks nothing on `staging` today. Known, accepted, **not** silent.

The genuinely silent part is second-order:

> A docs-only push repaints the branch tip green. The `E2E gate` aggregator maps
> `skipped → pass` (`ok() { case "$1" in success|skipped)`), so after any docs-only push the
> newest `staging` run reads `success` — indistinguishable from "ran and passed."

That is what `staging` looks like right now: tip `5343955b` shows E2E **success** (skipped,
docs-only), while the last run that actually executed — `0799e3c6` — was **red**. Reading the
tip is how you conclude "E2E never ran on those commits," which is precisely the inference
MEH-1791 made.

**MEH-1601 mechanism 1 is already fixed and its patch doc does not say so.** `207b9894`
(27/07) changed `e2e.yml`'s concurrency group from `github.ref` to `github.run_id`, so staging
pushes no longer cancel each other. `docs/ci/e2e-concurrency.patch.md` still prints the old
line as the live one — corrected in this PR, because a reader applying it today would
re-apply a landed fix and conclude MEH-1601 was closed while mechanism 2 stands.

**CC changed no gate.** `.github/workflows/**` is CC-deny (MEH-671) and rule 30 forbids
neutralising a blocking gate. Mechanism 2 needs a decision from Sapir, not a patch from CC:
either the aggregator stops reporting a docs-only skip as the branch's E2E verdict, or the
staging-tip signal keeps being read as stronger than it is.

---

## Cross-references

- `.claude/rules/testing.md` — candidate-baseline rule, the `maxDiffPixelRatio` note (MEH-1765),
  required-checks matrix
- `docs/ci/e2e-concurrency.patch.md` (MEH-1601) · `docs/ci/e2e-gate.patch.md` (preconditions A/B)
- `CLAUDE.md` → 5-state rule, *"baseline של טסט VRT חדש הוא candidate, לא אמת"*
