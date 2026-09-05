/**
 * MEH-1855 QA harness — the public producer-page signature block renders a
 * price sourced from `price_range` (canonical), driven against a real
 * `next start` build at 375 and 1440.
 *
 * Chunk 1 asserted (a) price_range-only renders and (b) the legacy alias
 * still rendered. Chunk 2 DROPPED the alias column (revision 9849fab1637a),
 * so (b) is now the INVERSE check: a payload that carries only the old alias
 * key (which the API can no longer emit — it is injected here through the
 * route mock) must render NO price line. If it does, a reader of the dropped
 * key crept back in.
 *
 * WHY IT ROUTES THE API INSTEAD OF SEEDING A DATABASE: same reasoning as
 * qa-meh2045-product-sheet-nav.mjs — useProducerData.js's client fetch feeds
 * the RENDERED tree (page.js passes no initialProducer), so intercepting it
 * exercises the real ProducerSections tree with the real CSS.
 *
 * CONTROL: every check compares against a value the run itself cannot
 * fabricate, and the script exits 1 with the reason on any miss.
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const OUT = "qa-artifacts/MEH-1855";
const failures = [];
let checks = 0;

function check(name, ok, detail = "", measured = "") {
  checks += 1;
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  const suffix = ok ? (measured ? ` — ${measured}` : "") : detail ? ` — ${detail}` : "";
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${suffix}`);
}

const base = (id, slug, name, extra = {}) => ({
  id,
  slug,
  name,
  city: "תל אביב",
  phone: "0501234567",
  description: "בית עסק לבדיקת MEH-1855.",
  products: [],
  categories: [],
  delivery_areas: [],
  products_count: 0,
  ...extra,
});

// (a) price_range-ONLY — the owner-facing bug this chunk fixes. No
// top_product_name, no legacy alias key: pre-chunk-1, hasSignature was false
// and the whole block was invisible.
const PRICE_RANGE_ONLY = base(931, "qa-price-range-only", "מאפיית הקנוני", {
  price_range: "מ-₪20",
});

// (b) legacy-alias-ONLY — after chunk 2 nothing reads this key, so the
// signature block must render WITHOUT a price line.
const ALIAS_ONLY = base(932, "qa-alias-only", "מאפיית הלגסי", {
  top_product_name: "לחם מחמצת",
  starting_price_label: "החל מ-25₪",
});

async function mount(page, producer) {
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (/\/api\/producers\/\d+(\?|$)/.test(url) || url.includes(`/api/producers/${producer.slug}`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(producer) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto(`${BASE}/he/producer/${producer.id}`, { waitUntil: "domcontentloaded" });
  // Gate on the thing under test, never on network quiet (MEH-215).
  await page.waitForSelector("#section-products", { timeout: 20_000 });
}

async function run(width, height, label) {
  const sandboxChromium = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch(
    existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {},
  );
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });

  // ---- (a) price_range-only: block MUST render, WITH the price -----------
  await mount(page, PRICE_RANGE_ONLY);
  const aVisible = await page.isVisible("#section-products");
  check(`[${label}] (a) price_range-only: #section-products renders at all`, aVisible);
  const aPriceText = await page.locator("#section-products p.text-accent.font-semibold").first().textContent().catch(() => null);
  check(`[${label}] (a) price_range-only: price line reads price_range value`, aPriceText === "מ-₪20", `got "${aPriceText}"`, `"${aPriceText}"`);
  const aSection = page.locator("#section-products");
  await aSection.screenshot({ path: `${OUT}/a-price-range-only-${label}.png` });

  // ---- (b) legacy-alias-only: the dropped key must be inert (chunk 2) ----
  await mount(page, ALIAS_ONLY);
  const bPriceCount = await page.locator("#section-products p.text-accent.font-semibold").count();
  check(`[${label}] (b) alias-only: NO price line (the dropped alias key is inert)`, bPriceCount === 0, `got ${bPriceCount} price line(s)`, `${bPriceCount}`);
  const bSection = page.locator("#section-products");
  await bSection.screenshot({ path: `${OUT}/b-alias-only-${label}.png` });

  await browser.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  await run(375, 900, "375px");
  await run(1440, 900, "1440px");

  console.log(`\n${checks} checks, ${failures.length} failures.`);
  if (failures.length) {
    console.log("FAILURES:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("QA harness crashed:", err);
  process.exit(1);
});
