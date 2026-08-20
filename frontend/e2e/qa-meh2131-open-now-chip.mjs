/**
 * MEH-2131 self-QA — the "פתוחים להזמנות עכשיו" chip and its zero-result guard.
 *
 * Route-mocked against a local `next start` (MEH-1591 pattern); the CC sandbox
 * cannot reach Railway or staging (MEH-2090). Chromium only, so this is layout
 * and presence evidence — not engine evidence (workflow rule 23 carve-out (e)).
 *
 * THE SUBJECT IS A CONDITIONAL, so the run is built as a PAIR: the same page,
 * the same code, two fixtures that differ in exactly one property — whether any
 * business is inside its order window right now. A run that only photographed
 * the visible case would be satisfied by a component with no guard at all.
 *
 * Both fixtures are built RELATIVE TO THE RUN'S OWN CLOCK, in Asia/Jerusalem,
 * so the pair means the same thing whenever it executes. A fixed window would
 * have made this harness pass or fail by the hour — the exact defect it found
 * in the MEH-1881 spec.
 *
 * Run:  node e2e/qa-meh2131-open-now-chip.mjs
 * Out:  qa-artifacts/MEH-2131/*.png  (compress before committing — MEH-1156)
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
// See the note in qa-meh2130-filter-taxonomy.mjs: the pinned Playwright wants a
// Chromium build this image does not carry and the download host is blocked, so
// use the image's own binary when it is there and let Playwright resolve its
// own everywhere else. A filesystem probe, deliberately not an env var.
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium";
const LAUNCH_OPTIONS = existsSync(SANDBOX_CHROMIUM)
  ? { executablePath: SANDBOX_CHROMIUM }
  : {};
const OUT = "qa-artifacts/MEH-2131";

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Today's weekday + minute-of-day in Asia/Jerusalem — mirrors lib/orderWindow.js. */
function israelParts(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t) => p.find((x) => x.type === t)?.value;
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { idx, minutes: Number(get("hour")) % 24 * 60 + Number(get("minute")) };
}

const hhmm = (m) => {
  const c = Math.max(0, Math.min(24 * 60 - 1, m));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
};

const { idx: TODAY, minutes: NOW_MIN } = israelParts();
// A window that certainly contains "now" (±3h, clamped inside the day).
const OPEN_NOW_WINDOW = {
  [DAY_KEYS[TODAY]]: [{ open: hhmm(NOW_MIN - 180), close: hhmm(NOW_MIN + 180) }],
};
// Declared, but open on no day — `{}` is truthy so it still passes the MEH-1881
// coverage count. That is what makes the pair differ in ONE property.
const NEVER_OPEN_WINDOW = {};

const CATEGORIES = [{ id: 1, name: "ירקות ופירות", emoji: "" }];

const producers = (window) =>
  Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    name: `בית עסק ${i + 1}`,
    slug: `business-${i + 1}`,
    description: "תיאור קצר של בית העסק לצורכי בדיקה.",
    city: "תל אביב",
    categories: CATEGORIES,
    image_url: null,
    order_window: window,
    has_no_added_sugar_products: true,
    avg_rating: null,
    reviews_count: 0,
    days_since_created: 100,
  }));

async function mockApi(page, window) {
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    const json = (body) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (p.startsWith("/categories")) return json(CATEGORIES);
    if (p.startsWith("/producers/count")) return json({ count: 12 });
    if (p.startsWith("/producers")) return json(producers(window));
    if (p.startsWith("/stats")) return json({ producers_count: 12, categories_count: 1 });
    return json([]);
  });
}

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

