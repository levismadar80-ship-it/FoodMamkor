/**
 * MEH-1611 chunk 2 — self-QA for the business page's locations map.
 *
 * Drives a real Chromium against a local `next start` with the producer
 * endpoint route-mocked, and asserts on the LIVE DOM:
 *
 *   1. the demo business (1 branch + 9 pickup/market points) renders exactly
 *      10 pins — 1 primary + 9 secondary;
 *   2. ZERO foreign pins (only this producer's points are ever drawn);
 *   3. a producer with no usable coordinates renders NO map section at all —
 *      absent from the DOM, not an empty map or a placeholder.
 *
 * Route regexes are anchored the same way as parity.spec.ts:60-61 — a
 * `**​/producers?*` glob would also swallow the collection endpoint and the
 * /count, /cities, /random siblings.
 *
 * Run: node e2e/qa-meh1611-producer-locations.mjs   (needs `next start` on :3000)
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "../qa-artifacts/MEH-1611");
const BASE = process.argv[3] || "http://127.0.0.1:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// UUID-shaped: the detail route matches a uuid segment (parity.spec.ts's
// PRODUCER_DETAIL_RE relies on the same shape).
const DEMO_ID = "1a1a1a1a-1111-4111-8111-111111111111";
const EMPTY_ID = "2b2b2b2b-2222-4222-8222-222222222222";

// Mirrors backend/scripts/seed_demo_business.py DEMO_LOCATIONS: one branch plus
// nine satellite points around Zichron Ya'akov.
const demoLocations = [
  {
    id: "loc-0",
    kind: "branch",
    label: "המאפייה (הסניף המרכזי)",
    city: "זכרון יעקב",
    lat: 32.5732,
    lng: 34.9519,
    is_primary: true,
    precision: "exact",
    opening_hours: "א׳–ה׳ 08:00–17:00",
  },
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `loc-${i + 1}`,
    kind: i % 2 === 0 ? "pickup" : "market_stand",
    label: `איסוף — נקודה ${i + 1}`,
    city: "זכרון יעקב",
    lat: 32.55 + i * 0.012,
    lng: 34.93 + (i % 3) * 0.015,
    is_primary: false,
    precision: i === 4 ? "approximate" : "exact",
    opening_hours: i % 2 === 0 ? "ו׳ 08:00–13:00" : null,
  })),
];

const baseProducer = {
  id: DEMO_ID,
  name: "מאפיית הדגמה",
  slug: "demo-bakery",
  city: "זכרון יעקב",
  description: "עסק הדגמה לבדיקת המפה",
  categories: [{ id: 4, name: "לחמים ואפייה" }],
  images: [],
  lat: 32.5732,
  lng: 34.9519,
  locations: demoLocations,
  primary_contact_method: "whatsapp",
  phone: "0501110001",
  delivery_areas: [],
  avg_rating: 4.8,
  reviews_count: 27,
  plan: "free",
  verification_tier: null,
};

// Same business, no coordinates anywhere — the map section must not exist.
const noCoordsProducer = {
  ...baseProducer,
  id: EMPTY_ID,
  name: "עסק בלי מיקום",
  slug: "no-coords",
  lat: null,
  lng: null,
  locations: [],
};

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const readPins = (page) =>
  page.evaluate(() => {
    const pins = [...document.querySelectorAll(".mehamakor-minimap-pin")];
    return {
      total: pins.length,
      secondary: pins.filter((p) =>
        p.classList.contains("mehamakor-minimap-pin-secondary"),
      ).length,
      hasMapSection: !!document.querySelector(".leaflet-container"),
    };
  });

async function run(width, height, label) {
  const browser = await chromium.launch({
    args: ["--ssl-version-max=tls1.2"],
    ...(fs.existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width, height } });

  const serve = (producer) => (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(producer),
    });

  await page.route(new RegExp(`/api/producers/${DEMO_ID}(?:\\?[^#]*)?$`), serve(baseProducer));
  await page.route(new RegExp(`/api/producers/${EMPTY_ID}(?:\\?[^#]*)?$`), serve(noCoordsProducer));
  // Everything else the page fans out to (reviews, similar, products…) → empty.
  await page.route(/\/api\/(reviews|producers\/[^/]+\/(products|events|recipes|experiences))/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  // ── the demo business: exactly 10 pins ────────────────────────────────────
  await page.goto(`${BASE}/producer/${DEMO_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mehamakor-minimap-pin", { timeout: 30_000 });
  await page.waitForTimeout(1200);

  const pins = await readPins(page);
  check(`[${label}] exactly 10 pins for the 10-location demo business`, pins.total === 10,
    `total=${pins.total}`);
  check(`[${label}] 1 primary + 9 secondary`,
    pins.secondary === 9 && pins.total - pins.secondary === 1,
    `primary=${pins.total - pins.secondary} secondary=${pins.secondary}`);
  check(`[${label}] zero foreign pins (count never exceeds this producer's points)`,
    pins.total === demoLocations.length, `points=${demoLocations.length} pins=${pins.total}`);

  await page.locator(".leaflet-container").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `producer-map-${label}-01-ten-points.png`) });

  // ── a business with no usable coordinates: no map at all ──────────────────
  await page.goto(`${BASE}/producer/${EMPTY_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const empty = await readPins(page);
  check(`[${label}] no-coords business renders NO map section`,
    !empty.hasMapSection && empty.total === 0,
    `leafletContainer=${empty.hasMapSection} pins=${empty.total}`);
  await page.screenshot({ path: path.join(OUT, `producer-map-${label}-02-no-coords.png`) });

  await browser.close();
}

fs.mkdirSync(OUT, { recursive: true });
await run(1440, 900, "1440");
await run(375, 812, "375");

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
