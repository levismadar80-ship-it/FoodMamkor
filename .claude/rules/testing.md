# Testing rules

Rules 5, 5a, 20 and the pre-merge pipeline. Incidents and measurements live
verbatim in [docs/rules-history/testing.md](../../docs/rules-history/testing.md)
— same headings; read it before re-opening a rule.

---

## Rule 5 — Tests before implementation

Failing test first (pytest backend, playwright/component frontend), then make
it pass. See [docs/TESTING.md](../../docs/TESTING.md).

### Frontend critical flows — Playwright test required before writing code

login / register · WhatsApp button click · פרסום מוצר שכנה · טופס הרשמת עסק.

### NOT required for

Styling, color/spacing tweaks, minor UI adjustments.

### Test dummy URLs must be real backend routes with a matching method

`scripts/check_api_contract.py` (Deploy gate) scans `frontend/__tests__/**` too.
Use a real route with the verb you call (`GET /auth/me`, not PATCH-only
`/users/me`). Before pushing: `python scripts/check_api_contract.py` → 0
mismatches, 0 orphans.

---

## Every new guard test must be shown failing (MEH-1619)

- Every new/strengthened assertion ships with a **demonstrated failing run**:
  break the guarded thing → red, restore → green; both outcomes in the PR body.
- **The construction must discriminate:** would the OLD assertion have passed
  it? If not, the run is not evidence for the change.
- A classifier ships a **self-test** run first, against the **real**
  implementation (never a copy), with at least one case **anchored to a real
  repo file** (MEH-1909). After synthetic cases pass, run the probe over the
  real corpus and **read the output**, not the exit code.
- Prefer `&&` over `||` between cues; split checks so the failure names the
  missing cue.
- An assertion entailed by the lines above it (or by its own filter) is not a
  check — delete it. Assert counts that the change under test can falsify.
- A guard that consults its own subject (`count()===0 → skip`, `if (!el)
  return`) can never fail; gate on something the product cannot move (project
  name, env var, fixture). Lifting a quarantine is not the fix. Review question:
  if the element vanished, does this go red?
- A green VRT is not evidence the frame is unchanged (2% tolerance swallows
  copy changes; a pass writes no PNG) — read the rendered text. Tolerance is
  MEH-1765's call only.
- **Restoring an old artifact is not ratification.** Before restoring a
  baseline (or reusing any audited artifact: lock hash, cache, verdict,
  benchmark, screenshot), count what changed since its capture; if not zero,
  **reproduce, don't restore**. Record the as-of next to artifacts.
- Regen by label: [docs/ci/vrt-label-trigger.patch.md](../../docs/ci/vrt-label-trigger.patch.md).

---

## `networkidle` is banned in specs (MEH-215)

No **unbounded** `waitForLoadState("networkidle")` / `waitUntil: "networkidle"`
in `e2e/flows/**` or `e2e/visual/**` (the globs `playwright.config.ts` runs).
The only sanctioned form is a bounded, caught wait
(`e2e/visual/parity.spec.ts`, ~5 s) — don't "fix" it. The `timeout` is the
operative half; a bare `.catch` is not enough. To prove something did **not**
happen, await the unwanted event with a bound and require it times out. To
wait for readiness, gate on that thing (`data-testid`, response, URL). The
Cloudinary-401 cause is unestablished — don't state it as fact.

### Sweep result (2026-08-09) — where this actually bites

Only CI-run specs matter. `parity.spec.ts` is converted;
`e2e/screenshots.spec.ts` (not run by CI) is ticketed; don't bulk-"fix" the
~108 `qa-*.mjs` probe scripts.

---

## A green that has two possible causes is not a signal

**Check the instrument before the claim.** Before a claim rests on a tool's
output, run that tool once against a case whose answer you already know — that
validates both its green and its red. Read the spec before measuring a
documented system; then check the spec covers the exact token you use.

- Name at least one *other* world where this check is green; if you can, it
  doesn't discriminate yet.
- For any stored reference (baseline, golden file, fixture, hash) ask whether
  reference and subject could be wrong **together**.
- A green that appears the moment a bug is fixed elsewhere is a defect report
  about the check.
- A CI aggregator's `skipped` reads like `success` — a skip it enforces must
  have *run*.
- A citation in a rules file must resolve — check it (`get_issue`) when you
  write it; archived ≠ never existed.
- **A probe must not count itself.** Never `pgrep -f` / `pkill -f` (the invoking
  shell matches). Use `ps -eo pid,comm | grep -iE "node|next"` (control:
  `ps -eo pid,comm | wc -l` is in the tens); `pgrep -x` only for names ≤ 15
  chars. Prefer `run_in_background` over `&` + kill. Verify what the writer
  actually is before killing anything.

