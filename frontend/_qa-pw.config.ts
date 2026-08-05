// MEH-1599 local-verification config. Throwaway — NOT committed.
// The sandbox's preinstalled Chromium is build 1194 while @playwright/test
// 1.61.1 expects 1228, and cdn.playwright.dev is proxy-blocked, so the browser
// has to be pointed at explicitly. Everything else inherits the real config.
import base from "./playwright.config";

export default {
  ...base,
  use: {
    ...base.use,
    launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
  },
  projects: (base.projects ?? []).map((p) => ({
    ...p,
    use: { ...p.use, launchOptions: { executablePath: "/opt/pw-browsers/chromium" } },
  })),
};
