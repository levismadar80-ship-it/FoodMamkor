# Pre-launch quality stack — 4-tool evaluation

> Research deliverable for MEH-557. Decision-oriented, not exhaustive. Audience: Smadar deciding which of the 4 Tier-1 issues (mutation, load, visual regression, property-based) to greenlight before launch. Read on mobile in ≤10 minutes.

**Stack constraints I am evaluating against:** FastAPI + Next.js + PostgreSQL on Railway free tier; Hebrew RTL frontend; existing test stack — pytest, Playwright E2E (5 flows), Vitest (33 tests), 4 adversarial-review variants, pip-audit + npm-audit, Sentry + dashboard-receipt; solo founder.

## TL;DR — verdicts

| Tool | Verdict | Setup (hrs) | CI cost (min/PR) | ROI | Why |
|---|---|---|---|---|---|
| **mutmut** (Python mutation) | **SHIP — narrow** | 3–4 | +2–4 on auth/security paths only | HIGH | Auth = SPOF; mutation is the only thing that proves the auth tests *catch* bugs |
| **k6** (load testing) | **SHIP — minimal** | 2 | 0 (manual, staging-only) | MEDIUM | Cheap to script a 100-VU ramp against staging; surfaces Railway free-tier crashes before launch night |
| **Playwright visual regression** | **DEFER** | 4–6 | +3–6 with CI flake risk | MEDIUM | Built-in snapshots flake on font rendering; Hebrew RTL amplifies false-positives; Percy/Chromatic adds $$ or vendor lock |
| **Hypothesis** (property-based) | **SKIP** | 2 per surface | +1 per surface | LOW | Validators (`mask_phone`, price) already have decent example coverage; not a launch blocker |

ROI bands: HIGH = blocks a launch-night incident class; MEDIUM = reduces a known risk but post-launch is still acceptable; LOW = nice-to-have, no specific risk it closes pre-launch.

---

## 1. Mutation testing — `mutmut` (Python) / Stryker.js (JS/TS)

**What it proves:** the existing tests would actually fail if the code under test were broken. Replaces `>` with `>=`, flips booleans, returns `None` — runs the suite — counts how many mutations survive (= test gap).

**Setup cost (mutmut):** `pip install mutmut` + minimal `setup.cfg`; first full run is slow because every mutation re-runs the suite. Limit scope to `backend/app/auth.py` + `backend/app/security.py` first — these are the SPOFs. 3–4 hours to wire and review the first mutation report.

**Runtime cost:** full repo mutation run is hours, not minutes. Strategy: run it locally (or in a scheduled GH Action), not in PR CI. Gates as "every Friday on changed-file scope" instead of per-PR.

**Fit-to-stack:** mutmut is well-suited to FastAPI codebases; Stryker.js exists for the Next.js side but the Next.js code is mostly view layer where mutation tests catch fewer real bugs than they catch in pure business logic. Recommend Python-only scope.

**Hebrew RTL angle:** none — mutation operates below the I/O layer.

**Railway angle:** none — runs locally / in CI runner, no production hit.

**Risks:** equivalent mutations inflate noise; manual review of the first report is mandatory. Most teams give up at this step — solo founder more likely to give up unless scope is tight.

**Verdict: SHIP narrow.** First action: `pip install mutmut && mutmut run --paths-to-mutate backend/app/auth.py`. Goal: 80% mutation-kill rate on `auth.py` before launch.

