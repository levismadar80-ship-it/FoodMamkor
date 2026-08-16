/**
 * MEH-1823 self-QA harness — the offer across all four required states.
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1823-offers.mjs [baseURL] [chromiumPath]
 * REUSES: frontend/e2e/qa-meh1821-delivery-defaults.mjs (fixture-intercept).
 *
 * The four states the ticket asks for, and the reason each is captured:
 *   business page WITH an offer    — the badge renders above the delivery block
 *   business page WITHOUT one      — proves zero visual change, the load-bearing claim
 *   card in both states            — same, on the surface the chip lives on
 *   OffersCard in the dashboard    — the owner's write surface
 *
 * Every shot also prints a DOM assertion, because a screenshot cannot prove an
 * ABSENCE: "I don't see a badge" and "the badge is below the fold" look identical.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3103";
const OUT = new URL("../../qa-artifacts/MEH-1823", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const user = { id: "u1", name: "ספיר", email: "owner@example.com", role: "producer", producer_id: "p1" };

const OFFER = {
  id: "o1",
  offer_type: "free_delivery_above",
  threshold_value: 10,
  threshold_unit: "liters",
  headline: "אספקה עד הבית בכל רחבי הצפון",
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

const withOffer = { ...base, active_offer: OFFER };
const withoutOffer = { ...base, active_offer: null };

const browser = await chromium.launch({ executablePath: process.argv[3] || "/opt/pw-browsers/chromium" });

async function shot(name, viewport, { path, profile, probe }) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("token", "qa-fake-token"));
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me")) return route.fulfill({ json: user });
    // Order matters, and the sub-path case is the one that bit: an earlier
    // version matched `includes("/producers/")` and so answered
    // /producers/me/locations with a producer OBJECT where the dashboard
    // expects an ARRAY. That threw during render, the editor never mounted,
    // and the probe reported "card missing" — a fixture bug that reads exactly
    // like a product bug. Sub-paths fall through to [] first.
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
  const result = await probe(page);
  console.log(`${name.padEnd(34)} | ${result}`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  await ctx.close();
}

// Counting elements, not eyeballing pixels: 0 vs 1 is the whole claim.
const countBadge = async (page) => {
  const badge = await page.locator('[data-testid="offer-badge"]').count();
  const chip = await page.locator('[data-testid="offer-chip"]').count();
  const text = badge
    ? (await page.locator('[data-testid="offer-badge"]').first().innerText()).replace(/\n/g, " / ")
    : "(none)";
  // Bring the badge into frame so the screenshot is reviewable. Without this
  // the badge sits below the fold and the WITH-offer and WITHOUT-offer shots
  // look identical — which would make the pair worthless as visual evidence,
  // even though the counts above are already conclusive.
  if (badge) {
    await page
      .locator('[data-testid="offer-badge"]')
      .first()
      .scrollIntoViewIfNeeded({ timeout: 3000 })
      .catch(() => {});
    await page.waitForTimeout(400);
  } else {
    // Same scroll depth for the no-offer shot, so the two frames are comparable
    // rather than one being the top of the page and the other the middle.
    await page.locator("section").last().scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  return `badge=${badge} chip=${chip} | ${text}`;
};

for (const [w, h, tag] of [[375, 812, "375"], [1440, 900, "1440"]]) {
  await shot(`producer-with-offer-${tag}`, { width: w, height: h }, {
    path: "/producer/p1", profile: withOffer, probe: countBadge,
  });
  await shot(`producer-no-offer-${tag}`, { width: w, height: h }, {
    path: "/producer/p1", profile: withoutOffer, probe: countBadge,
  });
  await shot(`dashboard-offers-card-${tag}`, { width: w, height: h }, {
    // Deep-link straight to the card: ?group=location selects the group (the
    // others are `hidden`), #offer opens the accordion. Clicking through the
    // hub worked only intermittently, and a flaky QA harness is worse than none.
    path: "/producer/dashboard/edit?group=location#offer",
    profile: withOffer,
    probe: async (page) => {
      // NO hub clicks here. The deep link above already selects the group and
      // opens the card; clicking the hub afterwards navigates back OUT of it,
      // which is what made an earlier version of this probe report 0 while the
      // card was rendering perfectly well. The probe was wrong, not the page.
      // Open the accordion body for the capture. Safe here (unlike the group
      // click removed above): toggling the card does not navigate, it only
      // flips `hidden` on a body that is already mounted.
      await page.getByRole("button", { name: /הטבה/ }).first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
      const sel = page.locator('[data-testid="offer-type-select"]');
      const n = await sel.count();
      await sel.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(300);
      return `url=${page.url().split("/edit")[1]} group=${await page.locator('[data-testid="group-location"]').count()} type-select=${n} value=${n ? await sel.inputValue().catch(() => "?") : "-"}`;
    },
  });
}

await browser.close();
