/**
 * MEH-1611 chunk 1 — self-QA for /map focus-on-select.
 *
 * Drives a real Chromium against a local `next start` with the producers +
 * categories endpoints route-mocked, then asserts the acceptance criteria on
 * the LIVE DOM (the vitest guards assert the same invariants against a Leaflet
 * stub; this proves the CSS actually lands):
 *
 *   1. marker count before a selection === marker count after (0 removed);
 *   2. every marker except the selected business's is visually demoted;
 *   3. the selected business's own pins stay at full strength;
 *   4. closing the card restores all of them.
 *
 * Route regexes are anchored (`/api/producers(?:\?...)?$`) — copied from
 * e2e/visual/parity.spec.ts:60. A `**​/producers?*` glob is WRONG here: it also
 * swallows /api/producers/{id}, /count, /cities and /random.
 *
 * Run: node e2e/qa-meh1611-map-focus.mjs   (needs `next start` on :3000)
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "../qa-artifacts/MEH-1611");
const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const PRODUCERS_RE = /\/api\/producers(?:\?[^#]*)?$/;
const CATEGORIES_RE = /\/api\/categories(?:\?[^#]*)?$/;
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// The demo business: 1 branch + 9 pickup points (the shape MEH-1611's DoD
// names), plus two single-point businesses that must be demoted but NOT
// removed when it is selected.
const DEMO_ID = "11111111-1111-4111-8111-111111111111";
const demoLocations = [
  { id: "loc-0", kind: "branch", label: "הסניף", lat: 32.08, lng: 34.78, is_primary: true, precision: "exact" },
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `loc-${i + 1}`,
    kind: i % 2 === 0 ? "pickup" : "market_stand",
    label: `נקודת איסוף ${i + 1}`,
    // Spread wide enough that fitBounds lands at a zoom where markercluster
    // keeps them apart (radius 40px from zoom 11 — MapComponent.jsx:43-45),
    // so the demote is observable on individual pins rather than on clusters.
    lat: 32.0 + i * 0.045,
    lng: 34.72 + (i % 3) * 0.06,
    is_primary: false,
    precision: i === 4 ? "approximate" : "exact",
  })),
];

const producers = [
  {
    id: DEMO_ID,
    name: "עסק הדגמה — עשר נקודות",
    slug: "demo-ten",
    lat: 32.08,
    lng: 34.78,
    city: "תל אביב",
    categories: [{ id: 1, name: "מאפים" }],
    images: [],
    locations: demoLocations,
    plan: "free",
    verification_tier: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "עסק שכן א",
    slug: "neighbour-a",
    lat: 32.05,
    lng: 34.95,
    city: "רמת גן",
    categories: [{ id: 1, name: "מאפים" }],
    images: [],
    locations: [],
    plan: "free",
    verification_tier: null,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "עסק שכן ב",
    slug: "neighbour-b",
    lat: 32.27,
    lng: 34.79,
    city: "הרצליה",
    categories: [{ id: 1, name: "מאפים" }],
    images: [],
    locations: [],
    plan: "free",
    verification_tier: null,
  },
];
const categories = [{ id: 1, name: "מאפים", slug: "bakery" }];

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// Count only markers actually attached to the map pane, and measure the
// COMPUTED style so the assertion covers the real cascade, not a class name.
const readMarkers = (page) =>
  page.evaluate(() => {
    const panes = [...document.querySelectorAll(".leaflet-container")].filter(
      (c) => c.getBoundingClientRect().width > 0,
    );
    const pane = panes[0];
    if (!pane) return { total: 0, demoted: 0, full: 0, focusedClass: 0, containerFlag: false };
    const wraps = [...pane.querySelectorAll(".mehamakor-marker-wrap")];
    let demoted = 0;
    let full = 0;
    for (const w of wraps) {
      const s = getComputedStyle(w);
      // BOTH cues must be present, and the fade is asserted specifically.
      // An `||` here would hide the exact regression this check exists for:
      // markercluster's inline style.opacity beats a class-level `opacity`,
      // so a demote expressed that way survives as grayscale-only after any
      // zoom and an OR-based probe would still call it "demoted".
      const grayscaled = s.filter.includes("grayscale");
      const fadedViaFilter = /opacity\(0?\.\d+\)/.test(s.filter);
      const fadedViaProp = Number.parseFloat(s.opacity) < 0.9;
      if (grayscaled && (fadedViaFilter || fadedViaProp)) demoted += 1;
      else full += 1;
    }
    return {
      total: wraps.length,
      demoted,
      full,
      focusedClass: pane.querySelectorAll(".mehamakor-marker-focused").length,
      containerFlag: pane.classList.contains("mehamakor-map-focused"),
    };
  });

async function run(width, height, label) {
  // executablePath: the sandbox ships Chromium at a fixed path that may not
  // match the revision this repo's @playwright/test pins; point at the
  // installed binary instead of downloading one. --ssl-version-max is the
  // sandbox TLS workaround (.claude/rules/testing.md) — harmless on localhost.
  const browser = await chromium.launch({
    args: ["--ssl-version-max=tls1.2"],
    ...(fs.existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width, height } });

  await page.route(PRODUCERS_RE, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(producers) }),
  );
  await page.route(CATEGORIES_RE, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(categories) }),
  );

  await page.goto(`${BASE}/map`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__MAP_CENTER__ !== undefined, { timeout: 45_000 });
  // At the initial zoom 8 every pin sits inside a cluster, so counting
  // `.mehamakor-marker-wrap` there measures the CAMERA, not the marker
  // population. All before/after counting below therefore happens at ONE fixed
  // camera, which is the only way the comparison is like-for-like.
  await page.waitForSelector(".mehamakor-marker-wrap, .mehamakor-cluster", { timeout: 30_000 });
  await page.waitForTimeout(1500);

  const initial = await readMarkers(page);
  check(`[${label}] nothing demoted before any selection`,
    initial.demoted === 0 && !initial.containerFlag,
    `wraps=${initial.total} demoted=${initial.demoted}`);
  await page.screenshot({ path: path.join(OUT, `map-${label}-01-before-select.png`) });

  // Select from the card list — the path that also drives the camera
  // (useMapSync.handleCardClick → focusProducer → fitBounds over all points).
  // The card list renders TWICE (desktop rail + mobile sheet); one copy is
  // always display:none, so .first() can resolve to the hidden one. Pick the
  // visible copy — the same visible-instance discipline useMapSync applies to
  // the map panes (useMapSync.js:89-104).
  const selectBusiness = async () => {
    const matches = page.getByText("עסק הדגמה — עשר נקודות");
    const n = await matches.count();
    for (let i = 0; i < n; i += 1) {
      if (await matches.nth(i).isVisible()) {
        // On 375px the fixed BottomNav pill overlays the bottom of the sheet
        // and intercepts the hit-test. dispatchEvent delivers the click to the
        // card element itself (React's delegated listener still fires), which
        // is what we're testing — the nav overlap is not the subject here.
        await matches
          .nth(i)
          .click({ timeout: 5_000 })
          .catch(() => matches.nth(i).dispatchEvent("click"));
        await page.waitForTimeout(2200); // fitBounds animation + cluster re-render
        return;
      }
    }
    throw new Error("no visible card for the demo business");
  };
  await selectBusiness();
  const selected = await readMarkers(page);
  check(`[${label}] fitBounds framed the business — its points un-clustered`,
    selected.focusedClass >= 2, `focused pins in view=${selected.focusedClass}`);
  check(`[${label}] container carries the focus flag`, selected.containerFlag === true);
  check(`[${label}] foreign pins demoted, the selected business's are not`,
    selected.demoted > 0 && selected.full > 0,
    `demoted=${selected.demoted} full=${selected.full}`);
  check(`[${label}] every full-strength pin belongs to the selected business`,
    selected.full === selected.focusedClass,
    `full=${selected.full} focused=${selected.focusedClass}`);
  await page.screenshot({ path: path.join(OUT, `map-${label}-02-selected.png`) });

  // Regression guard: a zoom cycle runs markercluster's animation path, which
  // writes inline style.opacity onto every marker it shows. The demote must
  // survive that (see the globals.css note — this is why the fade lives in
  // `filter: opacity()` rather than the `opacity` property).
  await page.evaluate(() => document.querySelector(".leaflet-control-zoom-out")?.click());
  await page.waitForTimeout(1400);
  await page.evaluate(() => document.querySelector(".leaflet-control-zoom-in")?.click());
  await page.waitForTimeout(1800);
  const afterZoom = await readMarkers(page);
  check(`[${label}] demote survives a cluster zoom animation`,
    afterZoom.demoted > 0 && afterZoom.full === afterZoom.focusedClass,
    `demoted=${afterZoom.demoted} full=${afterZoom.full} focused=${afterZoom.focusedClass}`);

  // Deselect on the map canvas (useMapSync.handleMapCanvasClick). The camera
  // does NOT move, so these counts are directly comparable to `selected`.
  await page.locator(".leaflet-container:visible").first().click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(1200);
  const restored = await readMarkers(page);
  check(`[${label}] deselect restores every pin`,
    restored.demoted === 0 && !restored.containerFlag,
    `wraps=${restored.total} demoted=${restored.demoted}`);
  check(`[${label}] demote != remove — same camera, same marker count`,
    restored.total === selected.total,
    `selected=${selected.total} deselected=${restored.total}`);
  await page.screenshot({ path: path.join(OUT, `map-${label}-03-restored.png`) });

  // Re-select at the SAME camera — the strict before/after count invariant.
  await selectBusiness();
  const reselected = await readMarkers(page);
  check(`[${label}] re-select at identical camera removes exactly 0 markers`,
    reselected.total === restored.total,
    `unselected=${restored.total} selected=${reselected.total}`);

  await browser.close();
}

fs.mkdirSync(OUT, { recursive: true });
await run(1440, 900, "1440");
await run(375, 812, "375");

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