**Sources:** [mutmut docs](https://mutmut.readthedocs.io/) (official); [Stryker.io mutation-testing introduction](https://stryker-mutator.io/docs/) (concept reference); Hovmöller, "[Mutation testing with mutmut](https://hackernoon.com/mutation-testing-in-python-with-mutmut)" (third-party walkthrough — confidence: high on canonical URL, verify before merge).

---

## 2. Load testing — k6

**What it proves:** the system serves N concurrent requests within latency budget without 5xx. Specifically for Mehamakor: does Railway free tier survive a 100-VU ramp against `/producers`, and does `POST /chat` (Haiku-backed) degrade gracefully when the Anthropic SDK queue fills?

**Setup cost:** `npm install -g k6` (or run via Grafana Cloud k6 free tier from outside Railway), write one `loadtest/producers.js` script — 2 hours including the smoke script and one ramp scenario.

**Runtime cost:** zero in CI. Run manually against staging, not production, the week before launch. Burning Railway free-tier minutes against production is a footgun this evaluation should call out: **do not script k6 against `foodmamkor-production.up.railway.app`** — staging-only.

**Fit-to-stack:** k6 is FastAPI-friendly (HTTP-level, no SDK dependency). Artillery is a comparable alternative; k6 wins on Grafana Cloud integration and a stronger JS scripting model. Artillery wins on simpler YAML config.

**Hebrew RTL angle:** none — k6 is HTTP, no rendering.

**Railway angle:** the canonical risk this tool catches. Railway free tier has documented CPU/memory throttling under sustained load; a launch-night spike of 100 simultaneous browses to `/producers` (3 Wolt-style notifications + 1 Instagram link) is plausible. Catching this on staging saves a SEV-1 on launch night.

**Risks:** false confidence if k6 is run against an under-provisioned staging vs production. The staging Railway environment must be on the same plan as production for the result to mean anything.

**Verdict: SHIP minimal.** First action: write `loadtest/producers.js` (50 VU, 2-min ramp, 5-min hold) and run from a laptop against staging. One run, one report, append to `docs/INCIDENTS/2026-05-launch-readiness/` as a pre-launch artifact.

**Sources:** [k6 docs](https://k6.io/docs/) (official); [Grafana k6 vs Artillery benchmark thread](https://github.com/grafana/k6/discussions) (third-party — confidence: medium, search the repo discussions before citing the exact thread); k6 OSS engineering blog posts (canonical, verify URL).

---

## 3. Visual regression — Playwright snapshots

**What it proves:** pixel-diffs across PRs surface unintended UI changes (e.g. a Tailwind config bump that shifts every card by 4px).

**Setup cost:** `screenshots.spec.ts` already exists; adding `expect(page).toHaveScreenshot()` to each page costs 4–6 hours including baseline capture + initial CI tuning.

**Runtime cost:** +3–6 minutes per PR depending on viewport count. More important — the failure mode is **flaky CI**: font subpixel rendering differs across runners and OS versions, producing diffs that are not real regressions.

**Fit-to-stack — Hebrew RTL is the disqualifier.** Hebrew/RTL pages stress the font-rendering layer harder than LTR (right-to-left bidi text, mixed Hebrew/Latin, web font substitution). Playwright's built-in snapshot tolerance (`maxDiffPixels`) helps but does not eliminate the flakiness. To get a reliable RTL visual-regression suite you need either Percy ($), Chromatic ($), or an in-house image diff with perceptual-hash tolerance — outside the free-tooling spirit of this evaluation.

**Railway angle:** none.

**Risks:** flake cost compounds — a noisy visual-regression suite is a suite that gets disabled, which is worse than no suite (false sense of coverage). Without funded vendor (Percy/Chromatic), pre-launch ROI is negative.

**Verdict: DEFER.** First action post-launch: revisit with a budget. Pre-launch substitute: existing manual mobile review per workflow rule 9 ("בדיקי על Vercel preview"), which is what catches RTL regressions today.

**Sources:** [Playwright snapshots docs](https://playwright.dev/docs/test-snapshots) (official); [Percy / Chromatic comparison](https://www.chromatic.com/docs/turbosnap/) (third-party — canonical product page; for a neutral benchmark see Storybook-team posts comparing the two).

---

## 4. Property-based testing — Hypothesis (Python)

**What it proves:** the function holds the invariant across thousands of generated inputs (e.g. `mask_phone(any_string)` never returns the unmasked string; price validator rejects every negative or non-numeric input).

**Setup cost:** ~2 hours per validator surface. Targets in this repo: `mask_phone`, price validators, `field_validator` regex helpers (e.g. MEH-555's letter-count rule).

**Runtime cost:** +1–2 min in pytest per surface (Hypothesis re-runs N=100 examples by default). Negligible.

**Fit-to-stack:** Python-only. Works cleanly with pytest. No Hebrew-text-specific tooling, but Hypothesis's `text()` strategy generates Unicode out of the box — Hebrew strings will appear in the generated inputs, surfacing bidi edge cases the existing example tests do not cover.

**Hebrew RTL angle:** the only RTL-positive tool of the four. Generated text inputs sometimes mix Hebrew + Latin + emoji + zero-width-joiners, which exercises the validator more than 6 hand-crafted strings.

**Railway angle:** none.

**Risks:** generates "interesting" failures that are bugs in the *test*, not the code. Triage cost adds up. Pre-launch, the auth and DB surfaces are the priority, and they are not where Hypothesis shines.

**Verdict: SKIP pre-launch.** Revisit post-launch when validator surfaces grow. If a SEV-2 lands on a validator edge case, this becomes the fix.

**Sources:** [Hypothesis docs](https://hypothesis.readthedocs.io/) (official); David MacIver, "[What is property-based testing?](https://hypothesis.works/articles/what-is-property-based-testing/)" (canonical third-party essay by Hypothesis's author; confidence: high on hypothesis.works canonical URLs, verify before merge).

---

## Recommendation order

1. **mutmut on `auth.py`** — this week (highest ROI / lowest scope).
2. **k6 50-VU staging run** — week before launch.
3. **Visual regression** — defer to post-launch; revisit with Percy/Chromatic budget.
4. **Hypothesis** — skip; reactivate if a validator SEV-2 surfaces post-launch.

## Confidence calibration

- mutmut on auth — high confidence this is worth the 3–4 hours. The auth-incident class (MEH-265, MEH-326) is documented and recurring; mutation is a known mitigation.
- k6 staging run — medium confidence. The Railway-free-tier-under-load risk is plausible but unobserved. A single k6 run may not catch it if traffic shape differs from real users.
- Visual regression — high confidence this is a *defer*, not a *skip*. RTL flake risk is documented; Percy/Chromatic post-launch is the right path.
- Hypothesis — medium confidence on skip. If MEH-555's letter-count validator family grows past 3 fields, ROI flips.

## Out of scope

- Datadog Synthetics, Pingdom, BlackBox monitoring — covered by MEH-563 (synthetic monitoring).
- Contract testing (Pact) — separate concern, not in the 4-tool brief.
- Chaos engineering (LitmusChaos, Gremlin) — overkill for solo founder pre-launch.
