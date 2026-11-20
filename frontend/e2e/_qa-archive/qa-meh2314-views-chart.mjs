/**
 * MEH-2314 — insights views chart, 375 + 1440 evidence.
 *
 * Every /api/* call is answered in-page (no backend needed): an approved
 * producer with 30 days of views ending 25.10. Captures the chart and reads
 * back each x-axis label's text, anchor and rendered bounding box against the
 * SVG's own box — a label whose box leaves the SVG is the clipping bug.
 *
 * Control (run first): the y-axis tick texts must be found and measured —
 * if the probe cannot see those, every "0 clipped" below is void.
 *
 * Usage: node e2e/qa-meh2314-views-chart.mjs [outDir] [baseUrl]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const OUT = process.argv[2] || "../qa-artifacts/MEH-2314";
// REUSES: e2e/qa-meh1638-entry-skeleton.mjs:18-22 — argv override, no env read.
const BASE = process.argv[3] || "http://localhost:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium"; // the sandbox build; CI falls back to the default

mkdirSync(OUT, { recursive: true });

const w0 = { last_7d: 12, last_30d: 41, total: 88 };
const days = [];
for (let d = 26; d <= 30; d++) days.push(`2026-09-${d}`);
for (let d = 1; d <= 25; d++) days.push(`2026-10-${String(d).padStart(2, "0")}`);
const ANALYTICS = {
  profile_views: w0,
  search_appearances: w0,
  whatsapp_clicks: { last_7d: 2, last_30d: 5, total: 9 },
  contact_clicks: { last_7d: 1, last_30d: 3, total: 4 },
  follower_count: 6,
  new_followers_this_week: 1,
  average_rating: 4.8,
  total_reviews: 5,
  views_by_day: days.map((date, i) => ({ date, count: (i * 7) % 5 })),
  top_cities: [
    { city: "חיפה", count: 9 },
    { city: "תל אביב", count: 5 },
    { city: "ירושלים", count: 2 },
  ],
};
const ME = { id: 1, email: "owner@example.com", role: "producer", name: "בעלת עסק", email_verified: true };
const PRODUCER = { id: 1, status: "approved", slug: "meshek", business_name: "משק לדוגמה" };

const browser = await chromium.launch({
  ...(existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
});

let failures = 0;
for (const w of [375, 1440]) {
  const ctx = await browser.newContext({
    locale: "he-IL",
    viewport: { width: w, height: w < 500 ? 812 : 900 },
  });
  await ctx.addInitScript(() => localStorage.setItem("token", "owner-token"));
  const page = await ctx.newPage();
  await page.route("**/api/**", (r) => {
    const p = new URL(r.request().url()).pathname.replace(/^\/api/, "");
    const body =
      p === "/auth/me" ? ME : p === "/producers/me/analytics" ? ANALYTICS : p === "/producers/me" ? PRODUCER : [];
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto(`${BASE}/producer/dashboard/insights`);
  const svg = page.locator('svg[role="img"]').first();
  await svg.waitFor({ timeout: 15_000 });
  await svg.scrollIntoViewIfNeeded();

  const m = await svg.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const read = (sel) =>
      [...el.querySelectorAll(sel)].map((t) => {
        const b = t.getBoundingClientRect();
        return {
          text: t.textContent,
          anchor: t.getAttribute("text-anchor"),
          clipped: b.left < box.left - 0.5 || b.right > box.right + 0.5,
          width: Math.round(b.width),
        };
      });
    // Plot starts at viewBox x=24 (padLeft); y-ticks must end before it.
    const ctm = el.getScreenCTM();
    const plotLeft = ctm.e + 24 * ctm.a;
    const y = read('text[font-size="9"]').map((t, i) => ({
      ...t,
      inPlot: el.querySelectorAll('text[font-size="9"]')[i].getBoundingClientRect().right > plotLeft + 0.5,
    }));
    return { y, x: read('text[font-size="10"]') };
  });

  // Control first.
  if (m.y.length === 0 || m.y.some((t) => t.width === 0)) {
    console.log(`CONTROL FAIL @${w}: y-axis ticks not measured — every result below is void`);
    failures++;
  } else {
    console.log(`control ok @${w}: ${m.y.length} y-ticks measured`);
  }
  const clipped = m.x.filter((t) => t.clipped);
  console.log(`@${w} x-labels: ${JSON.stringify(m.x)}`);
  console.log(`${clipped.length === 0 ? "PASS" : "FAIL"} @${w}: ${clipped.length} x-label(s) outside the SVG box`);
  if (clipped.length) failures++;
  const inPlot = m.y.filter((t) => t.inPlot);
  console.log(`${inPlot.length === 0 ? "PASS" : "FAIL"} @${w}: ${inPlot.length} y-tick(s) drawn inside the plot`);
  if (inPlot.length) failures++;

  await page.screenshot({ path: `${OUT}/insights-chart-${w}.png`, fullPage: false });
  await svg.screenshot({ path: `${OUT}/insights-chart-only-${w}.png` });
  await ctx.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
