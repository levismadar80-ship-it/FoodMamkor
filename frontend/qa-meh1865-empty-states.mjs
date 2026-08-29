/**
 * MEH-1865 QA harness — captures the two zero states of /events at 375 + 1440.
 *
 * Control first (testing.md § "a probe whose null output is also its reassuring
 * output"): every navigation asserts that the /events route interception ACTUALLY
 * fired and that the expected state marker is on the page. A harness that photographs
 * an error boundary logs six successes and exits 0 — that happened on #2786. If the
 * control is silent here, every image in the run is void and the script says so.
 */
import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3210";
const OUT = "qa-artifacts/meh-1865";
const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

const ROW = (id) => ({
  id,
  title: `אירוע ${id}`,
  event_date: "2026-09-1" + id,
  event_time: "10:00",
  city: "חיפה",
  category: "קטיף",
  price: 0,
  producer_name: "בית עסק לדוגמה",
  description: "",
});

let failures = 0;
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

const STATES = [
  {
    slug: "empty-dataset",
    path: "/he/events",
    // nothing exists for this tab
    reply: () => [],
    expect: "events-empty-dataset",
    absent: "events-no-results",
  },
  {
    slug: "filtered-to-zero",
    path: "/he/events?city=" + encodeURIComponent("חיפה"),
    // rows exist for the tab; the city filter matches none of them
    reply: (url) => (url.searchParams.get("city") ? [] : [ROW(1), ROW(2)]),
    expect: "events-no-results",
    absent: "events-empty-dataset",
  },
];

// The sandbox ships Chromium r1194 while this repo's playwright pin wants r1234,
// so point launch() at the preinstalled binary rather than downloading one.
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

for (const vp of VIEWPORTS) {
  for (const st of STATES) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    let intercepted = 0;
    await page.route("**/api/events**", async (route) => {
      intercepted++;
      const url = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(st.reply(url)),
      });
    });

    const label = `${st.slug}@${vp.name}`;
    await page.goto(`${BASE}${st.path}`, { waitUntil: "domcontentloaded" });

    // ── control ───────────────────────────────────────────────────────────
    try {
      await page.waitForSelector(`[data-testid="${st.expect}"]`, { timeout: 15000 });
      ok(`${label}: "${st.expect}" rendered`);
    } catch {
      fail(`${label}: "${st.expect}" NEVER rendered — this image is void`);
    }
    if (intercepted === 0) fail(`${label}: /api/events was never intercepted — the page did not fetch, so this image shows an unknown state`);
    else ok(`${label}: intercepted ${intercepted} /api/events call(s)`);

    // discrimination: the other zero surface must NOT be on screen
    if (await page.locator(`[data-testid="${st.absent}"]`).count()) {
      fail(`${label}: "${st.absent}" is ALSO on screen — the two zeros are conflated`);
    } else ok(`${label}: "${st.absent}" correctly absent`);

    // the AC's countable claim: filter controls present/absent
    const filterCount =
      (await page.locator("#events-city").count()) +
      (await page.getByRole("tablist", { name: "מצב תצוגה" }).count()) +
      (await page.locator('[role="radiogroup"], [data-testid="chip-row"]').count());
    console.log(`  · ${label}: filter/toolbar controls on page = ${filterCount}`);

    // The cookie banner and BottomNav are position:fixed, so a fullPage capture
    // paints them over the middle of the document and hides the very block this
    // run exists to show. Dismiss the banner, then shoot the viewport with the
    // state marker scrolled into it — same discipline as parity.spec.ts:258
    // (viewport-only, not fullPage).
    const accept = page.getByRole("button", { name: "קבלו הכל" });
    if (await accept.count()) {
      await accept.first().click();
      await page.waitForSelector('[data-testid="cookie-banner"], text=קבלו הכל', { state: "detached", timeout: 5000 }).catch(() => {});
    }
    await page.locator(`[data-testid="${st.expect}"]`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${st.slug}-${vp.name}.png` });
    await ctx.close();
  }
}

await browser.close();

if (failures) {
  console.error(`\nCONTROL FAILED (${failures}) — every capture in this run is void.`);
  process.exit(1);
}
console.log("\nControl clean: all captures show the intended state.");
