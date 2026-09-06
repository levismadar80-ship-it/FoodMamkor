// Is the double node mine, or does the whole homepage tree transiently mount
// twice? Poll several sections' testids, not just the new one — if they all
// double at the same instant, it is a page-level transition window and not a
// property of HomeSeasonalNow.
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: process.env.PW_CHROME });
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, locale: "he-IL" });
const p = await ctx.newPage();
const IDS = ["home-seasonal-now", "home-recently-viewed", "home-recent-rail"];
await p.addInitScript(() => {
  window.__samples = [];
  const tick = () => {
    const row = { t: Math.round(performance.now()) };
    for (const id of ["home-seasonal-now", "home-recently-viewed", "home-recent-rail"]) {
      row[id] = document.querySelectorAll(`[data-testid="${id}"]`).length;
    }
    // CONTROL: a sampler that dies silently reports all-zeros, which reads
    // exactly like "no duplication". Count ALL sections too — if this is 0 the
    // sampler is not seeing the document and every zero above is void.
    row.sections = document.querySelectorAll("section").length;
    window.__samples.push(row);
  };
  setInterval(tick, 40);
});
await p.goto("http://127.0.0.1:3111/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(4000);
const s = await p.evaluate(() => window.__samples);
const live = s.filter((r) => r.sections > 0);
console.log(`samples: ${s.length}, with a live document: ${live.length}`);
if (!live.length) { console.error("CONTROL FAILED: sampler never saw a section"); process.exit(1); }
const dup = live.filter((r) => IDS.some((k) => r[k] > 1));
console.log("samples where any tracked id > 1:", dup.length);
console.log(JSON.stringify(dup.slice(0, 6)));
console.log("first/last:", JSON.stringify(live[0]), JSON.stringify(live.at(-1)));
console.log("max section count seen:", Math.max(...live.map((r) => r.sections)));
await b.close();
