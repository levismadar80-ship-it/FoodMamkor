---
paths:
  - "frontend/sentry.*.config.*"
  - "frontend/instrumentation.*"
  - "frontend/next.config.js"
  - "backend/app/main.py"
  - ".env.example"
---

# Observability protocol

> Workflow rule: every observability-related ticket (Sentry, logging,
> monitoring, alerting, error reporting) requires dashboard receipt
> verification before "Done".

## Why

Bundle-side / env-var / SDK-load checks do not prove events arrive
at the destination. Failures between SDK and ingest are silent:
- DSN wired to wrong service (Railway vs Vercel)
- CSP blocking ingest endpoint (connect-src)
- CSP blocking blob: workers (worker-src for Replay)
- Network-layer issues (DNS, firewall, rate limit)
- Project ID / public key mismatch
- Sentry CLI/SDK version skew

All of these pass code review. Only dashboard receipt catches them.

## Protocol

Before closing any observability ticket Done:

1. Trigger a real event from the deployed environment
   (production preferred; staging at minimum)
2. Confirm event arrives at the destination dashboard
   (Sentry Issues, log aggregator, monitoring panel)
3. Confirm event payload contains expected metadata
   (release version, environment tag, user context if applicable)
4. Document the verification in PR body or Linear comment
   (event ID, dashboard link, timestamp)
5. Only then mark ticket Done

## Anti-patterns (do NOT close on these alone)

- "Build green, lint green, CI green"
- "DSN env var present in dashboard"
- "SDK loads in browser console (window.__SENTRY__ defined)"
- "Bundle contains DSN string (grep verified)"
- "Init function called without exception"

These are necessary but not sufficient. Each one passed during the
2026-04-27 incidents while events were silently dropped.

## Precedent incidents

- MEH-371 STEP 9 (2026-04-27) — DSN gap caught pre-merge via
  dashboard verify protocol
- MEH-376 (2026-04-27, retroactive) — closed Done as false-PASS,
  retroactively verified via MEH-379+380+381 dashboard receipt
- MEH-379+380+381 (2026-04-27) — three CSP gaps caught via
  dashboard receipt during production verify

## Verification template (paste in PR body)


```
## Observability dashboard verify

Environment: production / staging
Trigger: throw new Error("[ticket-id] verify")
Event ID: [from dashboard]
Dashboard link: [Sentry/log/monitoring URL]
Timestamp: [UTC]
Metadata confirmed: release tag / environment / user context (if applicable)
```
