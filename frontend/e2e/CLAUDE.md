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
