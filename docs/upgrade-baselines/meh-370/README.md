# MEH-370 Upgrade Baseline — Next.js 14.2.35 → 16.2.4

Captured: 2026-04-27
Branch: feature/meh-370-next-16-upgrade
Staging tip: 82d697d

## Sandbox-captured baselines

| File | Contents | Exit code |
|---|---|---|
| `build-pre.txt` | `npm run build` output (Next 14.2.35) | 0 — PASS |
| `lint-pre.txt` | `npm run lint` output | 0 — PASS (warnings only, matches MEH-345 baseline) |
| `audit-pre.txt` | `npm audit --audit-level=high` | 1 — 14 vulns (3 mod, 11 high) |
| `package.json.bak` | Pre-upgrade package.json snapshot (rollback anchor) | — |
| `package-lock.md5` | MD5 of pre-upgrade package-lock.json (rollback anchor) | — |

## Deferred baselines (sandbox limitation — per MEH-360)

| Baseline | Reason deferred | Where to capture |
|---|---|---|
| Lighthouse JSON (`lighthouse-pre.json`) | Requires live URL — sandbox can't reach Railway/Vercel | Run on Vercel staging preview before merging Phase B PR |
| Visual screenshots — 8 pages (`screenshots-pre/`) | Requires headless browser | CI / Playwright on Vercel preview |
| Playwright E2E test report (`test-baseline.txt`) | Requires browser + live backend | CI — next run of PR checks on this branch |
| `pytest tests/test_api.py` output | Requires fastapi env — not available in sandbox | CI |

## Starting state (key versions)

```
next:             14.2.35
react:            ^18.3.1
@sentry/nextjs:   ^8.0.0    ← BLOCKER: must upgrade to 10.50.0 (MEH-371)
next-pwa:         ^5.6.0    ← BLOCKER: must replace with maintained alternative
framer-motion:    ^11.11.0  ← RISK: v11 has React 19 compat issues; v12 needed
react-leaflet:    ^4.2.1    ← RISK: v4 targets React 18; v5 needed for React 19
```

## npm audit blockers (from audit-pre.txt)

`npm audit fix --force` would install (per npm's own output):
- `next@16.2.4` — fixes 5 high CVEs
- `eslint-config-next@16.2.4` — fixes glob CVE
- `@sentry/nextjs@10.50.0` — fixes rollup + uuid CVEs
- `next-pwa@2.0.2` — npm suggests this but 2.0.2 is a major downgrade;
  evaluate `@ducanh2912/next-pwa` as replacement instead

## Phase B install command (requires "go")

```bash
cd frontend
npm install next@16.2.4 eslint-config-next@16 react@19 react-dom@19 \
  @sentry/nextjs@10 framer-motion@12 react-leaflet@5
# then evaluate next-pwa replacement separately
```

## Rollback procedure

```bash
# Per-codemod (preferred): git revert <codemod-commit-sha>
# Full rollback:
git checkout staging
# feature branch not merged if Phase C fails

# Package-level rollback:
cp docs/upgrade-baselines/meh-370/package.json.bak frontend/package.json
cd frontend && npm ci
```
