# Testing rules

Rules 5, 5a, and 20 from the workflow list — grouped here because they
describe the same pre-merge pipeline.

---

## Rule 5 — Tests before implementation

Write the failing test first (pytest for backend, playwright/component
for frontend), then make it pass. See
[docs/TESTING.md](../../docs/TESTING.md).

### Frontend critical flows — Playwright test required before writing code

- login / register
- WhatsApp button click
- פרסום מוצר שכנה (home product form)
- טופס הרשמת עסק

### NOT required for

- Styling changes
- Color / spacing tweaks
- Minor UI adjustments

### Test dummy URLs must be real backend routes with a matching method

`scripts/check_api_contract.py` (the "API contract audit (static)" job
that feeds the **Deploy gate**) scans `frontend/__tests__/**` too, not
just app code. An `api.get(...)` / `api.post(...)` in a test with an
arbitrary path fails the gate: a path the backend doesn't serve →
orphan-frontend (404 risk); a path served under a different verb →
method mismatch. Pick a route that exists with the verb you call — e.g.
`GET /auth/me`, **not** `GET /users/me` which is PATCH-only. Local check
before pushing any test that hits the API:

```
python scripts/check_api_contract.py   # expect: Method mismatches: 0 · Orphan frontend … 0
```

_Source: MEH-1315 (2026-07-18) — `api.get("/users/me")` in the new
retry-once test tripped a method mismatch and reddened the Deploy gate;
swapped to `GET /auth/me` (a real route, not in `SKIP_REFRESH`)._

---

## Every new guard test must be shown failing (MEH-1619)

A guard test that has never been observed failing is not evidence — it is a green light
of unknown wiring. Any new or strengthened assertion (unit, e2e, or QA harness) ships
with a **demonstrated failing-by-construction run**: break the thing it guards, show it
goes red, restore, show it goes green. Put the two outcomes in the PR body.

**The construction has to discriminate.** This is the part that is easy to get wrong.
Showing "I broke it and the suite went red" proves nothing about *your change* if the
**previous** version of the assertion also went red on that same construction. Before
citing a failing run as justification, ask: would the old assertion have passed this?
If you can't answer yes, the run is not evidence for the change.

_MEH-1619, C-1: reintroducing a known-broken CSS form turned the suite red — and the old,
weaker assertion failed on it too, because by sample time the library had already undone
the broken state. The construction couldn't tell the two apart. What did: a **self-test**
feeding the real classifier three synthetic inputs (correct / regression-shaped / neutral)
and asserting how it sorts them. Deterministic — no animation, no timing — and it isolates
exactly the changed condition._

**Where the assertion is a classifier, ship the self-test.** Run it **first**: if the
classifier can't tell a correct state from a broken one, nothing it reports afterwards is
worth reading. Exercise the **real** implementation, never a copy — a second copy is free
to drift from the one that matters. Repo precedent: `.claude/scripts/audit-skills.sh
--self-test`, which CI asserts must exit 1.

**Watch the shape of the pass condition.** An `||` between two cues lets either one carry
the assertion, so losing the other is undetectable — that is how a probe signs off on a
broken state. Prefer `&&`, or split into separate named checks so the failure message says
which cue went missing. A null-safe read (`(x || "")`) is not this pattern and is fine.

**Lifting a quarantine is not the fix.** A `count()===0` skip reports green against a
control that does not exist — proven on MEH-1698, where the old spec skipped past a
completely missing element with only `test.fixme` lifted.

That last clause is the whole rule, and it is why "un-quarantine it" is the wrong first
move on any silent spec. The MEH-1698 file carried **two** disablers stacked — a
`test.fixme` and, under it, `if ((await toggle.count()) === 0) test.skip(...)`. The
obvious reading is that the quarantine was the problem. It was not: run the spec with the
`fixme` removed and the skip intact, against a Header from which the control had been
deleted entirely, and it still reports **skipped — exit 0**. The quarantine was decoration
on top of a guard that could never have failed.

The defect class is a guard that **consults its own subject**. `count()` on the element
under test, `length === 0 → skip`, `if (!el) return` — each reads as defensive
hygiene and each converts "the thing is gone" (the exact condition worth failing on) into
"nothing to check". Gate on something the product cannot move instead: a static project
identity (`test.skip(testInfo.project.name !== "desktop")`, as
`e2e/visual/parity.spec.ts:522` does), an env var, a fixture file's presence.

**The review question:** if the element vanished entirely, does this test go red — or
green? If you cannot answer from reading it, run it against a build with the element
deleted. That two-run control is the only thing that distinguishes a guard from a
decoration, and it is cheap.

