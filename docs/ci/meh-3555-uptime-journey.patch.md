# MEH-3555 — the uptime probe also walks the user journey

> **State: pending** (register row `meh-3555-uptime-journey`). Target: `.github/workflows/uptime.yml`.
> Prepared 21/11/2026 against `uptime.yml` on staging `origin/staging` of that day.

## Why

Every 30 minutes `uptime.yml` checks that `/` and `/api/health/readiness` answer 200, plus Google Places and one OSM tile. That catches "the site is down". It does not catch a catalog that comes back empty, a business page that errors, or images that stop loading. Those are checked only by `scripts/checks/smoke_production.py`, after a push to `main`.

This patch runs `smoke_production.py --quick` (added in the same PR) inside the existing probe step. A failure sets the same `fail=1`, so the existing "two consecutive failing ticks → open the `uptime` issue" logic covers it with no new alerting.

## Cost (measured 21/11 against production)

One `--quick` run = **15 requests to Vercel** (the script prints the count), about 1.5 MB. At 48 ticks a day that is ~22k requests and ~2 GB a month, under 3% of what the Vercel plan includes. It adds about 30 s to a tick. No secret, no write.

## Checks run on the prepared file

- `git apply --check` of the diff below against `uptime.yml` on staging: OK.
- `yaml.safe_load` of the patched file: OK.
- sha256 of the patched file: `2989df653f16c399996e3d50a4963f1f38eda7ba7112fccbc0642fec20436999`.

## Diff

```diff
--- a/.github/workflows/uptime.yml	2026-11-20 22:44:42.782690454 +0000
+++ b/.github/workflows/uptime.yml	2026-11-21 07:37:51.912414192 +0000
@@ -19,9 +19,9 @@
 
 jobs:
   probe:
-    name: Probe /, /api/health/readiness, Google Places and the OSM map tiles
+    name: Probe /, /api/health/readiness, Google Places, the OSM map tiles and the user journey
     runs-on: ${{ (vars.CI_MODE == 'private' || github.event.repository.private) && 'self-hosted' || 'ubuntu-latest' }}
-    timeout-minutes: 5
+    timeout-minutes: 8
     env:
       HOME_URL: https://mehamakor.co.il/
       READY_URL: https://mehamakor.co.il/api/health/readiness
@@ -38,6 +38,14 @@
       GH_TOKEN: ${{ github.token }}
       GH_REPO: ${{ github.repository }}
     steps:
+      # MEH-3555: the journey check below runs a script from the repo.
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
+        with:
+          sparse-checkout: scripts/checks
+      - uses: actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1 # v6.3.0
+        with:
+          python-version: "3.12"
+
       - name: Probe the site, readiness, Places and the map tiles
         id: probe
         shell: bash
@@ -68,6 +76,15 @@
             echo "::warning::OSM tile blocked or unreachable — map tiles on the site may show «Access blocked»"
             fail=1
           fi
+          # MEH-3555: the user journey — catalog, home / producers / map, one
+          # real business page, a Cloudinary image, the WhatsApp preview. Not
+          # only "the site answers". GET only; ~15 requests to Vercel a tick.
+          # Its failure feeds the same fail=1, so two failing ticks in a row
+          # open the same uptime issue as everything else here.
+          if ! python scripts/checks/smoke_production.py --quick; then
+            echo "::warning::production journey check failed (smoke_production.py --quick) — see the lines above"
+            fail=1
+          fi
           echo "fail=$fail" >> "$GITHUB_OUTPUT"
 
       # One issue carries the outage state. Title is fixed so `gh issue list`
```

## After applying

1. Move the register row to `applied` in the same PR.
2. Run `uptime.yml` once by hand (workflow_dispatch) and read the log: the journey lines and `production smoke clean` should be there.
