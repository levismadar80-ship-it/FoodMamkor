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

## Cloudinary image delivery is stubbed suite-wide in `flows/` (MEH-1925)

Every spec under `e2e/flows/` imports `test`/`expect` from
`flows/_cloudinary-stub.ts` rather than from `@playwright/test`. That fixture
intercepts Cloudinary image delivery and fulfils a 1×1 PNG. **`e2e/visual/**` is
untouched and keeps real images** — a VRT baseline cannot be compared against a
placeholder.

**This is a STUB, and the clause above is what says so.** Per *"Distinguish a
stub from a mock — do not conflate them"*: an interception is a stub when
removing it *"would change nothing about what the spec is asserting"*, and needs
"no justification against the three conditions above." No flow spec asserts on
image bytes, `naturalWidth`/`naturalHeight`, `toHaveScreenshot`, or a rendered
`src` — verified by grep across all 36 specs before the fixture was written. Image
delivery is incidental to every one of them, so this never reaches the
three-condition mock exception.

**It intercepts two things, not one, and the second is the non-obvious half.**
`next.config.js` lists `res.cloudinary.com` under `images.remotePatterns`, so
`next/image` (which `ImageWithFallback.jsx` wraps, and which most producer and
product imagery goes through) does **not** let the browser fetch Cloudinary
directly: the browser requests `/_next/image?url=…` and the **Next.js server**
fetches the origin image. That server-side fetch is invisible to `page.route()`.
A `res.cloudinary.com`-only route therefore catches only CSS `background-image`
and bare `<img>` cases and misses the bulk of the bandwidth. The fixture also
routes `/_next/image`, parses its own `url` param, and stubs only when that
param points at Cloudinary — `images.unsplash.com` falls through via
`route.continue()`.

**Why it exists:** Cloudinary was at 506% of plan (126/25 credits) on 181,681
impressions in 30 days against near-zero real users, tracking CI activity
on and off (0 on quiet days, ~19k on batch-sweep days). Free/Plus/Advanced do not
bill overage — they disable the account, and it had already blocked once.

**Adding a spec to `flows/`:** import from `./_cloudinary-stub`, not
`@playwright/test`. A spec that imports directly still runs and still passes —
it just silently opts out of the stub and bills real bandwidth.

## Other `flows/_*` helpers

- **Split specs (MEH-3540).** `flows/manual/home-NN.spec.ts` and `map-NN.spec.ts` share fixtures and helpers through `flows/manual/_home-shared.ts` / `_map-shared.ts` (not a spec — `testMatch` needs `.spec.ts`). A new home or map test goes in the part whose describes it sits beside; a new fixture goes in the shared file, exported. Each part repeats the top-level `beforeAll` fixture check.
- `flows/_unstubbed-me-guard.ts` — installed by the `_cloudinary-stub` fixture, so every importing spec has it. A call to `/api/producers/me` or `/api/producers/me/**` that carries a fake (non-JWT) token and that no `page.route` of the spec answered fails the test at once, naming the method, URL and spec (MEH-2957). Before it, such a call reached the real backend, drew a 401, and api.js ended the session, so the test failed later on an unrelated locator. A real login (a JWT, storageState or API login) passes through untouched. A spec route registered later always wins, so adding the stub is the whole fix. `page.unrouteAll()` removes the guard too (five calls in four dashboard specs, which re-add only their order-settings stub), so after it call `guardUnstubbedMe(page, testInfo.file)` again if the rest of the test should stay guarded.
- `_verify-finding.mjs` (this root, not `flows/`) is for probes, not specs. `verifyFinding` gives a verdict from a bug control, a clean control and 3 runs with screenshots; `waitForStable` reads a value once per frame until it stops changing; `clickInView` refuses a click that would scroll the page first. A bug measured by a probe is reported only through it (testing.md, MEH-3814). The probe that imports it lives outside every test glob (rule 42); only this library and its unit test are in the tree.
- `flows/_settled-field.ts` — `settledField(page, testId)` waits until exactly one React-owned copy of a field exists before it is filled (MEH-2323).
- `flows/_layout-settled.ts` — `layoutSettled(locator)` waits until the element's box, the scroll offset and the page height are unchanged for 10 frames. Use it before a click into anything that may still be moving (a deep link that is still resolving, a card that just re-rendered): Playwright checks the click's hit target on mousedown only, so a shift between mousedown and mouseup loses the click with no error (MEH-3449).
- `flows/_save-after-edit.ts` — `clickSaveAfterEdit(page, save)` clicks a card's save on `/producer/dashboard/edit` only after the button is enabled, the `unsaved-banner` has mounted and the button is still for 10 frames. The banner mounts one render after an edit (the card reports dirty from an effect) and pushes every card down, which can lose a save click that lands across that render (MEH-3685; the mechanism was found in MEH-3449). `__tests__/E2EClickPreconditionGuard.test.js` fails on a bare `save(…).click()` / `saveBtn(…).click()` in a spec that opens the edit page; `dashboard-locations.spec.ts` is exempt because LocationsEditor reports no dirty state.
- `flows/_pick-city.ts` — `pickCity(scope, typed, option?)` types into a CitySearch field, waits for the row to be still, clicks it, then requires the list closed and the field holding the town (MEH-3488). Every register spec picks its town through it; `__tests__/E2EClickPreconditionGuard.test.js` fails on a bare `getByRole("option")…click()` there, and on a `markerOf(…).click()` in `manual/_map-shared.ts` + `manual/map-NN.spec.ts` outside `tapMarker` (MEH-3486: on a 390×664 phone the PEEK sheet covers the southern pins; `tapMarker` drags the map until the pin clears it, and holds 120 ms before mouseup so Leaflet's inertia does not carry the pin off the map, where markercluster removes it — MEH-3514).
- **A dead or unused origin in a spec uses a port below 32768** (29009 in `flows/00-producer-fixture-*`). A port inside the OS ephemeral range can be handed to any `listen(0)` in the same run; 39009 once was, and the test recorded its own probes (MEH-3451).
- `flows/_login-submit-diagnostics.ts` — `watchLoginSubmit(page)` appends to an already-failing login assertion whether `/api/auth/login` left, its status, and the form state at the click and at the failure. Asserts and waits for nothing (snapshots are capped at 2 s). Exists because the trace is `on-first-retry`, so a first-attempt flake has no trace (MEH-3154, MEH-3380). The two login blocks it watches (`flows/30-login-journey-c.spec.ts`, `flows/25-role-reachability.spec.ts`) now set `trace: "retain-on-failure"` at file level (Playwright refuses it inside a describe), so their failed first attempt keeps a trace in the `playwright-report` artifact. Three more specs do the same for a flake that has not been explained yet (MEH-3467 `flows/manual/admin-users-reviews-categories.spec.ts`, MEH-3051 `flows/manual/footer-nav-clearance.spec.ts`, MEH-3529 `flows/47-products-show-all.spec.ts`); drop it from a file once its flake is closed.

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
- **Google sign-in in a spec** (MEH-3690): our own button opens Google's
  popup through the GIS code client, which no runner can click through.
  Stub it with `flows/_google-code-stub.ts` (`stubGoogleCodeClient` before
  `goto`, then `sendGoogleCode`); `stubCodeSwap` answers the code swap when
  the spec's subject is what comes after it. The old `google.accounts.id`
  singleton (MEH-274) is gone with Google's rendered button.
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
