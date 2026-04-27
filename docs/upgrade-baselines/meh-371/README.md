# MEH-371 Upgrade Baseline — @sentry/nextjs v8 → v10

Captured: 2026-04-27
Branch: feature/meh-371-sentry-10-upgrade
Staging tip: 82d697d

## Why this upgrade now

Promoted to **High priority + blocker for MEH-370** (Next.js 14 → 16 upgrade).
`@sentry/nextjs@8.55.1` peer dep accepts `next@^13 || ^14 || ^15-rc` — **rejects `next@16`**.
MEH-370 install fails ERESOLVE without Sentry v10 (which adds Next.js 16 support).

## Starting state

```
@sentry/nextjs:        ^8.0.0  (resolved 8.55.1)
@sentry/webpack-plugin: transitive via @sentry/nextjs
```

## Sandbox-captured baselines

| File | Contents |
|---|---|
| `sentry.client.config.js` | Browser Sentry init — replays + beforeSend filter |
| `sentry.server.config.js` | Node Sentry init |
| `sentry.edge.config.js` | Edge runtime Sentry init |
| `next-config-sentry-section.md` | `withSentryConfig` wrap from next.config.js:122–137 |
| `sentry-init-callsites.md` | All 3 init sites + v8→v10 migration concerns |
| `sentry-vulns-pre.json` | Sentry chain vulns from npm audit |

## Sentry chain vulns (pre-upgrade)

| Package | Severity | Range | Fix |
|---|---|---|---|
| `@sentry/nextjs` | high | `8.0.0-alpha.2 - 10.39.0` | upgrade to `10.50.0` |
| `@sentry/webpack-plugin` | moderate | `2.0.0-alpha.1 - 5.1.1` (via uuid) | upgrade `@sentry/nextjs` to 10.50.0 |

**Count: 2** (spec expected 3 — see "Stop condition" below).

## Stop condition triggered

Spec said "stop & paste & wait if npm audit returns Sentry chain vulns count != 3".
Actual count: 2. Reason for discrepancy:
- The spec likely also counted `uuid` (the underlying CVE behind `@sentry/webpack-plugin`)
  and/or `rollup` (which `@sentry/nextjs` lists in its `via`).
- npm audit deduplicates: `uuid` and `rollup` are listed under their own keys — they
  show up as additional vulns in the global audit, but the `select(.key | contains("sentry"))`
  filter in the spec only matches package names with "sentry" in them.
- So 2 sentry-named packages have vulns; the upstream CVEs (uuid moderate, rollup high)
  count under their own names in the global audit, not under "sentry chain".

This is documentation, not a blocker — the v10 upgrade still resolves all 4 vulns
(2 sentry-named + uuid + rollup) because it transitively bumps the upstream deps.

## Deferred baselines (sandbox limitation — per MEH-360)

| Baseline | Reason deferred | Where to capture |
|---|---|---|
| Sentry dashboard receipt verification | Requires production traffic + Sentry dashboard access | Smadar manual step in PHASE B |
| Live error trigger smoke test | Requires deployed environment | Vercel preview after PHASE B install |

## DSN configuration

DSN is read from env at runtime:
- Client: `NEXT_PUBLIC_SENTRY_DSN`
- Server + Edge: `SENTRY_DSN`

The `if (dsn)` guard in each config means missing env = silent skip (no crash).
Smadar must verify these env vars are set on Railway production + staging before
PHASE B verification.

## Phase B install command (requires "go")

```bash
cd frontend
npm install @sentry/nextjs@10.50.0
# Verify peer deps satisfied (no ERESOLVE).
# Read v8→v9, v9→v10 migration guides.
# Apply config changes if needed (instrumentation.js?, integration name changes?).
```

## Rollback procedure

```bash
# Per-commit: git revert <commit-sha>
# Full: branch never merges if smoke fails
git checkout staging
# feature branch stays, no merge

# Package-level rollback:
git checkout staging -- frontend/package.json frontend/package-lock.json
cd frontend && npm ci
```
