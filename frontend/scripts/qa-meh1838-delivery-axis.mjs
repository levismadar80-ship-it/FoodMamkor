/**
 * Module:   qa-meh1838-delivery-axis
 * Purpose:  Self-QA captures for the MEH-1838 chunk B delivery-axis block on
 *           producer registration — all four shapes, at 375 px and 1440 px.
 * Touches:  Nothing real. /categories is answered from the fixture below; no
 *           registration is submitted, no backend, no database.
 * Does NOT: prove the payload reaches the endpoint. That is asserted from the
 *           POST body in __tests__/RegisterDeliveryAxis.test.jsx, which is the
 *           evidence that matters here — this script is LAYOUT evidence only,
 *           and Chromium emulation is not engine evidence (MEH-1511 carve-out e).
 * Related:  app/[locale]/register/producer/RegisterProducerClient.jsx;
 *           components/admin/ProducerForm.jsx:811-880 (the idiom mirrored).
 * History:  MEH-1838 chunk B.
 *
 * Usage:  node scripts/qa-meh1838-delivery-axis.mjs   (needs `next start -p 3100`)
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3100";
const OUT = "qa-artifacts/MEH-1838";
const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

mkdirSync(OUT, { recursive: true });

async function stub(page) {
  // Scoped to requests that LEAVE the origin. A `**/categories**` glob also
  // matches Next's own chunk URLs when a chunk name happens to contain the
  // word, which answers JavaScript with JSON and stops the page hydrating —
  // measured: the preflight button never became clickable under the broad glob,
  // while a diagnostic run with no routes at all found it immediately.
  await page.route(
    (url) => url.origin !== BASE && /\/categories/.test(url.pathname),
    (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: 1, name: "ביצים" }]),
      }),
  );
}

/** Walk ACCOUNT → DETAILS. Returns once the axis block is on screen. */
async function toDetails(page) {
  await page.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
  // Gate on the control itself, never on global network quiet — `networkidle`
  // is banned in this repo (testing.md, MEH-215) and would not help here anyway.
  const start = page.getByTestId("register-preflight-start");
  await start.waitFor({ state: "visible", timeout: 20_000 });
  await start.click();
  await page.getByPlaceholder("לדוגמה: רותי לוי").fill("רותי לוי");
  await page.getByPlaceholder("name@example.com").fill("t@example.com");
  await page.getByPlaceholder("לפחות 12 תווים").fill("Abcdefgh1234");
  await page.getByTestId("register-details-next").isVisible().catch(() => {});
  // ACCOUNT's next button shares the label; click the visible one.
  await page.getByRole("button", { name: "הבא" }).first().click();
  await page.getByTestId("register-delivery-axis").waitFor({ state: "visible", timeout: 15_000 });
}

const shots = [];
async function shot(page, vp, name) {
  const file = `${OUT}/${name}-${vp.name}.png`;
  await page.getByTestId("register-delivery-axis").scrollIntoViewIfNeeded();
  await page.screenshot({ path: file, fullPage: false });
  shots.push(file);
  console.log("  captured", file);
}

// The sandbox ships a pinned Chromium that does not match this @playwright/test
// build's expected revision, and `playwright install` is not available here.
// Point at the pre-installed binary rather than downloading (env guidance).
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
let failures = 0;

for (const vp of VIEWPORTS) {
  console.log(`\n=== viewport ${vp.name} ===`);
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "he-IL",
  });
  const page = await ctx.newPage();
  await stub(page);

  try {
    await toDetails(page);

    // CONTROL, run first: if the block is not on screen at all, every capture
    // below is a photograph of the wrong page and the run is void.
    const axisVisible = await page.getByTestId("register-delivery-axis").isVisible();
    if (!axisVisible) throw new Error("axis block not visible — captures below are void");
    console.log("  control OK: axis block is on screen");

    // 1 — default shape: physical-only, delivery sub-block collapsed.
    await shot(page, vp, "01-physical-only");

    // 2 — neither selected: the inline error, advance blocked.
    await page.getByTestId("register-has-physical-location").uncheck();
    const errVisible = await page.getByTestId("register-delivery-axis-error").isVisible();
    if (!errVisible) { failures++; console.log("  FAIL: neither-selected error did not render"); }
    await shot(page, vp, "02-neither-selected-error");

    // 3 — delivery + nationwide.
    await page.getByTestId("register-offers-delivery").check();
    await page.getByTestId("register-delivery-nationwide").check();
    await shot(page, vp, "03-delivery-nationwide");

    // 4 — delivery + city list (nationwide off reveals CitiesAutocomplete).
    await page.getByTestId("register-delivery-nationwide").uncheck();
    await page.getByTestId("register-delivery-cities").waitFor({ state: "visible" });
    await shot(page, vp, "04-delivery-city-list");

    // Layout assertion, measured rather than eyeballed (MEH-1511).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    if (overflow) { failures++; console.log(`  FAIL: horizontal overflow at ${vp.name}`); }
    else console.log(`  no horizontal scroll at ${vp.name}`);
  } catch (e) {
    failures++;
    console.log(`  ERROR at ${vp.name}:`, e.message);
  }
  await ctx.close();
}

await browser.close();
console.log(`\n${shots.length} screenshot(s) written, ${failures} failure(s)`);
process.exit(failures > 0 || shots.length === 0 ? 1 : 0);
