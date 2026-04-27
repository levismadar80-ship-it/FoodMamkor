# MEH-371 — Sentry v8 → v10 migration changes

Captured: 2026-04-27
Sources:
- [v8→v9 migration guide](https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v8-to-v9/) (HTTP 503; details from Sentry GitHub MIGRATION.md + WebSearch)
- [v9→v10 migration guide](https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v9-to-v10/) (HTTP 503; details from sentry-javascript repo MIGRATION.md)
- [Manual Setup (current)](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/)
- [sentry-javascript MIGRATION.md](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md)

Note: Sentry docs returned HTTP 503 directly; details synthesized from GitHub MIGRATION.md and WebSearch result excerpts. Re-verify each row against live docs in PHASE B step 3 before applying.

## Mehamakor pre-migration baseline

| Surface | Current state |
|---|---|
| Sentry version | `^8.0.0` (resolved 8.55.1) — now `^10.50.0` after step 1 install |
| Config files | `sentry.client.config.js`, `sentry.server.config.js`, `sentry.edge.config.js` (3 files, JS) |
| `instrumentation.js` | **does not exist** — old pattern in use |
| `withSentryConfig` wrap | `frontend/next.config.js:122–134` (try/catch fail-soft) |
| `withSentryConfig` options | `silent`, `org`, `project`, `widenClientFileUpload`, `hideSourceMaps`, `disableLogger` |
| `Sentry.init` call sites | 3 — one per config file |
| Special integrations | `Sentry.replayIntegration({ maskAllText, blockAllMedia })` in client only |
| `tracesSampleRate` | `0.1` (all 3 envs) |
| `replaysOnErrorSampleRate` | `1.0` (client) |
| `replaysSessionSampleRate` | `0` (client) |
| `beforeSend` | drops events when `NODE_ENV === "development"` (client) |

## Migration changes table

| From-To | Category | Change | Mehamakor impact | File:line | Action |
|---|---|---|---|---|---|
| v7→v8 (legacy, already applied?) | Instrumentation | Server-side `Sentry.init` should move from `sentry.server.config.js` to `instrumentation.js` `register()` callback. Old pattern works in v8 with deprecation warnings, may be **fully required** in v9+ for OpenTelemetry server tracing to work. | `frontend/sentry.server.config.js:7` + `frontend/sentry.edge.config.js:7` exist but no `instrumentation.js` — old pattern. | `sentry.server.config.js:7`, `sentry.edge.config.js:7` | **MANUAL** — create `frontend/instrumentation.js` that imports both server + edge configs in `register()`; verify build still passes. ⚠️ See spec stop condition below. |
| v8→v9 | Integration rename | `processThreadBreadcrumbIntegration` → `childProcessIntegration`; integration `name` value `"ProcessAndThreadBreadcrumbs"` → `"ChildProcess"`. | Not used in Mehamakor (no `processThreadBreadcrumb` import). | n/a | **NO-OP** — verified by grep. |
| v8→v9 | Integration rename | `vercelAIIntegration` `name` value `"vercelAI"` → `"VercelAI"` (capitalized). | Not used in Mehamakor. | n/a | **NO-OP**. |
| v8→v9 | Express user | `requestDataIntegration` no longer auto-sets user from `request.user`. | Not used in Mehamakor (frontend only; FastAPI on backend handles auth). | n/a | **NO-OP**. |
| v8→v9 | Prisma | Drops Prisma v5 support; default v6. | Not used (we use SQLAlchemy on FastAPI backend). | n/a | **NO-OP**. |
| v8→v9 | Performance | Active span scope is now cloned (was set directly). | Mehamakor has no manual `startSpan` callbacks. | n/a | **NO-OP** — only auto-instrumentation. |
| v8→v9 | Console | `captureConsoleIntegration` with `attachStacktrace: true` now marks console msgs as `handled: true` (was `false`). | Not used in Mehamakor. | n/a | **NO-OP**. |
| v8→v9 | Node version | Min Node bump to `>=18.0.0`. | CI uses `node-version: "20"` (per `.github/workflows/deploy.yml:86`); Railway Node 20 LTS. | `.github/workflows/deploy.yml:86` | **NO-OP** — Node 20 ≥ 18. |
| v9→v10 | OpenTelemetry | OpenTelemetry deps bumped to v2.x.x. Existing OpenTelemetry usage outside Sentry would break. | Mehamakor has no direct OpenTelemetry usage (verified by grep). v10 brings its own OTel internals. | n/a | **NO-OP**. |
| v9→v10 | Web vital | First Input Delay (FID) reporting removed; INP supersedes. | Mehamakor doesn't reference FID anywhere; default web-vital instrumentation only. | n/a | **NO-OP** — silently absent from new metrics. |
| v9→v10 | PII / IP | IP address inference now controlled by top-level `sendDefaultPii` (was implicit). | Mehamakor doesn't set `sendDefaultPii` in any of the 3 init blocks → defaults to `false` → **no IP collection** (consistent with prior implicit behavior for browser). | `sentry.client.config.js:10`, `sentry.server.config.js:7`, `sentry.edge.config.js:7` | **NO-OP** — default behavior preserved. Decision: leave unset; if dashboard shows missing user.ip and that was relied on, set `sendDefaultPii: true` post-migration. |
| v9→v10 | Removed APIs | `BaseClient` → `Client`; `hasTracingEnabled()` → `hasSpansEnabled()`; `logger`/`Logger` → `debug`/`SentryDebugLogger`. | Mehamakor doesn't import any of these (verified by grep). | n/a | **NO-OP**. |
| v9→v10 | `_experiments` | `_experiments.enableLogs` / `beforeSendLog` → top-level. `_experiments.autoFlushOnFeedback` removed (now default). | Mehamakor doesn't use `_experiments` in any init block. | n/a | **NO-OP**. |
| v9→v10 | `withSentryConfig` options | Need to verify `silent`, `org`, `project`, `widenClientFileUpload`, `hideSourceMaps`, `disableLogger` still accepted. | Mehamakor uses all 6 options at `next.config.js:124–129`. | `next.config.js:124–129` | **VERIFY** — read v10 `withSentryConfig` source/docs to confirm option survivability. If any renamed/removed → manual rename. |
| v9→v10 | `replayIntegration` | API name unchanged from v8 (`replayIntegration()` factory). v10 OpenTelemetry overhaul does not touch the browser replay surface. | Mehamakor uses `Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false })`. | `sentry.client.config.js:17–20` | **NO-OP** — API stable. Verify in PHASE B build. |

