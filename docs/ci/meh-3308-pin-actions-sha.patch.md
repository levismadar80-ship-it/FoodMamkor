# MEH-3308 — לנעוץ כל action חיצוני ל-SHA מלא · patch ל-`.github/workflows/`

`.github/**` חסום ל-Claude Code (security.md), אז הקובץ הזה הוא ה-patch המדויק
שספיר (או Claude in Chrome אצלה) מחילה. Claude מאמת את ה-PR byte-by-byte אחרי.

**נמדד 19/11/2026 מול `origin/staging` 407a3b98e:** 18 workflows, 90 שורות
`uses:` לפי תגית, 11 צירופי action@tag שונים. רק
`anthropics/claude-code-action` כבר נעוץ.

**למה:** תגית אפשר להזיז; SHA לא. במרץ 2025 הוזזו התגיות של
`tj-actions/changed-files` (CVE-2025-30066) ודלפו secrets מאלפי ריפואים.
GitHub, *Security hardening for GitHub Actions*: "Pin actions to a full length
commit SHA". Dependabot (`package-ecosystem: github-actions`, כבר ב-
`.github/dependabot.yml:97`) מעדכן SHA נעוץ ואת הערת הגרסה שאחריו.

## הטבלה — 11 החלפות (find → replace, בדיוק)

ה-SHA נלקח מ-`git ls-remote --tags` (התגית המקולפת `^{}`), והגרסה המלאה היא
התגית `vX.Y.Z` שמצביעה על אותו commit.

| מחפשים | מחליפים ב- | מופעים |
|---|---|---|
| `uses: actions/checkout@v7` | `uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` | 40 |
| `uses: actions/setup-node@v7` | `uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0` | 15 |
| `uses: astral-sh/setup-uv@v7` | `uses: astral-sh/setup-uv@37802adc94f370d6bfd71619e3f0bf239e1f3b78 # v7.6.0` | 10 |
| `uses: actions/upload-artifact@v7` | `uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2` | 9 |
| `uses: actions/setup-python@v6` | `uses: actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1 # v6.3.0` | 4 |
| `uses: actions/setup-python@v5` | `uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5.6.0` | 1 |
| `uses: dorny/paths-filter@v3` | `uses: dorny/paths-filter@0e4a8c6effa4802afeda77dc8d303f8176d7dfad # v3.0.4` | 3 |
| `uses: actions/download-artifact@v8` | `uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2` | 3 |
| `uses: actions/cache@v6` | `uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0` | 3 |
| `uses: actions/stale@v11` | `uses: actions/stale@4391f3da665fdf50b6810c1a66712fb9ba21aa93 # v11.0.0` | 1 |
| `uses: actions/github-script@v9` | `uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9.0.0` | 1 |

**ההחלפה היא על `uses: …` ולא על `owner/repo@vN` לבד** — `dorny/paths-filter@v3`
מופיע גם בשתי הערות (`deploy.yml`, `pr-checks.yml`), ואלה נשארות כמו שהן.

**שורה אחת מקבלת עוד מחיקה:** `pr-reconcile.yml:41` נגמרת בהערה
`# tag pin, same form as every other workflow in this repo` — אחרי ההחלפה היא
שקרית. מוחקים אותה, כך שהשורה נגמרת ב-`# v7.0.1`.

## אחרי ה-merge — הגדרות (Settings, לא קוד)

1. Settings → Code security → **CodeQL analysis → Set up → Default**. אין קובץ
   workflow בריפו היום, אז אין התנגשות. חינם לריפו ציבורי.
2. באותו מסך: **Secret scanning** ו-**Push protection** — לוודא ששניהם On.
3. Settings → Actions → General → **"Require actions to be pinned to a
   full-length commit SHA"** — רק אחרי שה-PR הזה נמזג ל-staging **ול-main**,
   אחרת כל workflow על main עם תגית ייכשל. זה מוסיף אילוץ (כלל 32), ולכן
   מותר, אבל אם יש ספק — לדלג ולהשאיר ל-Dependabot.

