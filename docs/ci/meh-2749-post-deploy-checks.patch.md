> **Status: APPLIED on the PR branch — as-of 06/11/2026.** Sapir committed `.github/workflows/post-deploy-checks.yml` in `16620bb` (GitHub web editor). CC compared it with the yaml block below: byte-identical, 120 lines. It reaches `staging` when PR #4069 merges.
> Re-check before acting: `git ls-tree origin/staging .github/workflows/post-deploy-checks.yml`. This file stays as the record of why each step is there; change the workflow and this block together.

# 🔧 Staged patch — post-deploy checks workflow (MEH-2749)

## What it does

After every push to `staging` or `main`, once the new build is live, one job runs four checks against the live site:

| Step | Script | Fails on |
|---|---|---|
| Wait for the build | `scripts/checks/wait_for_deploy.py` | never (times out with a warning after 20 min) |
| Production smoke (main only) | `scripts/checks/smoke_production.py` (MEH-2088, existed but was wired to nothing) | a sitemap URL 404, a key page not 200, readiness not ready |
| Broken links | `scripts/link-check.mjs` (MEH-1963, reused — not a second crawler) | any internal link 4xx/5xx |
| Security headers (live) | `scripts/checks/live_security_headers.py` | CSP / HSTS / frame / sniff / referrer missing on HTML or API |
| Lighthouse budget (production only) | `scripts/checks/lighthouserc.cjs` | bytes, CLS, a11y / SEO / best-practices below budget (timing = warn only) |

Every check runs even if an earlier one failed; the last step names each red. The Lighthouse HTML report is kept as a 14-day artifact.

**Not a required check.** It runs after merge, against the live site, so it cannot block a PR. A red arrives as the usual GitHub Actions failure email.

**All logic is in scripts.** Changing a budget or a URL list never needs a workflow edit.

## Why it is staged and not committed

`.github/workflows/**` is denied to CC's filesystem tools and the Contents API is refused at the sandbox proxy (`.claude/rules/security.md`, measured 28/10). Sapir commits the file below through the GitHub web editor on the PR branch; CC then verifies the PR diff byte-for-byte.

**Why Lighthouse is production-only.** Lighthouse sends extra headers on every request the page makes, third-party hosts included (Chrome `Network.setExtraHTTPHeaders`). Running it on staging would hand the Vercel bypass secret to Cloudinary, Google, PostHog and Sentry. So the secret is given only to the three steps that scope it to our own origin (wait, links, headers), and Lighthouse runs where no secret is needed.

## Apply only after

The home page CLS fix is merged. Until it reaches production the Lighthouse step is red on every `main` run (home CLS 0.42 — the route loading fallback is 40vh, so on a phone the footer is in the first screen and jumps).

## The file — `.github/workflows/post-deploy-checks.yml`

```yaml
name: Post-deploy checks

# MEH-2749 — after every push to staging or main, once the new build is live:
#   1. production smoke (main only) — scripts/checks/smoke_production.py
#   2. broken-link crawl — scripts/link-check.mjs (MEH-1963, reused) +
#      live security headers — scripts/checks/live_security_headers.py
#   3. Lighthouse performance budget — scripts/checks/lighthouserc.cjs
# Not a required check: it runs after merge, against the live site. A red
# here means "the deploy that just landed broke something" and arrives as the
# usual GitHub Actions failure email. All logic lives in scripts/checks/;
# this file only wires it, so changing a budget never needs a workflow edit.

"on":
  push:
    branches: [staging, main]
  workflow_dispatch:
    inputs:
      target:
        description: "Which site to check"
        type: choice
        options: [production, staging]
        default: production

permissions:
  contents: read

concurrency:
  group: post-deploy-checks-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    name: Post-deploy checks (${{ github.ref_name }})
    runs-on: ubuntu-latest
    timeout-minutes: 45
    env:
      BASE_URL: ${{ (github.event_name == 'workflow_dispatch' && inputs.target == 'staging' || github.event_name == 'push' && github.ref == 'refs/heads/staging') && 'https://staging.mehamakor.online' || 'https://mehamakor.co.il' }}
      IS_PRODUCTION: ${{ (github.event_name == 'workflow_dispatch' && inputs.target == 'production' || github.event_name == 'push' && github.ref == 'refs/heads/main') && 'true' || 'false' }}
    steps:
      - name: Target
        run: echo "BASE_URL=$BASE_URL IS_PRODUCTION=$IS_PRODUCTION (smoke and Lighthouse run only when IS_PRODUCTION=true)"

      - uses: actions/checkout@v7

      - uses: actions/setup-python@v6
        with:
          python-version: "3.11"

      - uses: actions/setup-node@v7
        with:
          node-version: "22"

      - name: Wait for the new build to be live
        if: github.event_name == 'push'
        env:
          VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
        run: python scripts/checks/wait_for_deploy.py --base-url "$BASE_URL" --sha "${{ github.sha }}" || echo "::warning title=Deploy not detected::the checks below may describe the previous build"

      - name: Production smoke
        id: smoke
        if: env.IS_PRODUCTION == 'true'
        continue-on-error: true
        run: python scripts/checks/smoke_production.py --base-url "$BASE_URL"

      - name: Broken links
        id: links
        continue-on-error: true
        env:
          VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
        run: node scripts/link-check.mjs "$BASE_URL"

      - name: Security headers (live)
        id: headers
        continue-on-error: true
        env:
          VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
        run: |
          python scripts/checks/live_security_headers.py --self-test
          python scripts/checks/live_security_headers.py --base-url "$BASE_URL"

      - name: Lighthouse budget
        id: lighthouse
        # Production only, and no bypass secret in this step: Lighthouse would
        # send it to every third-party host the page loads.
        if: env.IS_PRODUCTION == 'true'
        continue-on-error: true
        env:
          LHCI_BASE_URL: ${{ env.BASE_URL }}
        run: |
          npx --yes @lhci/cli@0.15.1 collect --config=scripts/checks/lighthouserc.cjs
          # upload (to the local report folder) BEFORE assert, so a red run still keeps its report
          npx --yes @lhci/cli@0.15.1 upload --config=scripts/checks/lighthouserc.cjs
          npx --yes @lhci/cli@0.15.1 assert --config=scripts/checks/lighthouserc.cjs

      - name: Keep the Lighthouse report
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: lighthouse-report-${{ github.ref_name }}-${{ github.run_id }}
          path: lhci-report/
          if-no-files-found: ignore
          retention-days: 14

      - name: Verdict
        if: always()
        env:
          R_SMOKE: ${{ steps.smoke.outcome }}
          R_LINKS: ${{ steps.links.outcome }}
          R_HEADERS: ${{ steps.headers.outcome }}
          R_LH: ${{ steps.lighthouse.outcome }}
        run: |
          fail=0
          for pair in "Production smoke:$R_SMOKE" "Broken links:$R_LINKS" "Security headers:$R_HEADERS" "Lighthouse budget:$R_LH"; do
            name="${pair%%:*}"; res="${pair##*:}"
            case "$res" in
              success|skipped) echo "  OK   $name: $res" ;;
              *) echo "::error::$name: $res"; fail=1 ;;
            esac
          done
          exit $fail
```
