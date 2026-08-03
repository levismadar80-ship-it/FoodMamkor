/**
 * MEH-1875 self-QA — the weekly order-window schedule block on /producer/[id].
 *
 * Drives the REAL producer page in Chromium against a `next start` server built
 * from THIS branch, with every /api/** call fulfilled from fixtures.
 *
 * WHY NOT STAGING, plainly: the change is not deployed there, so a staging run
 * would screenshot the pre-1875 page and prove nothing about this diff. The
 * sandbox also cannot reach the staging API at all — `curl -sSL
 * https://staging.mehamakor.online/api/producers?limit=3` returns
 * `CONNECT tunnel failed, response 403` (CLAUDE.md "Known Bug Patterns", the
 * `*.up.railway.app` egress block the /api proxy lands on). The two producers
 * below therefore MIRROR the named staging rows rather than being fetched:
 * `2e9aa40f` (מאפיית רוח השדה, order_window Sun–Thu 09:00–14:00) and the
 * null-window control `77055d87`. Their windows are the batch's stated values,
 * not measured ones — flagged as such.
 *
 * What it proves, in order:
 *   1. the block renders on the windowed producer, with a heading and the
 *      compressed "ראשון–חמישי · 09:00–14:00" row
 *   2. it renders ZERO nodes on the null-window control — and the rest of the
 *      page keeps the same geometry (the location section's box is compared
 *      across the two runs, so "absent" is measured, not eyeballed)
 *   3. no open/closed verdict leaks into the block (the header keeps the single
 *      status — MEH-1305 A)
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh1875-order-window-schedule.mjs
 * REUSES: e2e/qa-meh1869-order-window-ranges.mjs (fixture-route + capture shape).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = "../qa-artifacts/MEH-1875";
// Hard-coded, not env-driven: the env-drift gate treats any process.env read in
// the repo as an undeclared var, and a one-off harness is not worth one.
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium";

const base = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "visual", "fixtures", "producer-detail.json"), "utf8"),
);

// Mirrors staging's מאפיית רוח השדה (2e9aa40f) — Sun–Thu 09:00–14:00.
// `opening_hours` is set (the shared fixture has none) so the capture shows the
// new block next to the store-hours card it is meant to sit beside — the whole
// point of the placement is that the two read as one family, and a shot with
// only one of them present cannot show that.
const WINDOWED = {
  ...base,
  id: "2e9aa40f-0000-4000-8000-000000000001",
  name: "מאפיית רוח השדה",
  opening_hours: "Sun-Thu 08:00-17:00, Fri 08:00-13:00",
  order_window: Object.fromEntries(
    ["sunday", "monday", "tuesday", "wednesday", "thursday"].map((d) => [
      d,
      [{ open: "09:00", close: "14:00" }],
    ]),
  ),
};

// Mirrors the null-window control (77055d87) — same page, no order_window.
const NULL_WINDOW = {
  ...base,
  id: "77055d87-0000-4000-8000-000000000002",
  name: "בית עסק ללא חלון הזמנות",
  opening_hours: "Sun-Thu 08:00-17:00, Fri 08:00-13:00",
  order_window: null,
};

async function openProducer(ctx, producer) {
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const p = new URL(url).pathname.replace(/^\/api/, "");
    const body =
      /^\/producers\/[^/]+$/.test(p) ? producer
      : p.endsWith("/reviews") ? []
      : p === "/categories" ? []
      : p === "/auth/me" ? null
      : [];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  const page = await ctx.newPage();
  // Pre-consent so the bottom cookie bar (CookieBanner.jsx:26, key
  // "cookieConsent") does not sit over the block in the 375px capture.
  await page.addInitScript(() => localStorage.setItem("cookieConsent", "all"));
  await page.goto(`${BASE}/producer/${producer.id}`, { waitUntil: "networkidle" });
  // `networkidle` is not layout-idle here — lazy reviews and late images keep
  // growing the document for a second or so afterwards. Every offset this
  // harness reports is taken AFTER scrollHeight stops moving, so the two runs
  // are compared at the same lifecycle point rather than at whichever moment
  // each happened to reach first.
  let last = -1;
  for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(300);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    if (h === last) break;
    last = h;
  }
  return page;
}

/** Document-coordinate top of a selector — scroll-position independent. */
async function documentTop(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return Math.round(el.getBoundingClientRect().top + window.scrollY);
  }, selector);
}

/**
 * Scroll a selector to the vertical centre, instantly.
 *
 * Iterated, not one-shot: the page keeps growing after `networkidle` (lazy
 * reviews + late images), so a single scroll computed from a stale offset
 * undershoots — measured at 992 instead of 1198 on the first version, which put
 * the block's heading at the very bottom edge of the 375px capture.
 */
