import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["e2e/flows/**/*.spec.ts"],
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["list"]]
    : [["list"]],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.TEST_URL || "http://localhost:3000",
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    actionTimeout: 10_000,
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
    // Secret lives in GitHub Actions → Secrets as
    // VERCEL_AUTOMATION_BYPASS_SECRET and is exported to the job env as
    // VERCEL_BYPASS_SECRET. When unset (local runs), we send an empty
    // string which Vercel ignores for non-protected environments.
    //
    // MEH-306 sub-B — `x-vercel-skip-toolbar=1` removes the
    // <vercel-live-feedback> widget from preview pages so its overlay
    // doesn't intercept pointer events during tests (per
    // https://vercel.com/docs/vercel-toolbar/managing-toolbar).
    extraHTTPHeaders: {
      "x-vercel-protection-bypass": process.env.VERCEL_BYPASS_SECRET || "",
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
        // Chromium only — no webkit binary in sandbox or CI
        browserName: "chromium",
      },
    },
  ],
});
