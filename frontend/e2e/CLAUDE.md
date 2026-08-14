# Directory: `frontend/e2e/`

## Purpose
Playwright end-to-end specs running against the deployed Vercel preview
URL on every PR (`.github/workflows/e2e.yml`). Each spec is a real-user
flow — no mocks, no API stubs. Specs at this root cover RTL and
screenshots; named user flows live under `frontend/e2e/flows/`.

## Canonical pattern
`frontend/e2e/flows/01-home-load.spec.ts:1-9` — minimal `test.describe`
+ `test()` block using `page.goto("/")`, real selectors
(`[data-testid="hero-search"]`), and `toBeVisible({ timeout: 15_000 })`.
Mirror this shape for new flows; keep timeouts explicit, not implicit.

## Conventions specific to this dir
- **Naming**: `NN-name.spec.ts` (numeric prefix orders the dashboard +
  groups related flows). `flows/` for happy-path user journeys;
  spec root for cross-cutting checks (RTL, screenshots).
- **One concern per spec**: each file owns one flow; failures isolate
  per file. Don't bundle unrelated checks into the same `describe` block.
- **Selectors**: prefer `data-testid` attributes over class/text
  selectors — Hebrew strings change; tests should not.
- **Config**: `frontend/playwright.config.ts` sets `baseURL` from the
  Vercel deployment-status webhook payload (no polling).