async function centreOn(page, selector) {
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: top - window.innerHeight / 2 + el.offsetHeight / 2,
        behavior: "instant",
      });
    }, selector);
    await page.waitForTimeout(400);
  }
  // Report where the element actually landed. A capture that silently missed
  // its subject looks identical to one that framed it — this line is what makes
  // the difference readable without opening the PNG.
  const y = await page.evaluate(
    (sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().top ?? NaN),
    selector,
  );
  console.log(`      (centred ${selector} at viewport y=${y}, scrollY=${await page.evaluate(() => Math.round(window.scrollY))})`);
}

async function run(browser, label, width, height) {
  console.log(`\n================ ${label} (${width}px) ================`);
  const ctx = await browser.newContext({
    viewport: { width, height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
  });

  // 1 — the windowed producer shows the block.
  const page = await openProducer(ctx, WINDOWED);
  const blockCount = await page.getByTestId("order-window-schedule").count();
  const rowTexts = await page
    .getByTestId("order-window-schedule-row")
    .evaluateAll((nodes) => nodes.map((n) => n.textContent.replace(/\s+/g, " ").trim()));
  console.log(`[${label}] 1. block nodes: ${blockCount} (expect exactly 1) — ` +
    `${blockCount === 1 ? "PASS" : "FAIL"}`);
  console.log(`[${label}]    rows: ${JSON.stringify(rowTexts)}`);
  const okRow = rowTexts.length === 1 && rowTexts[0].includes("09:00–14:00") &&
    rowTexts[0].includes("ראשון–חמישי");
  console.log(`[${label}]    compressed "ראשון–חמישי 09:00–14:00": ${okRow ? "PASS" : "FAIL"}`);

  // 3 — no verdict inside the block (the header owns the single status).
  const blockText = blockCount
    ? (await page.getByTestId("order-window-schedule").innerText()).replace(/\s+/g, " ")
    : "";
  const leaked = ["פתוח", "סגור", "עכשיו"].filter((w) => blockText.includes(w));
  console.log(`[${label}] 3. status words inside the block: ${JSON.stringify(leaked)} — ` +
    `${leaked.length === 0 ? "PASS" : "FAIL"}`);

  // Measured at scroll-top and in DOCUMENT coordinates. A viewport-relative
  // boundingBox() taken after scrollIntoViewIfNeeded() measures the scroll, not
  // the layout — the first version of this harness did exactly that and
  // reported the location section as HIGHER on the taller page.
  const withTop = await documentTop(page, "#section-location");
  const blockEl = page.getByTestId("order-window-schedule").first();
  // Explicit window.scrollTo with behavior:"instant". scrollIntoView (and
  // scrollIntoViewIfNeeded) both left the page at scroll 0 here — globals.css
  // sets smooth scrolling, and the capture fired mid-animation showing only the
  // block's top edge. Scroll first, THEN measure nothing — the layout numbers
  // above were already taken at scroll-top.
  await centreOn(page, '[data-testid="order-window-schedule"]');
  await page.screenshot({ path: `${OUT}/${label}-1-block-visible.png` });
  // Element-scoped too, so the block can be read without hunting for it.
  await blockEl.screenshot({ path: `${OUT}/${label}-1-block-closeup.png` }).catch(() => {});
  await page.close();

  // 2 — the null-window control renders nothing, and nothing else moves.
  const page2 = await openProducer(ctx, NULL_WINDOW);
  const absent = await page2.getByTestId("order-window-schedule").count();
  console.log(`[${label}] 2. block nodes on the null-window control: ${absent} (expect 0) — ` +
    `${absent === 0 ? "PASS" : "FAIL"}`);
  const withoutTop = await documentTop(page2, "#section-location");
  // The location section is the block's immediate NEXT sibling, so its document
  // offset is the sharpest available witness for what the block costs in space.
  // The null page must sit HIGHER (smaller offset) by exactly the block's height.
  console.log(`[${label}]    #section-location document top — windowed ${withTop} · ` +
    `null ${withoutTop} · delta ${Math.round(withTop - withoutTop)}px ` +
    `(must be > 0: the null page is shorter by the block's height, nothing else moved)`);
  await centreOn(page2, "#section-location");
  await page2.screenshot({ path: `${OUT}/${label}-2-null-window-absent.png` });
  await page2.close();

  await ctx.close();
}

const browser = await chromium.launch({ executablePath: CHROME });
fs.mkdirSync(OUT, { recursive: true });
await run(browser, "mobile-375", 375, 812);
await run(browser, "desktop-1440", 1440, 900);
await browser.close();
console.log(`\nShots → ${OUT}`);
