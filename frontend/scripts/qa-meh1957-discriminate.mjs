/**
 * MEH-1957 — red-by-construction proof for the two routes graduating into the
 * axe gate. A guard that has never been observed failing is a green light of
 * unknown wiring (.claude/rules/testing.md), and "the route scans clean today"
 * does NOT establish that the gate would catch the defect coming back.
 *
 * For each route this injects the EXACT defect that held it out of the gate,
 * scans, then removes the injection and scans again. Expected: red then green.
 *
 *   usage: node scripts/qa-meh1957-discriminate.mjs [baseUrl]
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

const scan = async (page) => {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude(".leaflet-marker-icon")
    .analyze();
  return r.violations
    .filter((v) => ["critical", "serious"].includes(v.impact ?? ""))
    .map((v) => `${v.impact}:${v.id}(${v.nodes.length})`);
};

const CASES = [
  {
    route: "/he/search",
    defect: "document-title (the serious that held /search out)",
    // The original defect was a route with no document title. Returns "ok"
    // only after confirming the title is actually gone — the guard below
    // treats anything else as "this script is stale", not as a gate verdict.
    inject: (page) =>
      page.evaluate(() => {
        if (!document.title) return "TITLE ALREADY EMPTY — nothing to inject";
        document.title = "";
        return document.title === "" ? "ok" : "TITLE WOULD NOT CLEAR";
      }),
  },
  {
    route: "/he/events",
    defect: "aria-required-children (the critical that held /events out)",
    // The original defect was a role=tablist whose required role=tab children
    // are absent. Strip the roles off the children to recreate exactly that.
    inject: (page) =>
      page.evaluate(() => {
        const list = document.querySelector('[role="tablist"]');
        if (!list) return "NO TABLIST FOUND — page restructured?";
        const tabs = list.querySelectorAll('[role="tab"]');
        if (!tabs.length) return "TABLIST HAS NO role=tab CHILDREN — nothing to strip";
        tabs.forEach((t) => t.removeAttribute("role"));
        return "ok";
      }),
  },
];

const browser = await chromium.launch({ executablePath: CHROME });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "he-IL" });
  const page = await ctx.newPage();
  for (const c of CASES) {
    await page.goto(`${BASE}${c.route}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    const clean = await scan(page);
    const applied = await c.inject(page);
    // An injection that did not apply produces a clean "broken" scan, which
    // would print as "the gate does not discriminate" — a false verdict about
    // the gate when the truth is that this script went stale (e.g. the tablist
    // was restructured). Short-circuit so the failure names itself.
    if (applied !== "ok") {
      console.log(`\n=== ${c.route} — ${c.defect}`);
      console.log(`  ⚠️  INJECTION FAILED — this script needs updating, no verdict on the gate.`);
      console.log(`      reason: ${applied}`);
      continue;
    }
    const broken = await scan(page);
    // Reload to drop the injection — the restore half of the two-run control.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const restored = await scan(page);

    console.log(`\n=== ${c.route} — ${c.defect}`);
    console.log(`  injection applied : ${applied}`);
    console.log(`  before (shipped)  : ${clean.length ? clean.join(", ") : "0 critical/serious  ✅ green"}`);
    console.log(`  with defect       : ${broken.length ? broken.join(", ") + "  ✅ RED as required" : "0  ❌ GATE DID NOT DISCRIMINATE"}`);
    console.log(`  after restore     : ${restored.length ? restored.join(", ") : "0 critical/serious  ✅ green again"}`);
  }
} finally {
  await browser.close();
}