## אימות (Claude, אחרי שה-PR נפתח)

- `git apply --check` של ה-diff למטה על ה-base של ה-PR → נקי.
- ה-diff של ה-PR זהה ל-diff למטה (sha256 של ה-patch שנבנה:
  `5da3e0488eb77241b79969529fe89bb01d7a817d491a42fc03da13b21dd56272`).
- `grep -rnE "uses: [^ ]+@v[0-9]+\s*$" .github` → 0 שורות.
- כל 18 קבצי ה-YAML נטענים (`yaml.safe_load`).

## ה-diff המלא

```diff
diff -ru a/.github/workflows/backup-restore-verify.yml b/.github/workflows/backup-restore-verify.yml
--- a/.github/workflows/backup-restore-verify.yml	2026-11-19 22:47:37.147826380 +0000
+++ b/.github/workflows/backup-restore-verify.yml	2026-11-19 22:47:37.164597766 +0000
@@ -59,10 +59,10 @@
       SECRET_KEY: ci-test-secret-not-for-production
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up uv
-        uses: astral-sh/setup-uv@v7
+        uses: astral-sh/setup-uv@37802adc94f370d6bfd71619e3f0bf239e1f3b78 # v7.6.0
         with:
           version: "latest"
           enable-cache: true
@@ -151,7 +151,7 @@
       TARGET_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_drill_target
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       # Fail, never skip. Also refuse anything that is not the staging Postgres
       # proxy, so a wrong secret can never point this job at production.
diff -ru a/.github/workflows/changelog.yml b/.github/workflows/changelog.yml
--- a/.github/workflows/changelog.yml	2026-11-19 22:47:37.147843496 +0000
+++ b/.github/workflows/changelog.yml	2026-11-19 22:47:37.154502655 +0000
@@ -13,7 +13,7 @@
   changelog:
     runs-on: ubuntu-latest
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
         with:
           fetch-depth: 0
           token: ${{ secrets.GITHUB_TOKEN }}
diff -ru a/.github/workflows/claude-review.yml b/.github/workflows/claude-review.yml
--- a/.github/workflows/claude-review.yml	2026-11-19 22:47:37.147855717 +0000
+++ b/.github/workflows/claude-review.yml	2026-11-19 22:47:37.154643661 +0000
@@ -56,7 +56,7 @@
     continue-on-error: true
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
         with:
           # Full history so the action can diff against the base branch.
           fetch-depth: 0
diff -ru a/.github/workflows/cls-measure.yml b/.github/workflows/cls-measure.yml
--- a/.github/workflows/cls-measure.yml	2026-11-19 22:47:37.147866982 +0000
+++ b/.github/workflows/cls-measure.yml	2026-11-19 22:47:37.171162905 +0000
@@ -30,9 +30,9 @@
       run:
         working-directory: frontend
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
-      - uses: actions/setup-node@v7
+      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: "22"
           cache: npm
@@ -54,7 +54,7 @@
 
       - name: Upload numbers
         if: always()
-        uses: actions/upload-artifact@v7
+        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
         with:
           name: cls-results
           path: frontend/cls-results.json
diff -ru a/.github/workflows/dependency-audit.yml b/.github/workflows/dependency-audit.yml
--- a/.github/workflows/dependency-audit.yml	2026-11-19 22:47:37.147876437 +0000
+++ b/.github/workflows/dependency-audit.yml	2026-11-19 22:47:37.164861504 +0000
@@ -43,11 +43,11 @@
       contents: read
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       # Mirrors pr-checks.yml job 2 setup so cache is shared.
       - name: Set up uv
-        uses: astral-sh/setup-uv@v7
+        uses: astral-sh/setup-uv@37802adc94f370d6bfd71619e3f0bf239e1f3b78 # v7.6.0
         with:
           version: "latest"
           enable-cache: true
@@ -89,10 +89,10 @@
       contents: read
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up Node.js 20
-        uses: actions/setup-node@v7
+        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: "22"
           cache: "npm"
diff -ru a/.github/workflows/deploy.yml b/.github/workflows/deploy.yml
--- a/.github/workflows/deploy.yml	2026-11-19 22:47:37.147887372 +0000
+++ b/.github/workflows/deploy.yml	2026-11-19 22:47:37.186936943 +0000
@@ -93,8 +93,8 @@
       backend: ${{ steps.filter.outputs.backend }}
       workflows: ${{ steps.filter.outputs.workflows }}
     steps:
-      - uses: actions/checkout@v7
-      - uses: dorny/paths-filter@v3
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
+      - uses: dorny/paths-filter@0e4a8c6effa4802afeda77dc8d303f8176d7dfad # v3.0.4
         id: filter
         with:
           filters: |
@@ -134,10 +134,10 @@
         working-directory: frontend
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up Node.js
-        uses: actions/setup-node@v7
+        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: "22"
           cache: "npm"
@@ -167,10 +167,10 @@
       cancel-in-progress: true
     continue-on-error: false
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up Python
-        uses: actions/setup-python@v6
+        uses: actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1 # v6.3.0
         with:
           python-version: "3.11"
 
@@ -362,10 +362,10 @@
       cancel-in-progress: true
     continue-on-error: false
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up Python
-        uses: actions/setup-python@v6
+        uses: actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1 # v6.3.0
         with:
           python-version: "3.11"
 
diff -ru a/.github/workflows/e2e.yml b/.github/workflows/e2e.yml
--- a/.github/workflows/e2e.yml	2026-11-19 22:47:37.147904165 +0000
+++ b/.github/workflows/e2e.yml	2026-11-19 22:47:37.202933716 +0000
@@ -86,10 +86,10 @@
         frontend: ${{ steps.filter.outputs.frontend }}
         backend: ${{ steps.filter.outputs.backend }}
       steps:
-        - uses: actions/checkout@v7
+        - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
           with:
             fetch-depth: 0  # MEH-675: paths-filter needs full history to diff against parent
-        - uses: dorny/paths-filter@v3
+        - uses: dorny/paths-filter@0e4a8c6effa4802afeda77dc8d303f8176d7dfad # v3.0.4
           id: filter
           with:
             filters: |
@@ -205,11 +205,11 @@
           --health-retries 10
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up uv (PR runs — local backend)
         if: github.event_name == 'pull_request'
-        uses: astral-sh/setup-uv@v7
+        uses: astral-sh/setup-uv@37802adc94f370d6bfd71619e3f0bf239e1f3b78 # v7.6.0
         with:
           version: "latest"
           enable-cache: true
@@ -234,7 +234,7 @@
           DEMO_ADMIN_PASSWORD: ${{ secrets.DEMO_ADMIN_PASSWORD }}
 
       - name: Set up Node.js 20
-        uses: actions/setup-node@v7
+        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: "22"
           cache: "npm"
@@ -242,7 +242,7 @@
 
       - name: Cache Playwright browsers
         id: playwright-cache
-        uses: actions/cache@v6
+        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
         with:
           path: ~/.cache/ms-playwright
           key: playwright-${{ runner.os }}-chromium-${{ hashFiles('frontend/package-lock.json') }}
@@ -438,7 +438,7 @@
       # MEH-2895: the QA report comment moved to the e2e-report job below — two
       # shards posting into one upserted comment would overwrite each other.
       - name: Upload blob report (for e2e-report)
-        uses: actions/upload-artifact@v7
+        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
         if: >-
           always() && steps.e2e-run.outcome != 'cancelled' &&
           steps.e2e-run.outcome != 'skipped'
@@ -451,7 +451,7 @@
           overwrite: true
 
       - name: Upload Playwright report
-        uses: actions/upload-artifact@v7
+        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
         if: failure()
         with:
           name: playwright-report-${{ matrix.shard }}
@@ -517,7 +517,7 @@
       # `if-no-files-found: warn` so an empty capture is visible rather than a
       # silent success, which is the failure mode this whole ticket is about.
       - name: Upload E2E diagnostics (MEH-1712)
-        uses: actions/upload-artifact@v7
+        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
         if: always()
         with:
           name: e2e-diagnostics-${{ matrix.shard }}
@@ -546,10 +546,10 @@
       always() && needs.e2e.result != 'skipped' &&
       needs.e2e.result != 'cancelled'
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up Node.js
-        uses: actions/setup-node@v7
+        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: "22"
           cache: "npm"
@@ -562,7 +562,7 @@
       # One directory per shard (no merge-multiple), so a missing shard can be
       # named rather than merely counted.
       - name: Download blob reports
-        uses: actions/download-artifact@v8
+        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
         with:
           pattern: blob-report-*
           path: frontend/all-blob-reports
@@ -636,7 +636,7 @@
       # false-failure class, observed live on PR #1568 within an hour of the
       # step landing). The fresh run upserts the real verdict.
       - name: Post QA report comment
-        uses: actions/github-script@v9
+        uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9.0.0
         # !cancelled(): when npm ci / checkout / download fail, the counts are
         # empty and the verdict module says DID NOT RUN — better than leaving the
         # previous head's comment up, looking current.
@@ -847,10 +847,10 @@
         (github.event.action != 'labeled' || github.event.label.name == 'run-e2e')))
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up Node.js 20
-        uses: actions/setup-node@v7
+        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: "22"
           cache: "npm"
@@ -859,7 +859,7 @@
       # Separate key from the Chromium job. See property 3 above.
       - name: Cache Playwright browsers (webkit)
         id: playwright-cache-webkit
-        uses: actions/cache@v6
+        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
         with:
           path: ~/.cache/ms-playwright
           key: playwright-${{ runner.os }}-webkit-${{ hashFiles('frontend/package-lock.json') }}
@@ -989,7 +989,7 @@
       # Distinct artifact name: two jobs uploading `playwright-report` in the
       # same run collide.
       - name: Upload Playwright report (webkit)
-        uses: actions/upload-artifact@v7
+        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
         if: always() && steps.e2e-webkit-run.outcome == 'failure'
         with:
           name: playwright-report-webkit
diff -ru a/.github/workflows/i18n-icu-parity.yml b/.github/workflows/i18n-icu-parity.yml
--- a/.github/workflows/i18n-icu-parity.yml	2026-11-19 22:47:37.147928756 +0000
+++ b/.github/workflows/i18n-icu-parity.yml	2026-11-19 22:47:37.183812701 +0000
@@ -34,9 +34,9 @@
     runs-on: ubuntu-latest
     timeout-minutes: 5
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
       - name: Set up Python 3.11
-        uses: actions/setup-python@v5
+        uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5.6.0
         with:
           python-version: '3.11'
       - name: Validate HE/EN plural parity
diff -ru a/.github/workflows/post-deploy-checks.yml b/.github/workflows/post-deploy-checks.yml
--- a/.github/workflows/post-deploy-checks.yml	2026-11-19 22:47:37.147940235 +0000
+++ b/.github/workflows/post-deploy-checks.yml	2026-11-19 22:47:37.180071579 +0000
@@ -54,7 +54,7 @@
       - name: Target
         run: echo "BASE_URL=$BASE_URL IS_PRODUCTION=$IS_PRODUCTION (smoke and Lighthouse run only when IS_PRODUCTION=true)"
 
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
         with:
           # MEH-2864: frontend-touched.sh diffs from the last checked push; with
           # the default depth of 1 that commit is missing and it fails safe
@@ -80,11 +80,11 @@
             echo "touched=true" >> "$GITHUB_OUTPUT"
           fi
 
-      - uses: actions/setup-python@v6
+      - uses: actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1 # v6.3.0
         with:
           python-version: "3.11"
 
-      - uses: actions/setup-node@v7
+      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: "22"
 
@@ -165,7 +165,7 @@
 
       - name: Keep the Lighthouse report
         if: always()
-        uses: actions/upload-artifact@v7
+        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
         with:
           name: lighthouse-report-${{ github.ref_name }}-${{ github.run_id }}
           path: lhci-report/
diff -ru a/.github/workflows/post-merge-lock-check.yml b/.github/workflows/post-merge-lock-check.yml
--- a/.github/workflows/post-merge-lock-check.yml	2026-11-19 22:47:37.147952307 +0000
+++ b/.github/workflows/post-merge-lock-check.yml	2026-11-19 22:47:37.164247886 +0000
@@ -26,10 +26,10 @@
     runs-on: ubuntu-latest
     timeout-minutes: 5
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up uv
-        uses: astral-sh/setup-uv@v7
+        uses: astral-sh/setup-uv@37802adc94f370d6bfd71619e3f0bf239e1f3b78 # v7.6.0
         with:
           version: "latest"
           enable-cache: true
diff -ru a/.github/workflows/pr-checks.yml b/.github/workflows/pr-checks.yml
--- a/.github/workflows/pr-checks.yml	2026-11-19 22:47:37.147962348 +0000
+++ b/.github/workflows/pr-checks.yml	2026-11-19 22:47:37.191483090 +0000
@@ -151,7 +151,7 @@
       # needs the parent; on the default depth-1 checkout it must `git fetch`
       # it, and a runner that cannot reach origin at that moment fails the
       # guard closed — a false red on a PR with nothing wrong with it.
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
         with:
           fetch-depth: 2
       - name: Run every guard in scripts/checks/ (MEH-999)
@@ -162,7 +162,7 @@
     runs-on: ubuntu-latest
     timeout-minutes: 10
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
         with:
           fetch-depth: 0
       - name: Cap qa-artifacts growth (MEH-1156)
@@ -221,8 +221,8 @@
       workflows: ${{ steps.filter.outputs.workflows }}
       deps: ${{ steps.filter.outputs.deps }}
     steps:
-      - uses: actions/checkout@v7
-      - uses: dorny/paths-filter@v3
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
+      - uses: dorny/paths-filter@0e4a8c6effa4802afeda77dc8d303f8176d7dfad # v3.0.4
         id: filter
         with:
           filters: |
@@ -272,10 +272,10 @@
         working-directory: frontend
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up Node.js 20
-        uses: actions/setup-node@v7
+        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: "22"
           cache: "npm"
@@ -329,10 +329,10 @@
         working-directory: frontend
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up Node.js 20
-        uses: actions/setup-node@v7
+        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: "22"
           cache: "npm"
@@ -421,10 +421,10 @@
           --health-retries 5
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up uv
-        uses: astral-sh/setup-uv@v7
+        uses: astral-sh/setup-uv@37802adc94f370d6bfd71619e3f0bf239e1f3b78 # v7.6.0
         with:
           version: "latest"
           enable-cache: true
@@ -568,7 +568,7 @@
           mv shard-report.txt "shard-out/shard-report-${{ matrix.shard }}.txt"
 
       - name: Upload coverage data
-        uses: actions/upload-artifact@v7
+        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
         with:
           name: pytest-coverage-${{ matrix.shard }}
           path: shard-out/
@@ -597,10 +597,10 @@
             exit 1
           fi
 
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up uv
-        uses: astral-sh/setup-uv@v7
+        uses: astral-sh/setup-uv@37802adc94f370d6bfd71619e3f0bf239e1f3b78 # v7.6.0
         with:
           version: "latest"
           enable-cache: true
@@ -611,7 +611,7 @@
         working-directory: backend
 
       - name: Download shard coverage data
-        uses: actions/download-artifact@v8
+        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
         with:
           pattern: pytest-coverage-*
           path: shard-out
@@ -699,10 +699,10 @@
       SECRET_KEY: ci-test-secret-not-for-production
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up uv
-        uses: astral-sh/setup-uv@v7
+        uses: astral-sh/setup-uv@37802adc94f370d6bfd71619e3f0bf239e1f3b78 # v7.6.0
         with:
           version: "latest"
           enable-cache: true
@@ -750,10 +750,10 @@
     timeout-minutes: 5
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up uv
-        uses: astral-sh/setup-uv@v7
+        uses: astral-sh/setup-uv@37802adc94f370d6bfd71619e3f0bf239e1f3b78 # v7.6.0
         with:
           version: "latest"
           enable-cache: true
@@ -796,7 +796,7 @@
     timeout-minutes: 10
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Run drift check
         run: bash scripts/check_env_drift.sh
@@ -827,10 +827,10 @@
     timeout-minutes: 10
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up uv
-        uses: astral-sh/setup-uv@v7
+        uses: astral-sh/setup-uv@37802adc94f370d6bfd71619e3f0bf239e1f3b78 # v7.6.0
         with:
           version: "latest"
           enable-cache: true
@@ -863,10 +863,10 @@
         working-directory: frontend
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up Node.js 20
-        uses: actions/setup-node@v7
+        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: "22"
           cache: "npm"
@@ -901,10 +901,10 @@
         working-directory: frontend
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up Node.js 20
-        uses: actions/setup-node@v7
+        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: "22"
           cache: "npm"
@@ -935,9 +935,9 @@
       run:
         working-directory: frontend
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
       - name: Set up Node.js 20
-        uses: actions/setup-node@v7
+        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: "22"
           cache: "npm"
@@ -947,7 +947,7 @@
       - name: Run vitest shard ${{ matrix.shard }}/3 (with coverage — merged below)
         run: npx vitest run --coverage --shard=${{ matrix.shard }}/3 --reporter=blob --reporter=default
       - name: Upload blob report
-        uses: actions/upload-artifact@v7
+        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
         with:
           name: vitest-blob-${{ matrix.shard }}
           path: frontend/.vitest-reports/
@@ -976,9 +976,9 @@
             echo "::error::A vitest shard did not pass (result=$R_SHARDS) — see the 'Frontend unit tests (vitest N/3)' jobs."
             exit 1
           fi
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
       - name: Set up Node.js 20
-        uses: actions/setup-node@v7
+        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: "22"
           cache: "npm"
@@ -986,7 +986,7 @@
       - name: Install dependencies
         run: npm ci
       - name: Download blob reports
-        uses: actions/download-artifact@v8
+        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
         with:
           pattern: vitest-blob-*
           path: frontend/.vitest-reports
@@ -1030,7 +1030,7 @@
     timeout-minutes: 5
     continue-on-error: true
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
       - name: Write PR title and body to files
         env:
           PR_TITLE: ${{ github.event.pull_request.title }}
@@ -1068,9 +1068,9 @@
     permissions:
       contents: read
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
       - name: Set up uv
-        uses: astral-sh/setup-uv@v7
+        uses: astral-sh/setup-uv@37802adc94f370d6bfd71619e3f0bf239e1f3b78 # v7.6.0
         with:
           version: "latest"
           enable-cache: true
diff -ru a/.github/workflows/pr-reconcile.yml b/.github/workflows/pr-reconcile.yml
--- a/.github/workflows/pr-reconcile.yml	2026-11-19 22:47:37.147989997 +0000
+++ b/.github/workflows/pr-reconcile.yml	2026-11-19 22:47:37.158744198 +0000
@@ -38,11 +38,11 @@
     runs-on: ubuntu-latest
     timeout-minutes: 15
     steps:
-      - uses: actions/checkout@v7 # tag pin, same form as every other workflow in this repo
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
         with:
           persist-credentials: false
 
-      - uses: actions/setup-node@v7
+      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: 22
 
diff -ru a/.github/workflows/skills-audit.yml b/.github/workflows/skills-audit.yml
--- a/.github/workflows/skills-audit.yml	2026-11-19 22:47:37.148001134 +0000
+++ b/.github/workflows/skills-audit.yml	2026-11-19 22:47:37.153851379 +0000
@@ -41,7 +41,7 @@
       contents: read
 
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Verify jq is available
         run: jq --version
diff -ru a/.github/workflows/staging-health.yml b/.github/workflows/staging-health.yml
--- a/.github/workflows/staging-health.yml	2026-11-19 22:47:37.148009739 +0000
+++ b/.github/workflows/staging-health.yml	2026-11-19 22:47:37.154552094 +0000
@@ -29,7 +29,7 @@
     runs-on: ubuntu-latest
     timeout-minutes: 5
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
         with:
           ref: staging   # the script comes from staging, never from the PR head
       - name: Post Staging health
diff -ru a/.github/workflows/staging-smoke.yml b/.github/workflows/staging-smoke.yml
--- a/.github/workflows/staging-smoke.yml	2026-11-19 22:47:37.148028371 +0000
+++ b/.github/workflows/staging-smoke.yml	2026-11-19 22:47:37.180380129 +0000
@@ -60,10 +60,10 @@
     runs-on: ubuntu-latest
     timeout-minutes: 12
     steps:
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
 
       - name: Set up Python
-        uses: actions/setup-python@v6
+        uses: actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1 # v6.3.0
         with:
           python-version: "3.11"
 
diff -ru a/.github/workflows/stale.yml b/.github/workflows/stale.yml
--- a/.github/workflows/stale.yml	2026-11-19 22:47:37.148046010 +0000
+++ b/.github/workflows/stale.yml	2026-11-19 22:47:37.199972737 +0000
@@ -21,7 +21,7 @@
   stale:
     runs-on: ubuntu-latest
     steps:
-      - uses: actions/stale@v11
+      - uses: actions/stale@4391f3da665fdf50b6810c1a66712fb9ba21aa93 # v11.0.0
         with:
           days-before-pr-stale: 7 # rtl-ok
           days-before-pr-close: 7 # rtl-ok
diff -ru a/.github/workflows/vrt-update.yml b/.github/workflows/vrt-update.yml
--- a/.github/workflows/vrt-update.yml	2026-11-19 22:47:37.148065278 +0000
+++ b/.github/workflows/vrt-update.yml	2026-11-19 22:47:37.195921413 +0000
@@ -101,7 +101,7 @@
           echo "  (MEH-1112/1113)."
           exit 1
 
-      - uses: actions/checkout@v7
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
         with:
           ref: ${{ env.TARGET_REF }}
 
@@ -145,7 +145,7 @@
 
       - name: Set up Node.js 20
         if: steps.scope.outputs.skip != 'true'
-        uses: actions/setup-node@v7
+        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
         with:
           node-version: "22"
           cache: "npm"
@@ -154,7 +154,7 @@
       - name: Cache Playwright browsers
         if: steps.scope.outputs.skip != 'true'
         id: playwright-cache
-        uses: actions/cache@v6
+        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
         with:
           path: ~/.cache/ms-playwright
           key: playwright-${{ runner.os }}-chromium-${{ hashFiles('frontend/package-lock.json') }}
@@ -255,7 +255,7 @@
       # never wrote. `scope.result == 'success'` separates "resolved, not
       # skipped" from "never resolved".
       - name: Upload report on failure
-        uses: actions/upload-artifact@v7
+        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
         if: failure() && steps.scope.conclusion == 'success' && steps.scope.outputs.skip != 'true'
         with:
           name: vrt-update-report
```
