/**
 * MEH-1881 self-QA harness — the open-now chip's data gate on the real
 * /producers page. Run manually against a local `next start` (NOT part of the
 * e2e suite):
 *   node e2e/qa-meh1881-open-now-chip.mjs [baseURL] [chromiumPath]
 * REUSES: frontend/e2e/qa-meh1880-card-order-window.mjs (fixture-intercept +
 * DOM-count probe + element-framed screenshot).
 *
 * ── WHAT THIS HARNESS CAN AND CANNOT SHOW (measured, not assumed) ──────────
 * /producers is SSR-fed: `initialItems` comes from a SERVER fetch, and the gate
 * counts from that list. Playwright's `page.route` only intercepts requests the
 * BROWSER makes, so a fixture injected here never reaches the data the gate
 * reads. The first version of this file asserted an "above-gate -> chip appears"
 * state and reported FAIL for exactly that reason: the component was fine and
 * the fixture simply never arrived.
 *
 * Rather than leave a red harness, or weaken the assertion until it passes,
 * that state is removed. The gate ARITHMETIC is proven where the data IS
 * reachable - __tests__/ProducersClientOpenNowChip.test.jsx drives the real
 * OPEN_NOW_CHIP_MIN against controlled initialItems and reds under three
 * separate breaks. This harness covers the two states it can drive honestly.
 *
 * Every shot prints DOM counts, because one of the two states is an assertion
 * about ABSENCE and a screenshot cannot prove one.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3103";
const OUT = new URL("../../qa-artifacts/MEH-1881", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jerusalem",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).formatToParts(new Date());
const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
const day = DAYS[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].findIndex((d) =>
  get("weekday").startsWith(d)
)];
const mins = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
const hhmm = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const OPEN_NOW = {
  [day]: [{ open: hhmm(Math.max(0, mins - 60)), close: hhmm(Math.min(mins + 120, 1439)) }],
};

const producer = (i, window) => ({
  id: `p${i}`,
  name: `עסק ${i}`,
  slug: null,
  status: "approved",
  city: "זכרון יעקב",
  short_description: "תיאור קצר",
  categories: [],
  images: [],
  products: [],
  locations: [],
  delivery_areas: [],
  order_window: window,
  opening_hours: null,
  avg_rating: 4.6,
  reviews_count: 11,
  has_physical_location: true,
  offers_delivery: true,
});

// 4 declared windows = one below the threshold of 5; 6 = above it.
const BELOW = [...Array(4)].map((_, i) => producer(i, OPEN_NOW))
  .concat([...Array(6)].map((_, i) => producer(100 + i, null)));
const ABOVE = [...Array(6)].map((_, i) => producer(i, OPEN_NOW));

const STATES = [
  // Default page: the catalog this environment serves has no declared windows,
  // so the gate is closed and the chip must be absent.
  { name: "gate-closed", path: "/producers", rows: BELOW, min: 0, max: 0 },
  // Deep link: the chip must appear even with the gate closed, or the visitor
  // can see the filter's effect and cannot switch it off. A RANGE, not an
  // equality — the label also appears in the applied-filter summary above the
  // grid, and both occurrences are correct.
  { name: "deep-link", path: "/producers?open_for_orders_now=1", rows: ABOVE, min: 1, max: 2 },
];

const browser = await chromium.launch({
  executablePath: process.argv[3] || "/opt/pw-browsers/chromium",
});
let failures = 0;

for (const state of STATES) {
  for (const [label, viewport] of [
    ["375", { width: 375, height: 812 }],
    ["1440", { width: 1440, height: 900 }],
  ]) {
    const ctx = await browser.newContext({ viewport, locale: "he" });
    const page = await ctx.newPage();
    await page.route("**/api/**", (route) => {
      const u = new URL(route.request().url());
      if (/\/producers(?:\?[^#]*)?$/.test(u.pathname + u.search)) {
        return route.fulfill({ json: state.rows, headers: { "x-total-count": String(state.rows.length) } });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto(`${BASE}${state.path}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "קבלו הכל" }).click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);

    const chipCount = await page.getByRole("button", { name: /פתוח להזמנות עכשיו/ }).count();
    const chipRow = await page.locator('[data-testid="chip-row"], nav, [role="list"]').count();
    const urlParam = new URL(page.url()).searchParams.get("open_for_orders_now");

    // The chip-row count is the guard against a false pass: if the page failed
    // to render at all, chipCount would be 0 and both absence states would
    // report PASS for the wrong reason.
    const ok = chipCount >= state.min && chipCount <= state.max && chipRow >= 1;
    if (!ok) failures += 1;
    console.log(
      `${(state.name + "@" + label).padEnd(20)} | chip=${chipCount} (expected ${state.min}..${state.max}) ` +
        `rowsOnPage=${chipRow} urlParam=${urlParam} ${ok ? "PASS" : "FAIL"}`
    );

    await page.screenshot({ path: `${OUT}/${state.name}-${label}.png`, fullPage: false });
    await ctx.close();
  }
}

await browser.close();
console.log(`\nIsrael now: ${day} ${hhmm(mins)} · OPEN_NOW ${JSON.stringify(OPEN_NOW)}`);
console.log(failures ? `\n${failures} state(s) FAILED` : "\nall states PASS");
process.exit(failures ? 1 : 0);
