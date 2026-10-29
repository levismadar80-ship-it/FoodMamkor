/**
 * MEH-2537 — home filter row is ONE row. Run against a local `next start -p 3311`
 * fed by `node qa-meh2173-mockapi.mjs --port=<api port baked into the build>`.
 *
 * Asserts per viewport: «סינון» is the inline-start item (rightmost in RTL),
 * every row item shares one top (one line), the page does not scroll sideways,
 * and the day panel opens BELOW the row. Writes PNGs to qa-artifacts/MEH-2537/.
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3311";
const OUT = "../qa-artifacts/MEH-2537";
const VIEWPORTS = [
  { name: "320", width: 320, height: 700, isMobile: true },
  { name: "375", width: 375, height: 812, isMobile: true },
  { name: "440", width: 440, height: 956, isMobile: true },
  { name: "1440", width: 1440, height: 900, isMobile: false },
];

// --chromium=<path> overrides; the default is the CC sandbox's preinstalled
// binary (the repo's pinned Playwright build is not downloadable there).
// `--chromium=` with no value launches Playwright's own bundled browser.
const chromiumFlag = process.argv.slice(2).find((a) => a.startsWith("--chromium="));
const executablePath = chromiumFlag ? chromiumFlag.slice(11) || undefined : "/opt/pw-browsers/chromium";
const browser = await chromium.launch({ executablePath });
const fails = [];
const measure = (page) =>
  page.evaluate(() => {
    const row = document.querySelector('[data-testid="home-filter-row"]');
    const items = [...row.children].map((el) => el.getBoundingClientRect());
    const btn = document.querySelector('[data-testid="home-filters-button"]').getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    return {
      tops: items.map((r) => Math.round(r.top)),
      // the first row item holds «סינון» and is the rightmost (inline-start in RTL)
      buttonIsRightmost:
        row.children[0].contains(document.querySelector('[data-testid="home-filters-button"]')) &&
        Math.round(items[0].right) >= Math.max(...items.map((r) => Math.round(r.right))),
      buttonOnScreen: btn.left >= 0 && btn.right <= window.innerWidth,
      // at rest the rail is unscrolled, so no chip is tucked under «סינון»
      restClear: row.scrollLeft === 0 && items.slice(1).every((r) => r.right <= items[0].left + 1),
      rowScrolls: row.scrollWidth > row.clientWidth + 1,
      pageScrolls: document.documentElement.scrollWidth > window.innerWidth + 1,
      rowBottom: rr.bottom,
    };
  });

try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
      deviceScaleFactor: 2,
      locale: "he-IL",
    });
    await ctx.addInitScript(() => {
      try { localStorage.setItem("cookieConsent", "all"); } catch {}
    });
    const page = await ctx.newPage();
    const CITY = "/?city=%D7%97%D7%99%D7%A4%D7%94";
    const MANY_DAYS = CITY + ["שני", "רביעי", "שישי"].map((d) => `&day=${encodeURIComponent(d)}`).join("");
    for (const [state, url] of [["idle", "/"], ["city", CITY], ["many-days", MANY_DAYS]]) {
      await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
      await page.locator("#producers-grid .grid.grid-cols-2 > *").first().waitFor({ timeout: 20_000 });
      await page.evaluate(() => window.scrollTo(0, document.querySelector("[data-testid=home-filter-row]").getBoundingClientRect().top + window.scrollY - 120));
      await page.waitForTimeout(400);
      const m = await measure(page);
      const oneLine = new Set(m.tops).size === 1;
      console.log(vp.name, state, JSON.stringify(m), "oneLine=" + oneLine);
      if (!oneLine) fails.push(`${vp.name} ${state}: items on ${new Set(m.tops).size} lines`);
      if (!m.buttonIsRightmost) fails.push(`${vp.name} ${state}: «סינון» not first`);
      if (m.pageScrolls) fails.push(`${vp.name} ${state}: page scrolls sideways`);
      if (!m.restClear) fails.push(`${vp.name} ${state}: rail not at rest / a chip under «סינון»`);
      await page.screenshot({ path: `${OUT}/${vp.name}-${state}.png` });
      if (state === "city") {
        await page.getByTestId("delivery-day-chip").click();
        const panel = page.getByTestId("delivery-day-panel");
        await panel.waitFor();
        const pb = await panel.boundingBox();
        if (pb.y < m.rowBottom - 1) fails.push(`${vp.name}: day panel not below the row`);
        await page.getByTestId("delivery-day-pill-שישי").click();
        await page.waitForTimeout(400);
        if (!(await panel.isVisible())) fails.push(`${vp.name}: panel closed after picking a day`);
        await page.screenshot({ path: `${OUT}/${vp.name}-day-panel-open.png` });
        if (vp.isMobile) {
          // rail scrolled to its end: «סינון» must still be visible (sticky)
          await page.keyboard.press("Escape");
          await page.evaluate(() => {
            const r = document.querySelector('[data-testid="home-filter-row"]');
            r.scrollLeft = -r.scrollWidth;
          });
          await page.waitForTimeout(200);
          const vis = await page.evaluate(() => {
            const b = document.querySelector('[data-testid="home-filters-button"]').getBoundingClientRect();
            return b.left >= 0 && b.right <= window.innerWidth;
          });
          if (!vis) fails.push(`${vp.name}: «סינון» scrolled out of view`);
          // keyboard: focusing «מאומת» from the scrolled rail must not leave it
          // under the sticky «סינון» (WCAG 2.4.11)
          const obscured = await page.evaluate(() => {
            const chip = document.querySelector('[data-testid="home-promoted-chip-verified"]');
            chip.focus();
            const c = chip.getBoundingClientRect();
            const w = document.querySelector('[data-testid="home-filter-row"]').children[0].getBoundingClientRect();
            return c.right > w.left + 1;
          });
          if (obscured) fails.push(`${vp.name}: focused «מאומת» sits under «סינון»`);
          await page.screenshot({ path: `${OUT}/${vp.name}-rail-scrolled.png` });
        }
      }
    }
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.locator("#producers-grid .grid.grid-cols-2 > *").first().waitFor({ timeout: 20_000 });
    await page.evaluate(() => window.scrollTo(0, document.querySelector("[data-testid=home-filter-row]").getBoundingClientRect().top + window.scrollY - 120));
    await page.getByTestId("home-filters-button").click();
    await page.waitForTimeout(500);
    const sb = await page.locator("#filter-sheet-panel").boundingBox();
    if (!sb || sb.x < 0 || sb.x + sb.width > vp.width + 1) fails.push(`${vp.name}: filter sheet off screen ${JSON.stringify(sb)}`);
    await page.screenshot({ path: `${OUT}/${vp.name}-sheet-open.png` });
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(fails.length ? "FAIL\n" + fails.join("\n") : "PASS");
process.exit(fails.length ? 1 : 0);