- **No mocks** since MEH-417 (2026-05-09) — mocks hid real backend bugs
  for 8 CI cycles (HANDOFF.md "Key lessons" #3).
  - **Narrow, deliberate exception — VRT specs only (MEH-1497, ticket §2.4):**
    `e2e/visual/**` may use `page.route()` to freeze a data-dependent shot
    (the subject there is layout/pixels; the data is noise). This is scoped
    to visual specs — **functional specs under `e2e/flows/` stay unmocked**,
    which is exactly what MEH-417 protects. Do not generalise it: mocking a
    flow spec reintroduces the MEH-417 regression. Currently applied in
    `e2e/visual/parity.spec.ts` (`producer detail`).
  - **Second, narrow exception — intercepting a specific endpoint inside a
    `flows/` spec (MEH-1968, ruling 14/08/2026, Sapir delegated: "Option A").**
    Permitted **only** when all three conditions hold (AND, not OR):
    1. The spec does not assert any backend **behaviour** — it exercises a
       frontend state machine (which screen renders, what the UI does with a
       fixed response), never "did the backend compute the right answer."
    2. The mocked endpoint's contract is stable and documented — a Pydantic
       response model, an OpenAPI entry, or an existing test pinning its shape.
    3. The unmocked alternative burns a **shared resource** — e.g. the
       `/auth/register` rate limiter on shared GitHub Actions runner IPs
       across concurrent PRs.
    Precedents this codifies rather than invents: `flows/28-register-success-state.spec.ts`
    (mocks `POST /auth/register/producer`, `/auth/me`, `/categories` — the
    question under test is which screen wins the render, not whether
    registration itself succeeded) and `flows/29-register-journey-a.spec.ts`
    (mocks `POST /auth/register`).
  - **Distinguish a stub from a mock — do not conflate them.** A **stub** that
    removes an *incidental* network call unrelated to what the spec asserts
    (e.g. `flows/29`'s intercept of `POST /auth/check-password`, the
    debounced strength-check `PasswordInput` fires on every keystroke past
    12 characters) is not this exception and needs no justification against
    the three conditions above — it isn't hiding an approved call, it's
    preventing an incidental, timing-dependent one from flaking the test.
    A **mock** that hides a call the spec's own subject depends on is what
    conditions 1–3 gate. If removing the interception would change nothing
    about what the spec is asserting, it's a stub; if it would remove the
    thing under test, it's a mock and needs all three conditions stated in
    the spec file.
  - **Rejected: routing both merged specs to a separate, deploy-target-gated
    suite instead.** `flows/22` already demonstrates where that leads — it
    skips its localhost target and does not run in CI in practice. Widening
    the no-mocks rule's exception is preferred over quietly losing coverage.

## Authenticated specs — where that coverage actually runs (MEH-999)

`global-setup.ts` provisions `e2e/.auth/{producer,consumer,admin}.json` from the
seeded QA accounts, and a spec opts in with
`test.use({ storageState: "e2e/.auth/<role>.json" })`. **Provisioning is
target-gated** (`global-setup.ts:72-80`):

| Target | `DEMO_*_PASSWORD` | Fixtures | Authed specs |
|---|---|---|---|
| localhost (**the default CI job**) | unset | **not written** | **skip**, with reason |
| localhost (seeded local full stack) | set | written | run |
| `TEST_URL=` staging / preview | set (+ `VERCEL_AUTOMATION_BYPASS_SECRET`) | written | run |
| any remote | **missing** | — | **throws** (never a silent skip) |

**Superseded (26/07) — the CI job now DOES export the three secrets.** Sapir
applied `docs/ci/e2e-auth-fixtures.patch.md` in commit `21ccecc`, so
`e2e.yml:168-170` passes `DEMO_OWNER_PASSWORD` / `DEMO_CONSUMER_PASSWORD` /
`DEMO_ADMIN_PASSWORD` into the run. The job is therefore **row 2, not row 1**:
`PLAYWRIGHT_BASE_URL` is still `http://localhost:3000` (`e2e.yml:161`), but with
the passwords set, `global-setup` provisions all three roles against the seeded
staging backend. **Authenticated coverage runs on every PR.** Proof: run
`30220096957` logged `[global-setup] wrote {producer,consumer,admin}
storageState` and executed all 6 `25-role-reachability` tests, where run
`30211526292` earlier the same day had logged "no `DEMO_*_PASSWORD` is set" and
skipped them.

This paragraph previously said the opposite ("the job exports **no** `DEMO_*`
secret … authed coverage does not run on PRs today"). That was accurate until
`21ccecc`. The table above still describes the mechanism correctly — only which
row the CI job occupies has changed.

**Any new spec that opts into a storageState MUST guard on the fixture**, or it
turns the default CI run permanently red at fixture setup with
`ENOENT: e2e/.auth/<role>.json`. Two guards exist; copy one:

- `flows/21-account-menu-auth.spec.ts:38` — `test.skip(isLocal || !fs.existsSync(...))`
- `flows/25-role-reachability.spec.ts` `skipUnlessProvisioned()` — stricter and
  preferred: skips only when the fixture is missing **and** that role's password
  is unset, so a *set* password with a missing fixture still fails loud (real
  provisioning breakage must not hide behind a skip).

_Source: MEH-1528 added spec 25 without the MEH-1241 guard → 6 red tests on every
PR. Because they died at fixture setup, every other authed spec was skipped too:
the E2E job looked "mostly green with 6 known reds" while providing **zero**
authenticated coverage. Fixed under MEH-999 (26/07)._

## Gotchas
- **Google Sign-In singleton** (MEH-274): `google.accounts.id.initialize()`
  must run exactly once per page load. The fix lives in
  `frontend/lib/use-google-sign-in.js`; double-init breaks login in
  Playwright headless mode silently.
- **`.test` TLD trap** (MEH-353): test fixtures must use `@example.com`,
  not `@e2e.test` — Pydantic email-validator rejects `.test` (RFC 6761).
- **CI rate-limit budget**: shared GitHub Actions runner IPs burn the
  `/auth/register` limiter quota across PRs (HANDOFF.md "Key lessons"
  #2). Don't loop registrations in a single spec.

## Cross-refs
- `frontend/playwright.config.ts` — workers, retries, baseURL, reporter.
- `.github/workflows/e2e.yml` — deployment-status trigger, no polling.
- `docs/TESTING.md` — pytest + Playwright guide.
- `.claude/rules/testing.md` — pre-merge pipeline order.