## Summary

- **NO-OPs:** 12 rows (most v8→v9 changes don't apply; most v9→v10 OpenTelemetry-internal changes don't surface).
- **MANUAL edits:** 1 — instrumentation.js move (legacy from v8; possibly required in v9+).
- **VERIFY:** 1 — `withSentryConfig` option keys in v10.

## ⚠️ Spec stop condition triggered

Spec said: "STOP & ASK if instrumentation file move required (server config → instrumentation.js)".

**Triggered:** the v8→v9 path (now landing as v10) introduces `instrumentation.js` as the recommended/required entry point. The old `sentry.server.config.js` + `sentry.edge.config.js` pattern that Mehamakor uses today is the v7-era pattern that has worked through v8 with deprecation warnings, but **may not work in v10 server-side**.

**What this means in practice:**
- The build may still complete (the migration is graceful — old files still loaded on the client side and may be silently picked up by `withSentryConfig` auto-wiring).
- BUT server-side Sentry init may not actually run, leaving server errors uncaught. This is the silent-degradation failure mode the existing `try/catch` at `next.config.js:131` was designed to mask.
- The fix is small: 1 new file (`frontend/instrumentation.js`) that does:
  ```js
  export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      await import('./sentry.server.config');
    }
    if (process.env.NEXT_RUNTIME === 'edge') {
      await import('./sentry.edge.config');
    }
  }
  ```
- The 3 existing `sentry.*.config.js` files stay (re-imported by the register hook).

**Decision needed (Smadar):**
- **A** — apply the instrumentation.js move now (1 new file, ~8 lines). Continues PHASE B without scope expansion.
- **B** — defer the move to a follow-up (MEH-373?). PHASE B ships the v10 install + the safe NO-OP changes; server Sentry runs but with warnings; Smadar verifies dashboard receipt as part of PHASE C and we open MEH-373 if it's not capturing server errors.
- **C** — pause. Read v10 docs more carefully via Vercel preview + dashboard testing before deciding.

Recommend **A** — small, well-documented, low-risk; aligns with the spec's "one commit per migration step" model.
