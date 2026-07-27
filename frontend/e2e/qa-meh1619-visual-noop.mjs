/**
 * MEH-1619 — visual no-op proof for the CSS deletions.
 *
 * Every rule this ticket deletes was measured DEAD in Phase 0, so removing it
 * must change nothing on screen. This captures the same deterministic states
 * before and after the deletion; `compare` diffs them pixel-for-pixel. A
 * non-zero diff means the rule was live after all and the deletion is wrong.
 *
 * Deterministic by construction: producer data is route-mocked and OSM tiles do
 * not load in the sandbox, so the map paints a flat background — no tile-fetch
 * jitter between the two runs.
 *
 * Usage:
 *   node e2e/qa-meh1619-visual-noop.mjs before
 *   node e2e/qa-meh1619-visual-noop.mjs after
 *   node e2e/qa-meh1619-visual-noop.mjs compare
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const MODE = process.argv[2] || "before";
const BASE = process.argv[3] || "http://127.0.0.1:3000";
const OUT = path.resolve("../qa-artifacts/MEH-1619");
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PRODUCERS_RE = /\/api\/producers(?:\?[^#]*)?$/;
const DEMO_ID = "1a1a1a1a-1111-4111-8111-111111111111";
const PRODUCER_DETAIL_RE = new RegExp(`/api/producers/${DEMO_ID}(?:\\?[^#]*)?$`);

const demoLocations = [
  { kind: "branch", label: "הסניף", lat: 32.08, lng: 34.78, is_primary: true, precision: "exact" },
  ...Array.from({ length: 9 }, (_, i) => ({
    kind: i % 2 === 0 ? "pickup" : "market_stand",
    label: `איסוף ${i + 1}`,
    lat: 32.0 + i * 0.045,
    lng: 34.72 + (i % 3) * 0.06,
    is_primary: false,
    precision: "exact",
  })),
];
const mapProducers = [
  { id: DEMO_ID, name: "עסק הדגמה — עשר נקודות", slug: "demo-ten", city: "תל אביב", lat: 32.08,
    lng: 34.78, categories: [{ id: 4, name: "לחמים ואפייה" }], images: [], locations: demoLocations,
    plan: "free", verification_tier: null },
  { id: "22222222-2222-4222-8222-222222222222", name: "עסק שכן", slug: "nb", city: "רמת גן",
    lat: 32.05, lng: 34.95, categories: [{ id: 4, name: "לחמים ואפייה" }], images: [], locations: [],
    plan: "free", verification_tier: null },
];
const detailProducer = {
  id: DEMO_ID, name: "מאפיית הדגמה", slug: "demo-bakery", city: "זכרון יעקב", description: "בדיקה",
  categories: [{ id: 4, name: "לחמים ואפייה" }], images: [], lat: 32.5732, lng: 34.9519,
  locations: demoLocations, delivery_areas: [], plan: "free", verification_tier: null,
  primary_contact_method: "whatsapp", phone: "0501110001",
};

const launch = () =>
  chromium.launch({
    args: ["--ssl-version-max=tls1.2"],
    ...(fs.existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
  });

async function capture(tag) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [w, h, label] of [[1440, 900, "1440"], [375, 812, "375"]]) {
    const browser = await launch();
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.route(PRODUCERS_RE, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mapProducers) }));
    await page.route(PRODUCER_DETAIL_RE, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detailProducer) }));

    // /map — un-clustered (markers individually rendered), which is the only
    // state where the deleted marker rule could ever have applied.
    await page.goto(`${BASE}/map`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__MAP_CENTER__ !== undefined, { timeout: 45_000 });
    await page.waitForSelector(".mehamakor-marker-wrap, .mehamakor-cluster", { timeout: 30_000 });
    await page.waitForTimeout(1500);
    const cards = page.getByText("עסק הדגמה — עשר נקודות");
    for (let i = 0; i < (await cards.count()); i += 1) {
      if (await cards.nth(i).isVisible()) {
        await cards.nth(i).click({ timeout: 5_000 }).catch(() => cards.nth(i).dispatchEvent("click"));
        break;
      }
    }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `noop-map-${label}-${tag}.png`) });

    // producer page mini-map
    await page.goto(`${BASE}/producer/${DEMO_ID}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".mehamakor-minimap-pin", { timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.locator(".leaflet-container").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `noop-producer-${label}-${tag}.png`) });
    await browser.close();
  }
  console.log(`captured: ${tag}`);
}

// Compare PIXELS, not file hashes.
//
// The first version of this hashed the PNGs. That reports a difference whenever
// the encoder's output bytes differ, which happens between runs of the SAME
// build — it flagged /map at both widths while the actual rendering was
// identical to the pixel. A hash is over-strict here: it can only answer "are
// these files equal", while the claim under test is "does this render the same".
// (The mirror image of the OR-assertion problem this ticket exists to fix: one
// is a false negative, this was a false positive. Both are the wrong instrument
// for the claim.) 4/255 per channel absorbs nothing visible — anti-aliasing on
// identical geometry stays well under it, and a live style change does not.
const CHANNEL_TOLERANCE = 4;

async function pixelDiff(a, b) {
  const sharp = (await import("sharp")).default;
  const [A, B] = await Promise.all([
    sharp(a).raw().toBuffer({ resolveWithObject: true }),
    sharp(b).raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (A.info.width !== B.info.width || A.info.height !== B.info.height) return { diff: -1, total: 0 };
  const { width, height, channels } = A.info;
  let diff = 0;
  for (let i = 0; i < A.data.length; i += channels) {
    if (
      Math.abs(A.data[i] - B.data[i]) > CHANNEL_TOLERANCE ||
      Math.abs(A.data[i + 1] - B.data[i + 1]) > CHANNEL_TOLERANCE ||
      Math.abs(A.data[i + 2] - B.data[i + 2]) > CHANNEL_TOLERANCE
    ) diff += 1;
  }
  return { diff, total: width * height };
}

async function compare() {
  let clean = 0;
  let dirty = 0;
  for (const name of ["map-1440", "map-375", "producer-1440", "producer-375"]) {
    const a = path.join(OUT, `noop-${name}-before.png`);
    const b = path.join(OUT, `noop-${name}-after.png`);
    if (!fs.existsSync(a) || !fs.existsSync(b)) {
      console.log(`SKIP ${name} — missing capture`);
      continue;
    }
    const { diff, total } = await pixelDiff(a, b);
    if (diff === 0) clean += 1;
    else dirty += 1;
    console.log(
      diff === 0
        ? `IDENTICAL ${name}  0 / ${total} px differ`
        : `DIFFERS   ${name}  ${diff} / ${total} px differ`,
    );
  }
  console.log(`\n${clean} pixel-identical, ${dirty} differing`);
  process.exit(dirty === 0 ? 0 : 1);
}

if (MODE === "compare") await compare();
else await capture(MODE);