**A green VRT is not evidence that the frame is unchanged — read the text in it (MEH-1765).**
`playwright.config.ts:61` sets `maxDiffPixelRatio: 0.02`. On the mobile project (Pixel 5,
393×851, no `fullPage`) that is a **6,688 px** budget; on desktop (1440×900), **25,920 px**.
Both are large enough to swallow a complete copy change or the loss of a navigation control.
Measured on 29/07: the `home` hero label went `«מחפשות עכשיו:»` → `«פופולרי עכשיו:»` (~2,800 px
of ink) and VRT stayed green; the MEH-1390 producer-detail tab bar went from **4 tabs to 2**
(~3,100 px) and a scoped regen reported *"Baselines unchanged — nothing to commit."*

The second-order effect is what makes this dangerous rather than merely loose: because
`--update-snapshots` rewrites only a **failing** snapshot, a passing comparison produces **no
new PNG** — so there is nothing for the eye pass to review, and the change leaves no trace in
the diff at all. *"Baselines unchanged"* means **"under tolerance"**, never **"the frame is the
same."** Any baseline review must therefore read the rendered strings, and any claim that a
surface is unaffected needs a source other than a green VRT. Whether 2% is the right number is
MEH-1765 — do not change `playwright.config.ts` under another ticket.

**Requesting a regen by label instead of by dispatch:**
[docs/ci/vrt-label-trigger.patch.md](../../docs/ci/vrt-label-trigger.patch.md) (MEH-1764,
staged for Sapir — `.github/workflows/**` is CC-deny). That doc also records, with run ids,
that CC's GitHub App **does** hold `actions: write`: `vrt-update.yml:15`'s claim to the
contrary is false, and the label path is a deliberate narrowing of a permission CC holds —
not a workaround for one it lacks.

**Restoring an old artifact is not ratification.** A runner-generated image carries
**credibility, not currency** — restoring it returns the first and not the second, and the
file name looks identical either way. Before restoring any baseline, count the commits
touching that surface since the blob was captured; if the answer is not zero, take a fresh
capture instead.

_Proven on `10ed80d7`, which restored a 3.5-day-old `home-mobile` blob across **36
unmeasured home-render commits** — in a PR that cited the MEH-1552 candidate-baseline
lesson while committing the same error in the one disguise that lesson doesn't name._

**The class is wider than VRT: inheriting an artifact's authority without its currency.**
Every instance has the same three parts — an artifact that was rigorously produced, a gap
during which the world moved, and a reuse that carries the rigour forward while silently
dropping the as-of. The artifact is not wrong; it is *stale*, and staleness has no visual
tell. Same shape, different surfaces:

- a **lockfile hash** or dependency pin re-pointed at a previously-audited version
- a **cached CI layer** or fixture reused because it was built from a clean tree — once
- an **audit verdict** (`approved` in `skills-allowlist.json`) carried across a content
  change, which is exactly why MEH-420 made the hash the trust anchor and not the verdict
- a **benchmark or perf number** requoted after the workload changed
- a **screenshot in a ticket** used as current evidence of a live surface

**The question that detects all of them:** *as of when was this true, and what has changed
since?* If the answer needs a count and nobody has counted, the artifact is a claim about
the past being presented as a claim about the present. **Reproduce, don't restore** — and
where reproduction is expensive, record the as-of next to the artifact so the next reader
can do the subtraction. An artifact whose as-of is unrecoverable cannot be ratified at all,
only replaced.

Full class-C sweep + verdicts: [docs/audits/silent-failure-audit.md](../../docs/audits/silent-failure-audit.md).

---

## Rule 5a — Adversarial review before every merge to staging

Run `/adversarial-review` on all changed files. Fix every REFEREE
verdict before opening the PR.

PRs touching `auth.py` / `upload.py` / permissions also get a web-search
CVE check (see [.claude/rules/security.md](./security.md)).

---

## Rule 20 — Review order: CI before adversarial (mandatory)

Every PR must follow this exact sequence:

```
npm run build  →  pytest tests/test_api.py  →  /adversarial-review  →  merge
```

Never run `/adversarial-review` before CI passes — adversarial review on
broken code wastes time.

### Exception — central components

Central components (`MapClient.jsx`, `ProducerDetail`, `main.py`) — run
adversarial even if build fails. Logic risk > syntax risk on these
files. Central component list: `.claude/central-components.json`.

---

## Definition of Done (every PR, no exceptions)

- [ ] `npm run build` passes
- [ ] `pytest tests/test_api.py` passes
- [ ] `/adversarial-review` עבר — all REFEREE verdicts fixed

---

## Required status checks + docs-only merge (MEH-716)