### A probe whose null output is also its reassuring output is not evidence

`(none)` / `0 findings` / `no rows` also means "never ran". Such a probe ships
with a **control** that exercises a path known to produce output, runs first,
and fails loudly saying every null in the run is void. Review question: if this
probe were dead, what would it print?

---

## The artifact that asserts coverage is the one least likely to be checked

A docstring, a count in a log line, a test-case name each read as verification
and are none. **Derive counts** (`len(ran)`), never state them; **name a case
after the input it covers**, not its class; when a reviewer names two sites,
**grep for the third**; show the guard failing against the old code before
claiming it guards.

### Corollary — the control itself is an artifact, and it lies the same way

A red for the wrong reason (invocation error, wrong cwd) is not discrimination;
a no-op edit can print exactly what a working count would. Ask: did the
evidence actually run, against what I think it ran against?

### Why this is stated as a rule and not an anecdote — the count is the argument

Eight instances in one week:

1. **MEH-1909** — `ast` probe, `None` for all 14 real revisions.
2. **ORDERS §3.0 (10/08)** — DNS probe whose own control also returned zero.
3. **ORDERS §3.0 (10/08)** — routes inventory and self-test built on one wrong guess.
4. **#2786 (11/08)** — six "successful" PNGs of an error boundary.

---

## Rule 5a — Adversarial review before every merge to staging

Run `/adversarial-review` on all changed files; fix every REFEREE verdict before
the PR. `auth.py` / `upload.py` / permissions also get a web-search CVE check
([security.md](./security.md)).

---

## Rule 20 — Review order: CI before adversarial (mandatory)

`npm run build → pytest tests/test_api.py → /adversarial-review → merge`.
Never adversarial before CI passes.

### Exception — central components

`MapClient.jsx`, `ProducerDetail`, `main.py` (`.claude/central-components.json`):
run adversarial even if the build fails.

---

## Definition of Done (every PR, no exceptions)

- [ ] `npm run build` passes
- [ ] `pytest tests/test_api.py` passes
- [ ] `/adversarial-review` עבר — all REFEREE verdicts fixed

---

## Required status checks + docs-only merge (MEH-716)

`protect-staging` (ruleset 15240090) requires exactly two aggregators:
`CI gate` and `Deploy gate`. Named jobs skip on docs/config-only diffs and a
skipped leg still aggregates to success — docs-only PRs merge with no override
and **don't poll E2E**. `Playwright E2E` runs on every PR but carries no vote
until Sapir applies `docs/ci/e2e-gate.patch.md` and adds the context to the
ruleset (both are hers). So with auto-merge armed a PR lands on the two gates
alone — an instruction like "wait for N green E2E runs" is enforced only by
**not arming auto-merge** until it is checked. "Waiting for status / expected"
right after a push = gates still registering; retry once. Re-measure any
as-of claim here before acting on it.

---

## Guarded registries — path-drift validator (MEH-1030)

`scripts/validate-registry-paths.py` (pre-commit) asserts every path listed in
`.claude/central-components.json` and the `PATH EXCEPTIONS` section of
`.claude/hooks/rtl-allowlist.txt` still resolves. Adding a registry takes
**both** steps: an entry in `REGISTRIES` in the script **and** its path in the
hook's `files:` regex in `.pre-commit-config.yaml`.

---

## Driving Playwright against staging from the CC sandbox — TLS **and** the protection bypass

A harness pointed at staging needs both; either alone measures nothing.

### 1. Cap TLS at 1.2

`chromium.launch({ args: ["--ssl-version-max=tls1.2"] })` — sandbox only.
Without it: `ERR_CONNECTION_CLOSED`/`RESET`, which reads like an outage.

### 2. Send the Vercel Deployment Protection headers

`extraHTTPHeaders: { "x-vercel-protection-bypass":
process.env.VERCEL_AUTOMATION_BYPASS_SECRET, "x-vercel-set-bypass-cookie":
"true" }`. Control: `/he` → 200 with them, 302 → `vercel.com/sso-api` without.
Never write the secret to a file, commit, PR body or log.

### Corollary — a Railway `000` from the sandbox is NOT an outage

`*.up.railway.app` is egress-blocked here. Probe the backend through
`staging.mehamakor.online/api/…` with the headers above.

---

## QA-artifacts screenshot size discipline (MEH-1156)

`qa-artifacts/MEH-XXXX/` has a **2 MB-per-PR** cap, enforced by the
`qa-artifacts size cap` job inside `CI gate`. Compress every screenshot before
committing: `node scripts/compress-qa-screenshots.mjs qa-artifacts/MEH-XXXX/`
(run from `frontend/`; WebP q80, ≤ 1440 px; `--jpeg`, `--keep`).
