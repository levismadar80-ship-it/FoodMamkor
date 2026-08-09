/**
 * MEH-1957 premise probe — run axe against the routes the existing net
 * (e2e/flows/12-axe-a11y.spec.ts) does NOT gate, and report what is actually
 * there today. Read-only: it measures, it fixes nothing.
 *
 *   usage: node scripts/qa-meh1957-axe-probe.mjs [baseUrl]
 */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
// The CC sandbox ships Chromium at a fixed path and Playwright cannot find it;
// anywhere else, omitting executablePath lets Playwright use its own download.
// `undefined` here means "use the bundled binary", so this runs on any machine.
const CHROME = process.env.QA_CHROME_PATH
  ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

// The two routes 12-axe-a11y.spec.ts names as excluded-because-red, plus the
// gated ones as a control: if the control is also red locally, the local stack
// differs from CI and none of the numbers below transfer.
const TARGETS = [
  { route: "/he/events", label: "/events (quarantined)" },
  { route: "/he/search", label: "/search (quarantined)" },
  { route: "/he/about", label: "/about (CONTROL — gated, expect 0)" },
  { route: "/he/login", label: "/login (CONTROL — gated, expect 0)" },
];

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

const browser = await chromium.launch({ executablePath: CHROME });
const out = [];
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: "he-IL",
    });
    const page = await ctx.newPage();
    for (const t of TARGETS) {
      await page.goto(`${BASE}${t.route}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        // Same exclusion the committed net uses, so the numbers are comparable.
        .exclude(".leaflet-marker-icon")
        .analyze();
      const gated = results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      );
      out.push({
        viewport: vp.name,
        target: t.label,
        totalViolations: results.violations.length,
        criticalSerious: gated.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          help: v.help,
          sample: v.nodes[0]?.html?.slice(0, 120),
        })),
      });
    }
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
}