**Staging required checks = 2 aggregator gates:** `CI gate` (`pr-checks.yml`) +
`Deploy gate` (`deploy.yml`). These are the **only** contexts the `protect-staging`
ruleset (ID 15240090) requires — verified against the ruleset API 2026-07-04. The
individual named jobs (`Frontend build`, `Backend tests`, `Backend lint`,
`Env drift`, `Frontend lint (RTL + Next.js rules)`, `API contract audit`, …) are
**not** individually required: they're job-level paths-filter gated and **skip** on
a docs-only or config-only diff, which is expected — a skipped job still lets its
parent aggregate (`CI gate` / `Deploy gate`) report `success`, so both required
gates go green and the PR merges with **no admin override**. (Exactly how the
docs/config-only PRs #1012, #1026, #1485 merged: the named jobs showed `skipped`,
both aggregators showed `success`.) There are **no** "docs-only twin jobs" and none
are needed — an earlier version of this note claimed MEH-736 added them to satisfy
"6 required checks"; both the twins and the six-checks framing were wrong (the
ruleset only ever gated on the 2 aggregators). Full mechanism:
[docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) → "Required checks".

**`Playwright E2E (Vercel preview)` (mobile Pixel 5 + VRT parity) runs on every
PR to staging.** It lives in `e2e.yml`, triggered by `pull_request` + `push` on
`staging` (`e2e.yml:33-37` — the old `deployment_status` trigger was dropped when
MEH-1044 moved E2E to a local `next start` target). The E2E job is **not yet**
wired into the required-check set — the sanctioned way to make it block merge is
the `E2E gate` aggregator (job id `e2e-gate`, `always()` +
`needs: [filter, e2e]`) whose YAML is staged in
[docs/ci/e2e-gate.patch.md](../../docs/ci/e2e-gate.patch.md) for Sapir to apply
(`.github/workflows/**` is CC-deny, MEH-671). Adding the E2E job *directly* to the
ruleset was tried on 2026-07-13 and reverted the same day because it re-introduced
MEH-892 (a skipped-but-directly-required job reads as `Expected` → blocks
docs-only).

> **✅ Precondition A is now MET — `e2e.yml`'s paths-filter DOES skip docs-only.**
> This note previously said the opposite; that was true when written and is not
> true now. The filter (`e2e.yml:62-70`) is **positive-only** today —
> `frontend/**`, `public/**`, `package.json`, `package-lock.json` — with **no**
> negation patterns and **no** `predicate-quantifier`, which is exactly the
> replacement block `e2e-gate.patch.md` prescribed for precondition A.
> **Empirical proof** (MEH-999, 26/07): run `30220080416`, the docs-only staging
> push `80d5c62` — the `Playwright E2E (Vercel preview)` job reported `skipped`.
> The history that produced the old note is still accurate for its date: under
> `predicate-quantifier: some`, each negation (`!**/*.md`, `!docs/**`, …) is an
> additive OR matching nearly everything, so MEH-499's "docs-skip" never worked
> and PR #1741 (run `29283974004`) ran the full suite on 5 `.md` files. The
> negations are simply gone now. (The exact commit that removed them is not
> recoverable — squash-merge flattened `e2e.yml`'s history — so this rests on the
> live file plus the run above, not on a blame line.)
>
> **The gate is still NOT ready for the ruleset — precondition B alone now blocks
> it.** The suite is not green: 2 VRT `parity.spec.ts` failures (`map` desktop,
> `home` mobile) as of run `30220096957`. Adding the context while red would
> block every PR. See [docs/ci/e2e-gate.patch.md](../../docs/ci/e2e-gate.patch.md)
> ("תנאי מוקדם A/B").
>
> **Not to be confused with the *other* e2e.yml problem:** the filter skipping
> docs-only is correct, but combined with the collapsed staging concurrency group
> it silently destroys post-merge coverage — a docs push cancels the previous
> code push's run and puts nothing in its place. That is MEH-1601, and its fix is
> [docs/ci/e2e-concurrency.patch.md](../../docs/ci/e2e-concurrency.patch.md).

Governance + gate matrix:
[ADR-028](../../docs/decisions/ADR-028-qa-gates-per-tier.md) (see Appendix A
amendment). **Docs-only PRs: don't poll E2E** — merge when the **2 required
aggregator gates** are green (a third, `E2E gate`, joins them once
Sapir fixes the filter, greens the suite, applies the patch, and adds the context
to ruleset 15240090).

**Transient "waiting for status / expected" right after push** = the required gates
are still registering (workflow startup), **not** a failure. Let them settle, then
retry the merge once. (Observed on PR #908 — first merge attempt blocked on a
not-yet-reported gate, second succeeded with no override.)

---

## Guarded registries — path-drift validator (MEH-1030)

Some guard/config files list **repo file paths** their tooling depends on. When a
refactor moves or deletes a listed file, the registry silently stops matching and
its guard disables itself with no error — caught reactively twice (MEH-668
`rtl-allowlist.txt`, MEH-1026 `central-components.json`, both after the `[locale]`
migration). `scripts/validate-registry-paths.py` asserts every listed path still
resolves (exit non-zero + offender list on any miss), wired as a `repo: local`
pre-commit hook in `.pre-commit-config.yaml` that runs whenever a guarded registry
or the validator itself changes.

