/**
 * MEH-997 — LOCAL-ONLY Playwright config for the CC sandbox.
 *
 * The sandbox pre-installs Chromium at /opt/pw-browsers/chromium (a
 * pinned build older than the one @playwright/test wants to download;
 * downloads are disabled via PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD). This
 * wrapper reuses the real config and only pins executablePath.
 *
 * Usage:
 *   npx playwright test --config=playwright.local.config.ts ...
 *
 * CI and real runs keep using playwright.config.ts untouched.
 */
import baseConfig from "./playwright.config";

const CHROMIUM = "/opt/pw-browsers/chromium";

export default {
  ...baseConfig,
  projects: (baseConfig.projects || []).map((p) => ({
    ...p,
    use: {
      ...p.use,
      launchOptions: {
        ...(p.use as { launchOptions?: object })?.launchOptions,
        executablePath: CHROMIUM,
      },
    },
  })),
};