const LABEL = "פתוחים להזמנות עכשיו";
const ran = [];
const failures = [];
function check(name, ok, detail = "") {
  ran.push(name);
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Land on the home grid and settle it. HOME is where the discriminating pair
 * runs, and that is a MEASURED decision rather than a preference:
 *
 * `/producers` takes its base list from SSR props, and `page.route()` cannot
 * intercept a fetch the Next server makes — so in this sandbox its catalog is
 * EMPTY (probed directly: 0 producer cards). With no loaded businesses the
 * MEH-1881 coverage gate hides the open-now chip on its own, which means an
 * "absent" assertion there would be green whether the zero-result guard worked
 * or not. That is exactly the green-with-two-causes trap in
 * .claude/rules/testing.md, and the first version of this harness walked into
 * it — asserting the pair on /producers and reporting a confident red.
 *
 * Home fetches its producers CLIENT-side, so the mock reaches it and the
 * catalog is real. The pair below therefore differs in exactly one property.
 * /producers keeps a screenshot for the record with no assertion attached; its
 * behaviour is proven by OpenNowChipGate.test.js and
 * ProducersClientOpenNowChip.test.jsx, which drive the real props.
 */
async function landOnHome(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const grid = page.locator("#producers-grid");
  await grid.waitFor({ state: "attached", timeout: 15_000 });
  await page.waitForTimeout(1800);
  await grid.evaluate((el) => {
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 96 });
  });
  await page.waitForTimeout(600);
  return grid.innerText();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(
    `fixtures built for ${DAY_KEYS[TODAY]} ${hhmm(NOW_MIN)} Asia/Jerusalem — ` +
      `open window ${JSON.stringify(OPEN_NOW_WINDOW)}`,
  );
  const browser = await chromium.launch(LAUNCH_OPTIONS);

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const cardCount = () =>
      page.locator("#producers-grid a[href^='/business-']").count();

    // A: businesses ARE open now -> the chip is offered.
    await mockApi(page, OPEN_NOW_WINDOW);
    let text = await landOnHome(page, `${BASE}/he`);
    // CONTROL, in two parts. A chip unrelated to this ticket must be present,
    // AND the grid must actually hold enough businesses to clear the MEH-1881
    // coverage threshold. Without the second half, "the chip is absent" in case
    // B is satisfied by an empty catalog rather than by the guard under test.
    let cards = await cardCount();
    check(
      `[${vp.name}] CONTROL: row rendered AND catalog loaded`,
      text.includes("רישוי מאומת") && cards >= 5,
      `${cards} business cards (need >= 5 for coverage)`,
    );
    check(`[${vp.name}] A - chip OFFERED when businesses are open now`, text.includes(LABEL));
    const chip = page.getByRole("button", { name: LABEL }).first();
    if (await chip.count()) {
      await chip.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: `${OUT}/home-open-${vp.name}.png` });

    // B: identical page, nothing open -> the chip is withheld. Same code, same
    // viewport, same number of businesses, same coverage. The only difference
    // is order_window, which is the guard's whole input.
    await page.unroute("**/api/**");
    await mockApi(page, NEVER_OPEN_WINDOW);
    text = await landOnHome(page, `${BASE}/he`);
    cards = await cardCount();
    check(
      `[${vp.name}] CONTROL: catalog still loaded in the closed case`,
      text.includes("רישוי מאומת") && cards >= 5,
      `${cards} business cards - coverage unchanged, so only the guard can differ`,
    );
    check(
      `[${vp.name}] B - chip WITHHELD when nothing is open (one field changed)`,
      !text.includes(LABEL),
    );
    await page.screenshot({ path: `${OUT}/home-closed-${vp.name}.png` });

    // C: a deep-linked active filter keeps its chip, still with nothing open.
    text = await landOnHome(page, `${BASE}/he?open_for_orders_now=1`);
    check(
      `[${vp.name}] C - a URL-active filter keeps its chip even with nothing open`,
      text.includes(LABEL),
    );
    await page.screenshot({ path: `${OUT}/home-deeplink-active-${vp.name}.png` });

    // D: the /producers sheet, for the record - deliberately NO assertion about
    // the open-now chip here. See landOnHome's note.
    await page.unroute("**/api/**");
    await mockApi(page, OPEN_NOW_WINDOW);
    await page.goto(`${BASE}/he/producers`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
    await page.locator('[data-testid="producers-filters-button"]').click();
    await page.waitForTimeout(700);
    check(
      `[${vp.name}] CONTROL: the /producers sheet opened`,
      (await page.locator("#filter-sheet-panel").innerText()).includes("רישוי מאומת"),
    );
    await page.screenshot({ path: `${OUT}/producers-sheet-${vp.name}.png` });

    await ctx.close();
  }

  await browser.close();
  // Derived, never stated — adding a check() moves this by itself.
  console.log(`\n${ran.length} assertions ran, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:\n  " + failures.join("\n  "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
