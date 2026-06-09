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
 * Browser: the sandbox blocks Playwright's CDN, so we point `executablePath`
 * at the pre-provisioned Chromium under /opt/pw-browsers (overridable via
 * AUDIT_CHROME_PATH). Findings + screenshots are emitted by the spec into
 * ../docs/audits/screenshots/MEH-233/ and ../docs/audits/MEH-233-findings.json.
 */
import { defineConfig } from "@playwright/test";

const CHROME =
  process.env.AUDIT_CHROME_PATH ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

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
