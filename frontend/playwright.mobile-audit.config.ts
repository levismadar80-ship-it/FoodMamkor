/**
 * MEH-233 — Mobile responsiveness audit (Audit 7/7). AUDIT-ONLY.
 *
 * Standalone config so the audit run is fully isolated from the e2e suite
 * (`playwright.config.ts`, testMatch `e2e/flows/**`). It defines THREE mobile
 * viewport projects and a single audit spec; it never touches the existing
 * specs or their config.
 *
 * Run (frontend production server must be up on :3000):
 *   npm run build && npm run start
 *   npx playwright test --config=playwright.mobile-audit.config.ts
 *
 * Browser: where Playwright's browser CDN is blocked (e.g. the sandbox), we
 * point `executablePath` at the pre-provisioned Chromium under /opt/pw-browsers
 * IF it exists; otherwise we leave it undefined so Playwright uses its own
 * managed browser (the normal `npx playwright install` path). Findings +
 * screenshots are emitted by the spec into ../docs/audits/screenshots/MEH-233/
 * and ../docs/audits/MEH-233-findings__<viewport>.json.
 */
import { defineConfig } from "@playwright/test";
import * as fs from "fs";

// Pre-provisioned Chromium (sandbox / CI image). Used only when present —
// no env var (keeps the .env-drift check clean), portable everywhere else.
const SANDBOX_CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CHROME = fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined;

// 3 mobile viewports per the MEH-233 spec.
const VIEWPORTS = {
  "iphone-se": { width: 375, height: 667 },
  galaxy: { width: 360, height: 640 },
  "iphone-14": { width: 390, height: 844 },
} as const;

export default defineConfig({
  testDir: "./e2e/mobile-audit",
  testMatch: ["**/mobile-audit.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.TEST_URL || "http://localhost:3000",
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
    reducedMotion: "reduce",
    ignoreHTTPSErrors: true,
    // AUDIT-ONLY: full-page evidence on every route, not just failures.
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: Object.entries(VIEWPORTS).map(([name, viewport]) => ({
    name,
    use: {
      browserName: "chromium" as const,
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      launchOptions: {
        executablePath: CHROME,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      },
    },
  })),
});
