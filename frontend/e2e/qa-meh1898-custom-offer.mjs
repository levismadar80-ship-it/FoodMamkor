/**
 * MEH-1898 self-QA harness — the fifth offer type, `custom`.
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1898-custom-offer.mjs [baseURL] [chromiumPath]
 * REUSES: frontend/e2e/qa-meh1823-offers.mjs (fixture-intercept + probe shape).
 *
 * Four states, and the reason each is captured:
 *   business page, custom offer   — the headline IS the offer text, rendered once
 *   business page, empty headline — renders NOTHING; the state the API permits
 *   dashboard, custom selected    — 5 types offered, threshold gone, headline required
 *   dashboard, typed offer        — the control: the threshold pair is still there
 *
 * Every shot prints a DOM assertion alongside it, because a screenshot cannot
 * prove an ABSENCE: "I don't see a badge" and "the badge is below the fold"
 * look identical in a PNG. The counts are the evidence; the PNG is the review.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3103";
const OUT = new URL("../../qa-artifacts/MEH-1898", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const HEADLINE = "שני מגשי בורקס במחיר אחד בימי שישי";

const user = { id: "u1", name: "ספיר", email: "owner@example.com", role: "producer", producer_id: "p1" };

const CUSTOM_OFFER = {
  id: "o1",
  offer_type: "custom",
  threshold_value: null,
  threshold_unit: null,
  headline: HEADLINE,
  starts_at: null,
  expires_at: "2099-12-31",
};

const base = {
  id: "p1", name: "חוות הזית", slug: null, status: "approved",
  description: "חוות משפחתית", short_description: "שמן זית", city: "עתלית",
  address: null, phone: "0501234567",
  has_physical_location: true, offers_delivery: true, delivery_nationwide: false,
  delivery_excluded_cities: [], pickup_points: false,
  delivery_fee: 35, free_delivery_above: 250,
  delivery_areas: [{ city: "חיפה", delivery_day: "שישי", min_order: 100, delivery_fee: null }],
  categories: [], products: [], images: [], custom_questions: [], locations: [],
  order_window: null, opening_hours: null, kosher: null, contact_name: null,
  avg_rating: 0, reviews_count: 0,
};

const withCustom = { ...base, active_offer: CUSTOM_OFFER };
// The row the backend accepts and the badge must refuse to draw. Not a
// can't-happen fixture: tests/test_producer_offers.py asserts this exact
// payload is a 200.
const withEmptyHeadline = { ...base, active_offer: { ...CUSTOM_OFFER, headline: null } };

const browser = await chromium.launch({ executablePath: process.argv[3] || "/opt/pw-browsers/chromium" });
let failures = 0;

async function shot(name, viewport, { path, profile, probe }) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("token", "qa-fake-token"));
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me")) return route.fulfill({ json: user });
    // Sub-paths first — /producers/me/locations must answer with an ARRAY.
    // Matching `includes("/producers/")` instead is what broke the MEH-1823
    // harness: the dashboard threw during render and the probe reported the
    // card missing, a fixture bug that reads exactly like a product bug.
    if (/\/producers\/me\/.+/.test(url.pathname)) return route.fulfill({ json: [] });
    if (url.pathname.endsWith("/producers/me")) return route.fulfill({ json: profile });
    if (url.pathname.endsWith("/producers")) return route.fulfill({ json: [profile] });
    if (/\/producers\/[^/]+$/.test(url.pathname)) return route.fulfill({ json: profile });
    return route.fulfill({ json: [] });
  });
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "קבלו הכל" }).click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
  const { line, ok } = await probe(page);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(32)} | ${line}`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  await ctx.close();
}

const badgeProbe = (expectText) => async (page) => {
  const badge = page.locator('[data-testid="offer-badge"]');
  const count = await badge.count();
  if (count) {
    await badge.first().scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
  } else {
    await page.locator("section").last().scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  const text = count ? (await badge.first().innerText()).replace(/\n/g, " / ") : "(none)";
  // The secondary-line element must be absent for custom — its presence would
  // mean the headline rendered twice, once promoted and once underneath.
  const secondary = await page.locator('[data-testid="offer-headline"]').count();
  const occurrences = count ? text.split("שני מגשי בורקס").length - 1 : 0;

  if (expectText) {
    const ok = count === 1 && secondary === 0 && occurrences === 1 && text.includes(HEADLINE);
    return { ok, line: `badge=${count} secondary=${secondary} headlineShownTimes=${occurrences} | ${text}` };
  }
  return { ok: count === 0, line: `badge=${count} (must be 0 — headline-less custom renders nothing)` };
};

const dashboardProbe = (chooseCustom) => async (page) => {
  await page.getByRole("button", { name: /הטבה/ }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);
  const sel = page.locator('[data-testid="offer-type-select"]');
  if (!(await sel.count())) return { ok: false, line: "offer-type-select NOT FOUND — fixture or deep-link broke" };

  // 5 offer types + the «אין הטבה פעילה» option, which is the absence of an
  // offer and not a type. Asserting 6 total AND 5 non-empty values keeps the
  // two countable things distinguishable.
  const values = await sel.locator("option").evaluateAll((nodes) => nodes.map((node) => node.value));
  const typeValues = values.filter(Boolean);
  const fiveTypes = typeValues.length === 5 && typeValues.includes("custom");

  if (chooseCustom) await sel.selectOption("custom");
  else await sel.selectOption("gift_above");
  await page.waitForTimeout(400);

  const threshold = await page.locator('[data-testid="offer-threshold-input"]').count();
  const unit = await page.locator('[data-testid="offer-unit-select"]').count();
  const headlineInput = page.locator('[data-testid="offer-headline-input"]');
  const required = await headlineInput.getAttribute("aria-required");

  // The requirement is only observable on an EMPTY headline, so clear it — the
  // fixture seeds one, and the first version of this probe asserted `error===1`
  // straight after selecting custom and reported FAIL against a page that was
  // behaving correctly. Retracted rather than "fixed" in the product: the probe
  // was measuring a state it had not created. Both halves are checked now, so
  // the pass cannot come from the rule being absent either way.
  let errEmpty = null;
  let errFilled = null;
  let disabledWhenEmpty = null;
  if (chooseCustom) {
    await headlineInput.fill("");
    await page.waitForTimeout(300);
    errEmpty = await page.locator('[data-testid="offer-headline-error"]').count();
    disabledWhenEmpty = await page.locator('[data-testid="offer-save"]').isDisabled();
    await headlineInput.fill(HEADLINE);
    await page.waitForTimeout(300);
    errFilled = await page.locator('[data-testid="offer-headline-error"]').count();
    // Leave the field EMPTY for the capture: the error state is the thing worth
    // looking at in the screenshot.
    await headlineInput.fill("");
    await page.waitForTimeout(300);
  }
  const err = await page.locator('[data-testid="offer-headline-error"]').count();
  const saveDisabled = await page.locator('[data-testid="offer-save"]').isDisabled();

  await sel.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);

  const line =
    `types=${typeValues.length}(+none) custom=${typeValues.includes("custom")} ` +
    `threshold=${threshold} unit=${unit} aria-required=${required} ` +
    `errEmpty=${errEmpty} errFilled=${errFilled} shown=${err} saveDisabled=${saveDisabled}`;

  const ok = chooseCustom
    // custom: threshold pair GONE; the headline rule fires on empty and clears
    // on filled (both directions, so an always-on error cannot pass either).
    ? fiveTypes && threshold === 0 && unit === 0 && required === "true" &&
      errEmpty === 1 && disabledWhenEmpty && errFilled === 0
    // the control: a typed offer still has its threshold pair and no headline rule.
    : fiveTypes && threshold === 1 && unit === 1 && required === "false" && err === 0;
  return { ok, line };
};

for (const [width, height, tag] of [[375, 812, "375"], [1440, 900, "1440"]]) {
  await shot(`producer-custom-offer-${tag}`, { width, height }, {
    path: "/producer/p1", profile: withCustom, probe: badgeProbe(true),
  });
  await shot(`producer-custom-empty-headline-${tag}`, { width, height }, {
    path: "/producer/p1", profile: withEmptyHeadline, probe: badgeProbe(false),
  });
  await shot(`dashboard-custom-selected-${tag}`, { width, height }, {
    path: "/producer/dashboard/edit?group=location#offer",
    profile: withCustom, probe: dashboardProbe(true),
  });
  await shot(`dashboard-typed-control-${tag}`, { width, height }, {
    path: "/producer/dashboard/edit?group=location#offer",
    profile: withCustom, probe: dashboardProbe(false),
  });
}

await browser.close();
console.log(failures ? `\n${failures} PROBE FAILURE(S)` : "\nall probes passed");
process.exit(failures ? 1 : 0);
