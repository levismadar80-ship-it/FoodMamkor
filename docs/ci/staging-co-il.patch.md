# Staging host → `staging.mehamakor.co.il` — the `.github` and settings half (MEH-3405)

Staging moved from `staging.mehamakor.online` to `staging.mehamakor.co.il`
on 20/11/2026 (Vercel domain, Railway `FRONTEND_URL` + `CORS_ORIGINS`, Google
OAuth origin). The code half is in the same PR as this file. These files are
not editable by Claude Code (`.github/**`, `.claude/settings.json`), so they
are here as a patch for Sapir to apply.

**Status (20/11/2026):** part 1 (workflows) is applied by PR #4931. Part 2
(settings + hook) is applied by PR #4932: Sapir committed it herself, a little
wider than written below (`*.mehamakor.co.il` in the hook, and
`mehamakor.co.il` in settings too).

**Order matters:** apply this before `staging.mehamakor.online` is turned into
a redirect. Until then both hosts serve staging, so nothing is red either way.

Verified: `git apply --check` against this branch (base = `staging` at the time of the PR) → clean. Only the host string
changes; no YAML structure is touched.

## 1. Workflows — `git apply`

```diff
diff --git a/.github/workflows/cls-measure.yml b/.github/workflows/cls-measure.yml
index 8b19408..adfea3a 100644
--- a/.github/workflows/cls-measure.yml
+++ b/.github/workflows/cls-measure.yml
@@ -13,7 +13,7 @@ on:
       url:
         description: "Base URL"
         required: false
-        default: "https://staging.mehamakor.online"
+        default: "https://staging.mehamakor.co.il"
         type: string
       runs:
         description: "Loads per viewport"
diff --git a/.github/workflows/deploy.yml b/.github/workflows/deploy.yml
index fb8ff88..6fbeabb 100644
--- a/.github/workflows/deploy.yml
+++ b/.github/workflows/deploy.yml
@@ -7,7 +7,7 @@ name: Deploy
 #   1. Vercel auto-deploys via its own GitHub integration — that
 #      keeps working with no help from this workflow. Vercel handles
 #      both production (main → mehamakor.online) and preview/staging
-#      (staging → staging.mehamakor.online) on its own.
+#      (staging → staging.mehamakor.co.il) on its own.
 #   2. Railway needs a kick because its own watch-paths config can
 #      legitimately skip deploys (e.g. doc-only PRs that don't touch
 #      backend/) and previously left main and Railway out of sync.
@@ -378,7 +378,7 @@ jobs:
       - name: Probe staging
         env:
           VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
-        run: python scripts/check_api_contract.py --probe https://staging.mehamakor.online
+        run: python scripts/check_api_contract.py --probe https://staging.mehamakor.co.il
   # ──────────────────────────────────────────────────────────────────
   # DEPLOY GATE (MEH-892 completion) — deploy-side required-check aggregator.
   # ──────────────────────────────────────────────────────────────────
diff --git a/.github/workflows/e2e.yml b/.github/workflows/e2e.yml
index fbeae4a..7ee5d39 100644
--- a/.github/workflows/e2e.yml
+++ b/.github/workflows/e2e.yml
@@ -346,7 +346,7 @@ jobs:
 
       # MEH-1712 — CAPTURE ONLY. Dials Railway FROM THE RUNNER, which is the one
       # path nobody has measured: the CC sandbox is blocked from *.up.railway.app
-      # (MEH-360), and staging.mehamakor.online reaches the same backend only via
+      # (MEH-360), and staging.mehamakor.co.il reaches the same backend only via
       # the Vercel edge, so neither reproduces the runner's own client/DNS/TLS.
       #
       # Two probes, not one, because the open question is an ASYMMETRY: the
diff --git a/.github/workflows/post-deploy-checks.yml b/.github/workflows/post-deploy-checks.yml
index a1f6147..4d2b908 100644
--- a/.github/workflows/post-deploy-checks.yml
+++ b/.github/workflows/post-deploy-checks.yml
@@ -48,7 +48,7 @@ jobs:
     runs-on: ${{ (vars.CI_MODE == 'private' || github.event.repository.private) && 'self-hosted' || 'ubuntu-latest' }}
     timeout-minutes: 45
     env:
-      BASE_URL: ${{ (github.event_name == 'workflow_dispatch' && inputs.target == 'staging' || github.event_name == 'push' && github.ref == 'refs/heads/staging') && 'https://staging.mehamakor.online' || 'https://mehamakor.co.il' }}
+      BASE_URL: ${{ (github.event_name == 'workflow_dispatch' && inputs.target == 'staging' || github.event_name == 'push' && github.ref == 'refs/heads/staging') && 'https://staging.mehamakor.co.il' || 'https://mehamakor.co.il' }}
       IS_PRODUCTION: ${{ (github.event_name == 'workflow_dispatch' && inputs.target == 'production' || github.event_name == 'push' && github.ref == 'refs/heads/main') && 'true' || 'false' }}
     steps:
       - name: Target
```

## 2. `.claude/settings.json` + `.claude/hooks/check-webfetch-allowlist.sh`

The WebFetch allowlist has two gates; the settings line alone does nothing,
because the hook still exits 2 for a host it does not list.

In `.claude/hooks/check-webfetch-allowlist.sh`, next to
`mehamakor.online|*.mehamakor.online) exit 0 ;;` add:

```sh
  staging.mehamakor.co.il) exit 0 ;;
```

In `.claude/settings.json`, next to `"WebFetch(domain:staging.mehamakor.online)",` add:

```json
      "WebFetch(domain:staging.mehamakor.co.il)",
```

Keep the `.online` line until that host
is retired (thread «Plan the move off mehamakor.online»).
