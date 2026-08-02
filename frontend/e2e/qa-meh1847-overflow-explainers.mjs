/**
 * MEH-1847 self-QA — the +N panel's rows now carry an explanation line.
 *
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1847-overflow-explainers.mjs [baseURL] [chromiumPath]
 *
 * Two questions vitest cannot answer, which is why this exists:
 *
 *  1. CLIPPING. Every row roughly doubles in height. The panel is a Popover
 *     with MEH-1593 collision handling, and at 375px it opens over a card near
 *     the top of the grid. So the probe measures the panel's rect against the
 *     viewport — not "does it look fine" — and fails on any overflow.
 *  2. PAIRING. It is not enough that the tooltip strings appear somewhere in
 *     the panel; each one must sit inside the SAME row as its own label. A
 *     flat text match would pass even if every description rendered under the
 *     wrong badge, so rows are read as (label, description) pairs and checked
 *     against BADGE_CONFIG per key.
 *
 * The kashrut row is included deliberately: its label comes from the MEH-1745
 * resolver while its description comes from BADGE_CONFIG, so it is the one row
 * where the two halves have different sources and could disagree.
 *
 * REUSES: frontend/e2e/qa-meh1704-badge-parity.mjs (argv baseURL + chromiumPath,
 * never process.env — the MEH-491 env-drift gate blocks undocumented env reads).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3300";
const OUT = new URL("../../qa-artifacts/MEH-1847", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const PRODUCERS_COLLECTION_RE = /\/api\/producers(?:\?[^#]*)?$/;

// Copy is asserted against these, mirrored from lib/badges.js BADGE_CONFIG.
// Kept as an explicit map so a paraphrase in the component fails the probe.
const TOOLTIPS = {
  "בחירת העורכת":
    "בחירה אישית של עורכת מהמקור — על איכות, טריות או סיפור מיוחד. אי אפשר לקנות את התגית הזו.",
  חדש: "העסק הצטרף אלינו בחודש האחרון.",
  "ללא גלוטן": "לעסק יש מוצרים ללא גלוטן מסומנים בקטלוג.",
  משלוח: "העסק מוסר או שולח לכתובת שלך.",
  // Resolver-supplied label (single kashrut code) + BADGE_CONFIG description.
  "בשר חלק (גלאט)": "המוצרים תחת השגחת כשרות.",
};

const PRODUCER = {
  id: "0000001-1111-4111-8111-111111111111",
  name: "עסק עם הסברים",
  slug: "esek-explainers",
  city: "ירושלים",
  categories: [{ id: 4, name: "לחמים ואפייה" }],
  images: ["https://res.cloudinary.com/demo/image/upload/v1/sample.jpg"],
  avg_rating: 4.8,
  reviews_count: 27,
  primary_contact_method: "whatsapp",
  phone: "0501110001",
  delivery_areas: [],
  locations: [],
  // Earns 7: verified, license, recommended, new, gluten_free, kosher,
  // delivery. Card shows the top 2 (verified, license), so the panel holds the
  // remaining 5. (First run of this probe asserted 4 — my arithmetic, not the
  // product; the pairing check below already passed on all five rows.)
  verification_tier: "verified",
  has_producer_license: true,
  is_recommended: true,
  days_since_created: 3,
  has_gluten_free_products: true,
  kashrut_badges: ["chalak"],
  kashrut_verified_at: "2026-07-01T00:00:00Z",
  kashrut_expires_at: "2027-07-01T00:00:00Z",
  has_delivery: true,
  delivery_count: 4,
  has_physical_location: true,
  offers_delivery: true,
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
  ["375", { width: 375, height: 812 }],
  ["1440", { width: 1440, height: 950 }],
]) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.route(PRODUCERS_COLLECTION_RE, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([PRODUCER]) }),
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

  await page.locator('[data-testid="badge-overflow"]').first().click();
  await page.waitForTimeout(500);

  // Read rows as (label, description) PAIRS — see header note 2.
  const panel = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="badge-overflow-popover"]');
    if (!el) return { found: false };
    const rows = [...el.querySelectorAll('[role="listitem"]')].map((r) => {
      const kids = [...r.children];
      return {
        label: (kids[0]?.textContent ?? "").trim(),
        desc: kids.length > 1 ? (kids[1]?.textContent ?? "").trim() : null,
      };
    });
    const r = el.getBoundingClientRect();
    return {
      found: true,
      rows,
      heading: el.querySelector("span")?.textContent.trim() ?? null,
      rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });
  console.log(`panel-${name}`, JSON.stringify(panel.rows, null, 1));

  assert(`panel-row-count-${name}`, panel.rows?.length, 5);

  // (a) every row shows label + the RIGHT muted line for that label.
  const mismatched = (panel.rows ?? []).filter((r) => TOOLTIPS[r.label] !== r.desc);
  assert(`every-row-label-desc-pair-correct-${name}`, mismatched, []);
  assert(
    `no-row-missing-its-description-${name}`,
    (panel.rows ?? []).filter((r) => !r.desc).length,
    0,
  );

  // (c) kashrut row keeps the resolver label, not the generic fallback.
  const kosher = (panel.rows ?? []).find((r) => r.desc === TOOLTIPS["בשר חלק (גלאט)"]);
  assert(`kashrut-row-label-${name}`, kosher?.label, "בשר חלק (גלאט)");
  assert(
    `kashrut-row-not-generic-fallback-${name}`,
    kosher?.label === "כשרות מאומתת",
    false,
  );

  // (b) MEH-1593 regression check — the taller panel must stay on screen.
  const rect = panel.rect ?? {};
  assert(`panel-within-viewport-x-${name}`, rect.left >= 0 && rect.right <= panel.vw, true);
  assert(`panel-within-viewport-y-${name}`, rect.top >= 0 && rect.bottom <= panel.vh, true);
  results.push(
    `  geometry-${name}: rect=${JSON.stringify(rect)} viewport=${panel.vw}x${panel.vh}`,
  );

  await page.screenshot({ path: `${OUT}/panel-open-${name}.png`, fullPage: false });
  const card = page.locator('[data-testid="producer-card"]').first();
  if (await card.count()) await card.screenshot({ path: `${OUT}/card-${name}.png` });

  await ctx.close();
}

results.push(`FAILURES: ${failures}`);
fs.writeFileSync(`${OUT}/probe-results.txt`, results.join("\n") + "\n");
await browser.close();
console.log("FAILURES", failures);
process.exit(failures === 0 ? 0 : 1);
