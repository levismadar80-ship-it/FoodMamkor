import { defineConfig, devices } from "@playwright/test";

// MEH-1044 — CI runs E2E against a local `next start`. PLAYWRIGHT_BASE_URL is
// the explicit override; TEST_URL is kept for manual runs against
// staging/preview URLs (testing.md TLS note).
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_URL || "http://localhost:3000";

// MEH-1727 — the two `x-vercel-*` headers below are sent by Playwright on
// EVERY request, including cross-origin ones. A cross-origin @font-face fetch
// is always CORS-mode, so it preflights, and fonts.gstatic.com does not list
// `x-vercel-skip-toolbar` in Access-Control-Allow-Headers — the preflight is
// rejected and ALL 11 .woff2 files fail. The page then renders in system
// fallback fonts, which is what the VRT baselines were measuring.
//
// Both headers only ever meant anything against a Vercel-hosted target. Since
// MEH-1044 the CI target is http://localhost:3000 (vrt-update.yml:119 sets it
// explicitly), where there is no Deployment Protection to bypass and no Vercel
// toolbar to suppress — so on a local target they are pure cost. Gate them on
// the target instead of deleting them, so a manual run against a preview URL
// still gets MEH-264's bypass and MEH-306 sub-B's toolbar suppression.
const isLocalTarget = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  // MEH-1241 / MEH-1528: provision authenticated storageState for the seeded QA
  // accounts (demo-owner=producer / demo-consumer / demo-admin), one file per
  // role. No-ops on a local baseURL WHEN no DEMO_*_PASSWORD is set; with the
  // passwords set (seeded local stack) it provisions locally too. Specs opt in
  // via test.use({ storageState: "e2e/.auth/<role>.json" }). The older
  // SMOKE_ADMIN_* fixture (flows/19,20) is a separate disposable-producer admin.
  globalSetup: "./e2e/global-setup.ts",
  // MEH-991 Chunk 3: e2e/visual holds the VRT parity specs; baselines are
  // runner-generated via .github/workflows/vrt-update.yml (workflow_dispatch).
  testMatch: ["e2e/flows/**/*.spec.ts", "e2e/visual/**/*.spec.ts"],
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
 reporter: process.env.CI
    ? [
        ["html", { open: "never" }],
        ["list"],
        // MEH-1604: ה-JSON reporter הוא מקור האמת ל"כמה טסטים באמת רצו".
        // ה-summary נקרא ע"י שלב "E2E coverage floor" ב-e2e.yml.
        ["json", { outputFile: "playwright-report/results.json" }],
      ]
    : [["list"]],
  // MEH-728: timing budgets raised for Vercel preview cold-start. The two
  // documented flakes (PR #885 waitForURL, #886 toBeVisible) hit the 10s
  // ceiling on attempt 1, then passed on retry in ~4-5s once the preview was
  // warm. A 20s expect floor + 45s per-test headroom (paired with the e2e.yml
  // warm-up ping) keeps cold-start latency from tripping --fail-on-flaky-tests
  // (MEH-484). The flake gate itself is unchanged.
  timeout: 45_000,
  expect: {
    timeout: 20_000,
    // MEH-991 Chunk 3 — VRT comparison budget. 2% pixel tolerance absorbs
    // sub-pixel AA jitter between runs on the same runner image; animations
    // disabled + caret hidden so screenshots are frame-stable.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: BASE_URL,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    actionTimeout: 20_000, // MEH-728: 10s→20s for preview cold-start headroom
    navigationTimeout: 30_000,
    reducedMotion: "reduce",
    ignoreHTTPSErrors: true,
    // MEH-484 — flake visibility: keep trace + video small by default,
    // capture rich evidence only when a test fails or retries.
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
    // MEH-264 — Vercel Deployment Protection returns 403 "host_not_allowed"
    // on every preview URL until requests present this bypass header.
    // MEH-1241 — canonical env name is VERCEL_AUTOMATION_BYPASS_SECRET (the
    // Vercel system env / GitHub secret name); the legacy job-export alias
    // VERCEL_BYPASS_SECRET is kept only as a fallback. Same precedence as
    // global-setup.ts so both surfaces read the same value. When unset (local
    // runs), we send an empty string which Vercel ignores for non-protected
    // environments.
    //
    // MEH-306 sub-B — `x-vercel-skip-toolbar=1` removes the
    // <vercel-live-feedback> widget from preview pages so its overlay
    // doesn't intercept pointer events during tests (per
    // https://vercel.com/docs/vercel-toolbar/managing-toolbar).
    // MEH-1727: gated on the target — see isLocalTarget above. Empty object on
    // localhost so cross-origin font preflights carry no unlisted header.
    extraHTTPHeaders: isLocalTarget
      ? {}
      : {
          "x-vercel-protection-bypass":
            process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_BYPASS_SECRET || "",
          "x-vercel-skip-toolbar": "1",
        },
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        // MEH-1788: this project is Chromium by design and stays that way.
        // Precise status of webkit, which this comment used to get wrong:
        //   sandbox — AVAILABLE, behind PW_WEBKIT=1 (see the projects below,
        //             and docs/qa/webkit-local.md for the install procedure)
        //   CI      — NOT wired yet. That is step B and it is Sapir's: it
        //             needs .github/workflows/**, which is CC-deny (MEH-671).
        // Until step B lands, every "mobile QA" claim from CI or from a CC
        // session that did not set the flag is a Chromium claim.
        browserName: "chromium",
      },
    },
    // MEH-1788 step A — real Safari engine coverage, opt-in.
    //
    // Gated on PW_WEBKIT so the default project list is byte-identical to
    // before this change: without the flag the spread contributes nothing, so
    // CI (which does not set it) cannot be affected by this commit. That is
    // asserted, not assumed — see the two runs quoted in the PR body.
    //
    // Deliberately NOT applied to e2e/visual/**: VRT baselines are per-project,
    // so a new project would demand a whole fresh baseline set. Out of scope.
    ...(process.env.PW_WEBKIT === "1"
      ? [
          {
            // Real iPhone 13 metrics — the device class the Israeli consumer
            // audience actually carries.
            name: "webkit-iphone13",
            // VRT baselines are stored PER PROJECT, and no webkit baseline set
            // exists. Without this the project would run visual/parity.spec.ts
            // and mint a fresh baseline for every shot — a bot-authored
            // baseline freezes whatever state the code is in, bug included
            // (MEH-1552 / MEH-1765). Measured: without testIgnore the flag
            // took the suite 224 -> 448 tests, i.e. it had silently inherited
            // the whole VRT set.
            testIgnore: /visual\//,
            use: {
              browserName: "webkit" as const,
              viewport: { width: 390, height: 664 },
              deviceScaleFactor: 3,
              isMobile: true,
              hasTouch: true,
            },
          },
          {
            // Same viewport as the Chromium `mobile` project, different engine.
            // This is the controlled comparison: when a spec passes on `mobile`
            // and fails here, the viewport is held constant so the engine is
            // the only variable left.
            name: "webkit-pixel5-viewport",
            // VRT baselines are stored PER PROJECT, and no webkit baseline set
            // exists. Without this the project would run visual/parity.spec.ts
            // and mint a fresh baseline for every shot — a bot-authored
            // baseline freezes whatever state the code is in, bug included
            // (MEH-1552 / MEH-1765). Measured: without testIgnore the flag
            // took the suite 224 -> 448 tests, i.e. it had silently inherited
            // the whole VRT set.
            testIgnore: /visual\//,
            use: {
              browserName: "webkit" as const,
              viewport: { width: 393, height: 727 },
              deviceScaleFactor: 2.75,
              isMobile: true,
              hasTouch: true,
            },
          },
        ]
      : []),
  ],
});
