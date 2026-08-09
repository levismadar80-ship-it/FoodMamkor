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

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const CHROME = "/opt/pw-browsers/chromium";

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
    // The original defect was a route with no document title.
    inject: (page) => page.evaluate(() => { document.title = ""; }),
  },
  {
    route: "/he/events",
    defect: "aria-required-children (the critical that held /events out)",
    // The original defect was a role=tablist whose required role=tab children
    // are absent. Strip the roles off the children to recreate exactly that.
    inject: (page) =>
      page.evaluate(() => {
        const list = document.querySelector('[role="tablist"]');
        if (!list) return "NO_TABLIST — injection did not apply";
        list.querySelectorAll('[role="tab"]').forEach((t) => t.removeAttribute("role"));
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