**Currently guarded (2):**

| Registry | Format the validator parses |
|---|---|
| `.claude/central-components.json` | JSON — every string in the `components[]` array |
| `.claude/hooks/rtl-allowlist.txt` | newline list — **only** the `PATH EXCEPTIONS` section (between the two `# ==== … ====` markers); the `CONTENT PATTERNS` markers (`rtl-ok`) are not paths and are skipped |

**Add a registry (two steps — both required):**
1. Append one entry to the `REGISTRIES` list in `scripts/validate-registry-paths.py`
   — `{"file": "<path>", "parser": <fn>}` — reusing `_parse_json_array` /
   `_parse_rtl_allowlist` or adding a small parser that returns
   `[(lineno, repo_relative_path), …]`.
2. Add the new registry's path to the `files:` trigger regex of the
   `validate-registry-paths` hook in `.pre-commit-config.yaml` — otherwise edits
   to the new registry won't re-fire the hook (it only auto-runs when a listed
   registry or the validator itself changes), a silent coverage gap of exactly
   the class this guard prevents.

Path-existence only — no schema/owner checks (over-engineering guard). The
validator emits a stderr `warning: parsed 0 paths …` if a registry's format drifts
so a parser silently returning nothing can't turn the guard into a no-op. Not a CI
gate: `.github/workflows/**` is CC-deny (MEH-671) and collides with MEH-787 on
`pr-checks.yml`; a required-gate form is a separate A2 follow-up.

---

## Driving Playwright against staging from the CC sandbox (TLS workaround)

When you launch Playwright/Chromium against the **live** staging URL
(`https://staging.mehamakor.online`) or a `*.vercel.app` preview **from
the CC sandbox**, force the max TLS version to 1.2:

```js
chromium.launch({ args: ["--ssl-version-max=tls1.2"] })
```

Without it the sandbox's Chromium offers a TLS-1.3 ClientHello that the
Vercel edge drops, surfacing as `ERR_CONNECTION_CLOSED` — which looks like
the site is down but is really the handshake failing. Capping at TLS 1.2
lets the handshake complete.

**Sandbox-only.** Real browsers and the GitHub-hosted CI runners don't
need it — the `e2e.yml` suite is unaffected. This is for one-off **live
verification from a CC session** (e.g. confirming a screenshot bug is
*stale* vs a real regression before filing/fixing — 2026-06-25 MEH-938 /
MEH-942), not for the automated E2E pipeline. Pairs with the
`*.up.railway.app` egress block in [CLAUDE.md](../../CLAUDE.md) "Known Bug
Patterns": backend/API smoke from the sandbox is blocked outright; this
covers the *frontend* live-check path that Chromium can reach but only
over TLS 1.2.

_Source: 2026-06-25 /map UX batch (handoff note) — surfaced while
verifying MEH-942's GPS-button screenshot against live staging._

---

## QA-artifacts screenshot size discipline (MEH-1156)

CC self-QA screenshots committed under `qa-artifacts/MEH-XXXX/` must fit a
**2 MB-per-PR** budget. Raw Playwright PNGs (`fullPage` + `deviceScaleFactor: 2`)
routinely land at 1–5 MB **each** — e.g. `qa-artifacts/MEH-1143/home-events-1280.png`
= 4.75 MB, which busts the budget on its own.

**Compress every screenshot on write, before committing.** Run the sharp-based
helper from `frontend/` (where sharp is installed):

```
node scripts/compress-qa-screenshots.mjs qa-artifacts/MEH-XXXX/
```

Default = WebP q80 + downscale to ≤ 1440 px wide (undoes retina bloat). It
replaces each `.png` with a `.webp` and prints the before/after. Proven on the
4.75 MB capture above: **4.75 MB → 92 KB (-98%)**, hero/search/nav/buttons all
still legible (`qa-artifacts/MEH-1156/home-1280-compressed.webp`). `--jpeg` gives
a JPEG q80 fallback; `--keep` preserves the source PNG.

**Status:** the 2 MB cap is a **live CI gate**, not just a convention — the
**"qa-artifacts size cap"** job (`qa-artifacts-size` in
`.github/workflows/pr-checks.yml`) sums the bytes added/modified under
`qa-artifacts/` in the PR diff and fails at > 2,097,152 bytes; it's wired into
**"CI gate (required)"** (`ci-gate` `needs:` + the `R_QA_SIZE` result check, an
always-required aggregator leg), so an over-cap PR cannot go green. Sapir applied
it in PR #1684; `.github/workflows/**` is CC-deny (MEH-671). Running the helper
above is how you **comply** — compress every screenshot before committing.
