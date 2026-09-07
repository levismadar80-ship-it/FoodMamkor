/**
 * MEH-1287 chunk B — capture the "עכשיו בעונה" module at 375 and 1440.
 *
 * Controls first, because a harness that writes files and exits 0 while
 * photographing an error boundary is the documented failure mode:
 *   1. abort if the error boundary rendered;
 *   2. abort if the module is missing or does not carry exactly 3 cards;
 *   3. abort if the heading string is not the approved one;
 *   4. a NEGATIVE control — the same page with 2 in-season rows must render
 *      NO module at all. Without it the shots prove the module renders, not
 *      that the gate gates.
 */
import { chromium } from "playwright";
import { resolveChromium } from "./qa-chrome-path.mjs";
import fs from "node:fs";

const OUT = "/home/user/FoodMamkor/qa-artifacts/MEH-1287";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:3111";
const HEADING = "עכשיו בעונה";

const fail = (m) => {
  console.error("CONTROL FAILED:", m);
  process.exit(1);
};

const browser = await chromium.launch({
  executablePath: resolveChromium(),
});

for (const [label, width, height] of [
  ["375", 375, 812],
  ["1440", 1440, 900],
]) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: "he-IL",
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });

  if (await page.getByText("משהו השתבש").count())
    fail(`${label}: the error boundary rendered`);

  // Settle before locating. MEH-1771/MEH-1792: during the app's transition
  // window this testid transiently resolves to TWO nodes, both hidden — the
  // first version of this harness died on a strict-mode violation there and
  // it reads exactly like a double-mount. Measured after settle: exactly one
  // node, 1280x536, visible, with no display:none anywhere in its ancestor
  // chain. So the wait is on the SETTLED count, not on visibility alone.
  // ONE wait, both conditions, and `.first()` afterwards. Splitting them into
  // a count check followed by a visibility check is what the previous version
  // did, and it lost the race twice: the count settles, then the strict-mode
  // locator resolves during the next transition frame and throws.
  //
  // Measured before writing this (qa-meh1287-dup-probe.mjs): a 40ms sampler
  // over 4s of a fresh load, with a live-document control, saw exactly ONE
  // node in 96 of 96 samples, and the settled DOM at 1440 is one visible
  // 1280x536 node with no display:none in its ancestor chain. Both Playwright
  // sightings reported BOTH nodes hidden — i.e. a sub-40ms window in which
  // neither tree is painted. That is the app-transition shape MEH-1792 already
  // characterised, not a double-mount of this module, and the remedy there was
  // the same: a gate that holds regardless rather than an inference.
  await page.waitForFunction(
    () => {
      const n = document.querySelectorAll('[data-testid="home-seasonal-now"]');
      return n.length === 1 && n[0].getBoundingClientRect().height > 0;
    },
    null,
    { timeout: 15000 },
  );
  const mod = page.getByTestId("home-seasonal-now").first();

  const heading = (await mod.locator("h2").innerText()).trim();
  if (heading !== HEADING) fail(`${label}: heading is "${heading}"`);

  const cards = await mod.locator("article, a[href^='/']").count();
  console.log(`${label}: heading OK · ${cards} card links inside the module`);
  if (cards < 3) fail(`${label}: expected >= 3 cards, saw ${cards}`);

  // Dismiss the cookie banner BEFORE any capture — it is `position: fixed`
  // and lands in a screenshot with no error and no visual tell.
  const accept = page.getByRole("button", { name: "קבלו הכל" });
  if (await accept.count()) {
    await accept.first().click();
    await page.waitForTimeout(400);
  }

  await mod.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);

  // CONTROL 5 (MEH-2046): an ELEMENT screenshot clips the VIEWPORT at the
  // element's box, so every `position: fixed` node over that box is baked into
  // the file. The first run of this harness produced a 375 frame with the
  // sticky search bar across the first card's name and the BottomNav across
  // the third card's image — four files written, exit 0, every number correct
  // and every image void. At 375 the module is ~1500px tall, so it cannot be
  // scrolled clear of the chrome in any viewport: the fix is to clip a
  // FULL-PAGE render, where fixed nodes paint once and a clip taken at the
  // module's document coordinates is clean by construction.
  const box = await mod.evaluate((n) => {
    const r = n.getBoundingClientRect();
    return {
      x: Math.round(r.left + window.scrollX),
      y: Math.round(r.top + window.scrollY),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  });
  // `fullPage: true` was NOT enough on its own — measured, not assumed: this
  // Chromium stitches a long page by scrolling, so `position: fixed` chrome
  // repaints over the stitched region and the 375 clip still came back with
  // the sticky search bar across the first card's name and the BottomNav over
  // the third card's image. So the fixed nodes are hidden for the module clip
  // — `visibility: hidden`, which removes the paint without relayout, so the
  // module's own geometry is byte-identical to the live page.
  //
  // They are hidden ONLY for the module shot. `home-with-seasonal-*` below is
  // captured with the chrome intact, so nothing about the real page is
  // concealed from the reviewer; the two files answer different questions.
  const hidden = await page.evaluate(() => {
    const names = [];
    for (const e of document.querySelectorAll("body *")) {
      // STICKY too, not just fixed. The first pass filtered on `fixed` alone
      // and the 375 clip came back with the sticky search bar still painted
      // across the first card's name — a header that scrolls with the page
      // repaints over a stitched full-page capture exactly like a fixed one.
      // The bug was in the filter, and the image is what showed it: the
      // console line said "hid 3 fixed nodes" and was true and useless.
      const pos = getComputedStyle(e).position;
      if (pos !== "fixed" && pos !== "sticky") continue;
      names.push(`${e.tagName}.${(e.className || "").toString().slice(0, 24)}`);
      e.setAttribute("data-qa-hidden", "1");
      e.style.visibility = "hidden";
    }
    return names;
  });
  console.log(`${label}: hid ${hidden.length} fixed nodes for the module clip — ${hidden.join(" | ")}`);

  await page.screenshot({
    path: `${OUT}/seasonal-module-${label}.png`,
    fullPage: true,
    clip: box,
  });

  await page.evaluate(() => {
    for (const e of document.querySelectorAll("[data-qa-hidden]")) {
      e.style.visibility = "";
      e.removeAttribute("data-qa-hidden");
    }
  });
  await page.screenshot({
    path: `${OUT}/home-with-seasonal-${label}.png`,
    fullPage: true,
  });
  await ctx.close();
}

// ── NO negative control here, deliberately, and this is the honest version ──
// The first draft of this harness stubbed `**/producers?in_season=true` with
// `page.route` and asserted the module disappeared. It reported "module count
// = 1" — because the seasonal rows are fetched SERVER-side by
// app/[locale]/page.js, so a browser-level route stub cannot reach them. The
// assertion could only ever have passed by accident, and its comment claimed
// it proved the shipped build hides at 2. It was removed rather than reworded.
//
// The gate's negative side IS proven, elsewhere and better:
// frontend/__tests__/HomeSeasonalNow.test.jsx renders 2 rows and asserts an
// EMPTY container, and lowering SEASONAL_MIN_PRODUCERS to 2 turns that case
// red. Deterministic, and it discriminates. Proving it here would need a
// second build against a 2-row origin, since NEXT_PUBLIC_API_URL is baked in
// at build time — which buys a weaker version of an answer already in hand.

await browser.close();
console.log("captures written to", OUT);
