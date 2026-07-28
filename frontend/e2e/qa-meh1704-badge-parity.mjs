/**
 * MEH-1704 self-QA harness — counts badges actually RENDERED on the home grid,
 * in a real browser. The vitest guard proves the schema declares the fields;
 * this proves the fields reach the card and light the chips, which is the thing
 * the ticket is actually about.
 *
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1704-badge-parity.mjs [baseURL] [chromiumPath]
 *
 * The fixture carries a DISCRIMINATING PAIR, which is the whole point:
 *   · `verification_tier` was ALREADY declared before this ticket, so its badge
 *     rendered even on the broken tree.
 *   · the other 13 were stripped, so their badges could not.
 * A probe that only checked "are there badges" would have reported health on
 * the broken tree — `verified` alone satisfies it. Counting per-key is what
 * distinguishes the fix from the bug.
 *
 * Badges are counted off `data-badge` (BadgeRow.jsx:126 verified tier, :247
 * every other badge), never off rendered text: a text match cannot tell a badge
 * from the same word appearing elsewhere in the card.
 *
 * REUSES: frontend/e2e/qa-meh1686-social-proof-strip.mjs (argv baseURL +
 * chromiumPath, never process.env — the MEH-491 env-drift gate blocks
 * undocumented env reads).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3300";
const OUT = new URL("../../qa-artifacts/MEH-1704", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const PRODUCERS_COLLECTION_RE = /\/api\/producers(?:\?[^#]*)?$/;

const base = (i) => ({
  id: `0000000${i}-1111-4111-8111-11111111111${i}`,
  name: `עסק ${i}`,
  slug: `esek-${i}`,
  city: "ירושלים",
  lat: 31.7683,
  lng: 35.2137,
  categories: [{ id: 4, name: "לחמים ואפייה" }],
  images: ["https://res.cloudinary.com/demo/image/upload/v1/sample.jpg"],
  avg_rating: 4.8,
  reviews_count: 27,
  primary_contact_method: "whatsapp",
  phone: "0501110001",
  delivery_areas: [],
  locations: [],
});

// ORDER MATTERS: the home grid renders PAGE_SIZE = 8 before "load more"
// (use-home-page.js), so a 9th fixture is never painted and any assertion about
// it would silently not run. The badge-cap card is therefore FIRST, not last.
const PRODUCERS = [
  // Cap check: earns many, must still show at most 2 + an overflow affordance.
  {
    ...base(9),
    name: "כל התגים",
    verification_tier: "verified",
    has_producer_license: true,
    is_recommended: true,
    days_since_created: 2,
    has_vegan_products: true,
    has_lactose_free_products: true,
    products_count: 9,
  },
  // Control: the ONE field that was already declared. Rendered before the fix
  // too — if this is the only badge present, the fix did not land.
  { ...base(1), name: "בקרה מאומתת", verification_tier: "verified" },
  // Each of these depends on a field that was stripped before MEH-1704.
  { ...base(2), name: "מאפייה טרייה", days_since_created: 3 },
  { ...base(3), name: "משק המרעה", grass_fed: true },
  { ...base(4), name: "מטבח ללא גלוטן", has_gluten_free_products: true },
  { ...base(5), name: "בחירת העורכת", is_recommended: true },
  { ...base(6), name: "כשרות מאושרת", kashrut_verified_at: "2026-07-01", kashrut_expires_at: "2027-07-01" },
  { ...base(7), name: "משלוחים", has_delivery: true, delivery_count: 4 },
  { ...base(8), name: "קטלוג מלא", products_count: 12 },
];

const browser = await chromium.launch({
  executablePath: process.argv[3] || "/opt/pw-browsers/chromium",
});

const results = [];
const record = (label, value) => {
  results.push(`${label}: ${JSON.stringify(value)}`);
  console.log(label, value);
};

for (const [name, viewport] of [
  ["375", { width: 375, height: 900 }],
  ["1440", { width: 1440, height: 950 }],
]) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.route(PRODUCERS_COLLECTION_RE, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PRODUCERS) })
  );
  await page.route(/\/stats(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ producers_count: 42, categories_count: 9 }),
    })
  );
  await page.goto(BASE + "/he", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(2000);

  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="producer-card"]')].map((el) => ({
      name: (el.querySelector("h2,h3")?.textContent ?? "").trim(),
      badges: [...el.querySelectorAll("[data-badge]")].map((n) => n.dataset.badge),
      overflow: !!el.querySelector('[data-testid="badge-overflow"]'),
    }))
  );
  record(`cards-${name}`, cards);

  const distinctKeys = [...new Set(cards.flatMap((c) => c.badges))].sort();
  record(`distinct-badge-keys-${name}`, distinctKeys);
  record(`cards-over-cap-${name}`, cards.filter((c) => c.badges.length > 2).map((c) => c.name));

  await page.screenshot({ path: `${OUT}/home-${name}.png`, fullPage: false });
  const many = page.locator('[data-testid="producer-card"]').last();
  if (await many.count()) await many.screenshot({ path: `${OUT}/card-many-badges-${name}.png` });

  await ctx.close();
}

fs.writeFileSync(`${OUT}/probe-results.txt`, results.join("\n") + "\n");
await browser.close();
