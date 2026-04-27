# MEH-371 — Sentry.init call sites (pre-upgrade)

Captured: 2026-04-27
Branch: feature/meh-371-sentry-10-upgrade

## 3 call sites — all in dedicated config files (standard Next.js Sentry layout)

| File | Line | Runtime | DSN env var |
|---|---|---|---|
| `frontend/sentry.client.config.js` | 10 | Browser | `NEXT_PUBLIC_SENTRY_DSN` |
| `frontend/sentry.server.config.js` | 7 | Node.js | `SENTRY_DSN` |
| `frontend/sentry.edge.config.js` | 7 | Edge runtime | `SENTRY_DSN` |

Each is gated by an `if (dsn)` check — fail-soft when env is missing.

## Common shape

All three init blocks share:
- `dsn` from env
- `environment` from `*_SENTRY_ENV` falling back to `NODE_ENV`
- `tracesSampleRate: 0.1`

## Client-only options

The browser config additionally sets:
- `replaysOnErrorSampleRate: 1.0`
- `replaysSessionSampleRate: 0`
- `Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false })`
- `beforeSend` filter that drops events in `development`

## Wrap site (single)

`frontend/next.config.js:122–134` — `withSentryConfig(finalConfig, { silent, org, project, widenClientFileUpload, hideSourceMaps, disableLogger })` inside `try/catch` (fail-soft).

## v8 → v10 migration concerns to verify in PHASE B

- `replayIntegration()` API: confirm name unchanged in v10 (was `new Replay()` in v7, became `replayIntegration()` in v8)
- `withSentryConfig` option keys: `widenClientFileUpload`, `hideSourceMaps`, `disableLogger`, `silent` — verify all still accepted in v10
- `tracesSampleRate` and `replaysOnErrorSampleRate` — confirm same numeric semantics in v10
- v9 (intermediate) introduced `instrumentation.ts` requirement — Mehamakor uses JS, may need `instrumentation.js`
