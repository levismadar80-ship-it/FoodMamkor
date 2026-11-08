# Runbook — בדיקת עומס k6 (MEH-559)

> **Moved here from `docs/MANUAL_TESTING.md` on 2026-11-07 (MEH-2796).** Content unchanged.

One-time pre-launch baseline via k6. NOT in CI. Script: `scripts/load-test.js`. Full runbook + result template: [docs/research/k6-load-testing-baseline.md](../research/k6-load-testing-baseline.md).

## When to (re-)run

- [ ] Once, the week before public launch (the canonical MEH-559 run).
- [ ] After any major backend refactor of `backend/app/routers/producers.py`, `chat.py`, or `favorites.py`.
- [ ] After a Railway plan change (free -> hobby -> pro) — the latency numbers shift and the baseline must be re-anchored.
- [ ] After any Anthropic model swap on `/chat` (Haiku -> Sonnet, version bumps) — verify the `/chat` p95 still fits the SLA.

## Env vars required

- `BASE_URL` — default `https://staging.mehamakor.online`. **Do not point at production.**
- `VERCEL_BYPASS_TOKEN` — same value as `VERCEL_AUTOMATION_BYPASS_SECRET` in GitHub Actions (see `frontend/playwright.config.ts:38`).
- `PRODUCER_SLUG`, `PRODUCER_ID` — fetch a real pair from `/producers` first so the latency numbers aren't dominated by 404 paths.

## How to interpret

- p95 < 2000ms + error rate < 1% per endpoint = SLA met.
- `/chat` is expected to return mostly 429s — the rate-limiter trip is the intended observation.
- `favorites_unauth` is expected to return 401 on every request — measures auth-rejection latency.
- p99 > 5s or `X-Railway-Fallback: true` headers = Railway throttling; consider plan upgrade before launch.
