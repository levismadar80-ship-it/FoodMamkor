/**
 * MEH-1880 self-QA harness — the order-window line on ProducerCard, on the
 * surface it actually ships to (the home grid), in every state the ticket
 * names. Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1880-card-order-window.mjs [baseURL] [chromiumPath]
 * REUSES: frontend/e2e/qa-meh1823-offers.mjs (fixture-intercept + DOM probe).
 *
 * ── Why the fixture windows are COMPUTED and not literal ────────────────────
 * The line is a function of wall time in Asia/Jerusalem. A hardcoded
 * `{"sunday": …}` fixture would render the line on Sundays and nothing the
 * other six days, so the harness would report a different result depending on
 * when it ran — and "no line" is indistinguishable from the bug. So each state
 * derives its window from the current Israel day + minute: OPEN_NOW brackets
 * this moment, CLOSED_NOW sits on the same day but outside it. That makes every
 * run deterministic without freezing the page's clock.
 *
 * ── Why every shot prints a DOM count ───────────────────────────────────────
 * Three of the four states assert an ABSENCE, and a screenshot cannot prove
 * one: "no line" and "the line is below the fold" look identical. The count is
 * the assertion; the PNG is for the eye pass on the state that DOES render.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3103";
const OUT = new URL("../../qa-artifacts/MEH-1880", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Israel-local {day, minutes} right now — same Intl idiom as lib/orderWindow.js:57. */
function israelNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].findIndex((d) =>
    get("weekday").startsWith(d)
  );
  return { day: DAYS[idx], minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

const hhmm = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const NOW = israelNow();

// Clamped into [00:00, 23:59] so a run just after midnight or just before it
// still produces a legal HH:MM pair with close > open.
const openStart = Math.max(0, Math.min(NOW.minutes - 60, 22 * 60));
const openEnd = Math.max(openStart + 60, Math.min(NOW.minutes + 120, 23 * 60 + 59));
const OPEN_NOW = { [NOW.day]: [{ open: hhmm(openStart), close: hhmm(openEnd) }] };

// A range on the same day that this moment is NOT inside. Placed before `now`
// when there is room before it, otherwise after — the discriminating state has
// to exist at every hour of the day, not just the convenient ones.
const CLOSED_NOW =
  NOW.minutes >= 3 * 60
    ? { [NOW.day]: [{ open: "00:00", close: hhmm(Math.max(60, NOW.minutes - 60)) }] }
    : { [NOW.day]: [{ open: hhmm(NOW.minutes + 120), close: "23:59" }] };

const base = {
  id: "p1",
  name: "מאפיית רוח השדה",
  slug: null,
  status: "approved",
  city: "זכרון יעקב",
  short_description: "לחם מחמצת ומאפים",
  categories: [],
  images: [],
  products: [],
  locations: [],
  delivery_areas: [],
  order_window: null,
  opening_hours: null,
  avg_rating: 4.8,
  reviews_count: 23,
  has_physical_location: true,
  offers_delivery: true,
};

const STATES = [
  {
    name: "open-now",
    expect: 1,
    producer: { ...base, order_window: OPEN_NOW },
    why: "window brackets this minute → the line renders with the real cutoff",
  },
  {
    name: "closed-now",
    expect: 0,
    producer: { ...base, order_window: CLOSED_NOW },
    why: "window exists but this minute is outside it — the discriminating state",
  },
  {
    name: "no-window",
    expect: 0,
    producer: { ...base, order_window: null },
    why: "feature unused → card must be byte-identical to before this ticket",
  },
  {
    name: "vacation",
    expect: 0,
    producer: { ...base, order_window: OPEN_NOW, availability_state: "on_vacation" },
    why: "vacation outranks an open window — never advertise ordering while away",
  },
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
      const url = new URL(route.request().url());
      if (/\/producers(?:\?[^#]*)?$/.test(url.pathname + url.search)) {
        return route.fulfill({ json: [state.producer] });
      }
      if (/\/producers\/[^/]+$/.test(url.pathname)) {
        return route.fulfill({ json: state.producer });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "קבלו הכל" }).click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);

    const line = page.locator('[data-testid="card-order-window"]');
    const count = await line.count();
    const text = count ? (await line.first().innerText()).replace(/\n/g, " ") : "(none)";
    const cards = await page.locator('[data-testid="producer-card"]').count();

    // The card count is part of the assertion, not decoration: if the grid
    // rendered zero cards the line count would be 0 too, and every ABSENCE
    // state would report a false pass. This is the guard-consults-its-own-
    // subject trap from .claude/rules/testing.md, and the fix is to gate on
    // something the feature cannot move.
    const ok = count === state.expect && cards >= 1;
    if (!ok) failures += 1;
    console.log(
      `${(state.name + "@" + label).padEnd(20)} | cards=${cards} line=${count} ` +
        `(expected ${state.expect}) ${ok ? "PASS" : "FAIL"} | ${text}`
    );

    // ELEMENT shot, not a viewport shot. The first version captured the
    // viewport and every PNG came back showing the top of the home page — the
    // card sits well below the fold at both widths, so the one state whose
    // image is worth an eye pass (open-now) rendered as empty background. The
    // DOM counts were right and the pictures showed nothing, which is the
    // shape of evidence that gets waved through. Framing the card makes the
    // four states directly comparable and makes "identical when the line is
    // absent" something a reviewer can actually check.
    const card = page.locator('[data-testid="producer-card"]').first();
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await card
      .screenshot({ path: `${OUT}/${state.name}-${label}.png` })
      .catch(() => page.screenshot({ path: `${OUT}/${state.name}-${label}.png` }));
    await ctx.close();
  }
}

await browser.close();

console.log(`\nIsrael now: ${NOW.day} ${hhmm(NOW.minutes)}`);
console.log(`OPEN_NOW   ${JSON.stringify(OPEN_NOW)}`);
console.log(`CLOSED_NOW ${JSON.stringify(CLOSED_NOW)}`);
console.log(failures ? `\n${failures} state(s) FAILED` : "\nall states PASS");
process.exit(failures ? 1 : 0);
