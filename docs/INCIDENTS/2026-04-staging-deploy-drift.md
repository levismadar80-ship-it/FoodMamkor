# Incident — Staging deploy drift (MEH-260) — 2026-04-22

**Severity:** Critical
**Duration:** Several weeks (undetected) → discovered 2026-04-22 ~20:30 UTC
**Primary owner:** Smadar
**Status:** Mitigated pending final verification

## What was observed

During the MEH-256 (rate-limiter real IP) investigation, the Railway
`foodmamkor-staging` access logs showed **404** on endpoints that exist
in the `staging` branch code — including endpoints that had been on
the staging branch for weeks:

```
POST /auth/forgot-password   → 404     (MEH-166 / MEH-246 — landed weeks ago)
POST /auth/reset-password    → 404     (same)
GET  /holiday-mode           → 404     (MEH-247 — landed earlier, re-patched today)
GET  /search/trending        → 404     (landed earlier)
POST /producers/.../whatsapp-click → 404
POST /producers/.../contact-click  → 404
```

This meant Railway's staging container was running a stale version of
the code that predates all of those endpoints. Every "CI green + merged
to staging" event from the past several weeks was a no-op as far as the
live environment was concerned — tests passed in CI against the new
code while real users were still hitting the old code.

## Impact

- 9 PRs merged to staging on 2026-04-22 (MEH-247, 248, 249, 250, 251,
  252, 253, 254, 255) were not actually running in staging. Every
  `/adversarial-review passed` + `CI green` claim from that batch only
  reflected static code correctness, not runtime.
- MEH-254 (IDOR CRITICAL fix — pending/rejected producers exposed) was
  merged but not live. Leak window extended until deploy was restored.
- MEH-246 was closed as "already implemented" — which was true in
  `staging` HEAD code but false at runtime. The close was correct but
  the signal was misleading: "code exists" ≠ "feature works".
- MEH-256 investigation was stuck because the debug instrumentation
  pushed to staging never actually ran.

## Root cause (two stacked problems)

### Primary: Railway staging environment pointed at the wrong branch

The Railway `staging` environment's GitHub source was configured to
track the `main` branch, not the `staging` branch. Unknown how or when
this happened — possibly during an earlier Railway environment
rebuild. All merges to `staging` went to a branch Railway wasn't
watching. The `deploy.yml` `railway redeploy` CLI kick worked but
redeployed the same stale `main`-tracked code, which looked like a
"successful deploy" in logs while changing nothing.

**Fix:** user re-pointed the staging environment's Source to
`staging` branch via Railway dashboard. No code change needed.

### Secondary: Dockerfile incompatible with Railway's BuildKit

Once the branch was re-pointed, the next deploy attempt failed with:
```
flag '--mount=type=cache,target=/root/.cache/uv' is missing an
id argument at Line 29
```

The `uv` migration (PR #264) used the standard BuildKit cache-mount
syntax. Local Docker BuildKit is lenient (defaults `id` to the target
path). Railway's build runner is not. Attempt #2 added
`id=uv-cache` — still rejected because Railway requires the
Railway-specific `id=s/<service-uuid>-<name>` format.

**Fix (PR #291, merged as `458d651`):** removed the cache mount
entirely. Dockerfile stays portable. Cost is ~20-30s per cold build.

## Timeline

| Time (UTC) | Event |
|---|---|
| Weeks ago | Railway staging environment silently drifted to tracking `main` |
| 2026-04-22 ~17:00 | 9 PRs merged to staging throughout the day |
| 2026-04-22 ~20:10 | MEH-254 IDOR fix merged (CRITICAL) |
| 2026-04-22 ~20:30 | MEH-256 debug merged (`7bcb317`) to capture XFF headers |
| 2026-04-22 ~20:35 | Railway access logs show 404s — drift discovered |
| 2026-04-22 ~20:48 | MEH-256 debug reverted (#288 → `a6e73bd`) — safety first |
| 2026-04-22 ~20:55 | Dockerfile cache-id fix #289 merged → build failed with new cache-id error |
| 2026-04-22 ~21:10 | Dockerfile cache-mount removed #291 → build expected to succeed |
| 2026-04-22 ~21:15 | Branch re-point + build fix both landed — awaiting verification |

## Resolution

1. Railway staging environment pointed at `staging` branch (user,
   dashboard). No code change needed.
2. Dockerfile cache mount removed (PR #291, commit `458d651`) —
   Railway's BuildKit now accepts the build.

Verification (post-deploy) will be done by:

```
BACKEND=https://foodmamkor-staging.up.railway.app
curl -s "$BACKEND/health"                    # expect 200 + db_init=ready
curl -s "$BACKEND/holiday-mode"              # expect 200 + {enabled, key}
curl -s -X POST "$BACKEND/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{"email":"verify@example.com"}'        # expect 200 + OWASP generic
python scripts/check_api_contract.py --probe "$BACKEND"
                                             # expect 0 orphans
```

## Prevention

- **Contract probe in CI post-staging-redeploy is already wired** in
  `.github/workflows/deploy.yml` as `api-contract-probe-staging`, but
  it was in `continue-on-error: true` mode. **Action:** flip to hard
  failure after the probe baseline is confirmed 0 orphans. This will
  detect the same class of drift on the next merge, not weeks later.
- Add a `scripts/check_deploy_age.sh` or equivalent that hits
  `GET /health` on staging AND production weekly and alerts if the
  deployed commit SHA (exposed via a header or `/health` response)
  drifts > N days from `origin/<branch>` HEAD. Tracked as a follow-up.
- Make the Railway `staging` env's Source → Branch setting part of the
  weekly ops checklist until automated verification exists.
- Add "verify Railway deploy actually picked up the change" as an
  explicit line item in `docs/DEPLOYMENT.md` → "Testing workflow".

## Production is suspected to have the same drift

MEH-244 independently observed 404s on `/holiday-mode` and
`/admin/group-buys` in production. Same signature. The fix pattern
(check source-branch config, remove cache mount) probably applies.
Tracked separately in MEH-244 — **not fixed in this PR**, per the
principle "don't touch production until staging is understood".

## Related

- MEH-255 (audit that discovered this indirectly)
- MEH-256 (blocked — debug print removed in #288; XFF investigation
  waits for deploy to work first)
- MEH-244 (production equivalent)
- MEH-245 (contract probe tool — used to detect)
- MEH-246 "already implemented" (correct for code, misleading given
  runtime drift)
