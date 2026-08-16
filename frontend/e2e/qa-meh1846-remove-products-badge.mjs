/**
 * MEH-1846 self-QA — proves the products badge is gone from the RENDERED card,
 * including the `+N` overflow panel where it mostly lived.
 *
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1846-remove-products-badge.mjs [baseURL] [chromiumPath]
 *
 * A removal is easy to "verify" vacuously: assert a string is absent and the
 * probe passes on a page that rendered nothing at all. So every absence
 * assertion here is paired with a POSITIVE one on the same element —
 *
 *   · the card must still earn badges (a blank card would satisfy "no מוצרים")
 *   · the `+N` count must equal earned-minus-2, not merely be smaller
 *   · panel rows must equal that count exactly, with zero of them "מוצרים"
 *
 * The fixture earns 5 badges post-removal (verified, license, recommended,
 * new, delivery) and sets products_count: 12 — deliberately, so the count also
 * asserts that the field now contributes nothing.
 *
 * REUSES: frontend/e2e/qa-meh1704-badge-parity.mjs (argv baseURL + chromiumPath,
 * never process.env — the MEH-491 env-drift gate blocks undocumented env reads).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3300";
const OUT = new URL("../../qa-artifacts/MEH-1846", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const PRODUCERS_COLLECTION_RE = /\/api\/producers(?:\?[^#]*)?$/;
const PRODUCTS_LABEL = "מוצרים";
const MAX_VISIBLE = 2; // ProducerCard renders topBadges(producer, 2)

const MANY = {
  id: "0000001-1111-4111-8111-111111111111",
  name: "עסק עם הרבה תגים",
  slug: "esek-many",
  city: "ירושלים",
  categories: [{ id: 4, name: "לחמים ואפייה" }],
  images: ["https://res.cloudinary.com/demo/image/upload/v1/sample.jpg"],
  avg_rating: 4.8,
  reviews_count: 27,
  primary_contact_method: "whatsapp",
  phone: "0501110001",
  delivery_areas: [],
  locations: [],
  // 5 badges after MEH-1846: verified, license, recommended, new, delivery.
  verification_tier: "verified",
  has_producer_license: true,
  is_recommended: true,
  days_since_created: 3,
  has_delivery: true,
  delivery_count: 4,
  has_physical_location: true,
  offers_delivery: true,
  // Left set ON PURPOSE — it must now earn nothing.
  products_count: 12,
};

const browser = await chromium.launch({
  executablePath: process.argv[3] || "/opt/pw-browsers/chromium",
});

const results = [];
let failures = 0;
const assert = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  results.push(`${ok ? "PASS" : "FAIL"} ${label}: ${JSON.stringify({ actual, expected })}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`, { actual, expected });
};

for (const [name, viewport] of [
  ["375", { width: 375, height: 900 }],
  ["1440", { width: 1440, height: 950 }],
]) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.route(PRODUCERS_COLLECTION_RE, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([MANY]) }),
  );
  await page.route(/\/stats(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ producers_count: 42, categories_count: 9 }),
    }),
  );
  await page.goto(BASE + "/he", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(2000);

  const card = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="producer-card"]');
    if (!el) return { found: false };
    return {
      found: true,
      visibleBadges: [...el.querySelectorAll("[data-badge]")].map((n) => n.dataset.badge),
      overflowLabel: el.querySelector('[data-testid="badge-overflow"]')?.textContent.trim() ?? null,
    };
  });
  console.log(`card-${name}`, card);

  // POSITIVE control first: a blank card would satisfy every absence below.
  assert(`card-renders-visible-badges-${name}`, card.visibleBadges?.length, MAX_VISIBLE);
  assert(`card-has-no-products-badge-key-${name}`, (card.visibleBadges ?? []).includes("products"), false);

  // `+N` must be earned-minus-visible. 5 earned - 2 visible = +3.
  assert(`overflow-label-${name}`, card.overflowLabel, "+3");

  // Open the panel and read the rows it ADDS (BadgeRow marks the visible row
  // role="list" too, and the popover portals to <body> — so a global scan
  // cannot be scoped to the card; diffing isolates the panel's own rows).
  const listItems = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role="listitem"]')].map((n) => n.textContent.trim()),
    );
  const btn = page.locator('[data-testid="badge-overflow"]').first();
  let rows = null;
  if (await btn.count()) {
    const before = await listItems();
    await btn.click();
    await page.waitForTimeout(400);
    const after = await listItems();
    const rest = [...before];
    rows = after.filter((t) => {
      const i = rest.indexOf(t);
      if (i === -1) return true;
      rest.splice(i, 1);
      return false;
    });
  }
  console.log(`panel-rows-${name}`, rows);

  // Numeric, as the ticket asks: rows == badges earned beyond the visible cap,
  // and ZERO of them are "מוצרים".
  assert(`panel-row-count-${name}`, rows?.length, 3);
  assert(
    `panel-products-row-count-${name}`,
    (rows ?? []).filter((r) => r === PRODUCTS_LABEL).length,
    0,
  );

  await page.screenshot({ path: `${OUT}/home-panel-open-${name}.png`, fullPage: false });
  const cardLoc = page.locator('[data-testid="producer-card"]').first();
  if (await cardLoc.count())
    await cardLoc.screenshot({ path: `${OUT}/card-panel-open-${name}.png` });

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(200);
  if (await cardLoc.count())
    await cardLoc.screenshot({ path: `${OUT}/card-closed-${name}.png` });

  await ctx.close();
}

results.push(`FAILURES: ${failures}`);
fs.writeFileSync(`${OUT}/probe-results.txt`, results.join("\n") + "\n");
await browser.close();
console.log("FAILURES", failures);
process.exit(failures === 0 ? 0 : 1);
