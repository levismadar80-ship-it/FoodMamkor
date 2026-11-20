/**
 * MEH-1576 Chunk B self-QA — /map after removing the orphaned sessionStorage
 * deep-link reader from MapClient.jsx.
 *
 * The point of this harness is NOT the deleted code (it had no writer, so it
 * was unobservable). It is the LIVE imperative path that shares its name:
 * useMapSync.js:125 calls mapApiRef.current.focusProducer(id) when a card is
 * tapped while already on /map. That must still centre the map.
 *
 * Drives the REAL /map page in Chromium against a `next start` server with
 * every /api/** call fulfilled from fixtures (the CC sandbox cannot reach
 * Railway — CLAUDE.md "Known Bug Patterns"). Captures 375px + 1440px.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh1576-map-residue.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-1576";
// Hard-coded, not env-driven: the Env-drift gate counts any process.env read
// in the repo as an undeclared var (regression rule 8, MEH-1539 precedent).
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const CATEGORIES = [
  { id: 1, name: "חלב וגבינות" },
  { id: 2, name: "לחמים ואפייה" },
  { id: 3, name: "דבש" },
];

// Three producers spread far enough apart that a flyTo is visually obvious.
const PRODUCERS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "מחלבת הגליל",
    slug: "machlevet-hagalil",
    city: "ראש פינה",
    lat: 32.9686,
    lng: 35.5425,
    categories: [{ id: 1, name: "חלב וגבינות" }],
    is_approved: true,
    is_verified: true,
    has_physical_location: true,
    location_precision: "exact",
    images: [],
    avg_rating: 4.8,
    reviews_count: 12,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "מאפיית רוח השדה",
    slug: "ruach-hasade",
    city: "פרדס חנה",
    lat: 32.4751,
    lng: 34.9776,
    categories: [{ id: 2, name: "לחמים ואפייה" }],
    is_approved: true,
    is_verified: false,
    has_physical_location: true,
    location_precision: "exact",
    images: [],
    avg_rating: 4.6,
    reviews_count: 8,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "כוורת הנגב",
    slug: "kaveret-hanegev",
    city: "עומר",
    lat: 31.2589,
    lng: 34.8519,
    categories: [{ id: 3, name: "דבש" }],
    is_approved: true,
    is_verified: true,
    has_physical_location: true,
    location_precision: "exact",
    images: [],
    avg_rating: 4.9,
    reviews_count: 21,
  },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const results = [];

  for (const [label, width, height] of [
    ["375", 375, 812],
    ["1440", 1440, 1000],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      locale: "he-IL",
      timezoneId: "Asia/Jerusalem",
      reducedMotion: "reduce",
    });

    // MEH-1539 gotcha: the "**/api/**" glob does not match here — use "**/*"
    // plus an explicit URL check.
    await ctx.route("**/*", async (route) => {
      const url = route.request().url();
      if (!url.includes("/api/")) return route.continue();
      const path = new URL(url).pathname.replace(/^\/api/, "");
      const body =
        path === "/producers" ? PRODUCERS
        : path === "/categories" ? CATEGORIES
        : [];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.addInitScript(() => {
      try {
        // Value must be "all" | "essential" (CookieBanner.jsx:11) — the same
        // neutralisation parity.spec.ts:128 uses. A wrong value leaves the
        // banner up, and it intercepts pointer events at z-1100.
        localStorage.setItem("cookieConsent", "essential");
      } catch {}
    });

    // localePrefix "as-needed": /he/map serves at the bare /map path.
    await page.goto(`${BASE}/map`, { waitUntil: "networkidle" });
    // The page renders both a mobile and a desktop Leaflet container; only one
    // is visible per breakpoint, so scope every map assertion to :visible.
    // The pane itself has a zero-size box (Leaflet transforms it), so it never
    // matches :visible — scope it through the visible container instead.
    const mapBox = page.locator(".leaflet-container:visible").first();
    await mapBox.waitFor({ state: "visible", timeout: 20_000 });
    // Let tiles + markers settle.
    await page.waitForTimeout(2500);

    // Resolve the pane to a HANDLE, not a locator: clicking a card expands the
    // mobile sheet, after which the ":visible" container no longer matches and
    // a locator would re-query into a timeout. A handle keeps pointing at the
    // same DOM node, which is exactly what we want to diff.
    const mapPane = await mapBox.locator(".leaflet-map-pane").first().elementHandle();

    const markers = await page.locator(".leaflet-marker-icon:visible").count();
    await page.screenshot({ path: `${OUT}/map-${label}-1-loaded.png`, fullPage: false });

    // --- the LIVE imperative path (useMapSync.js:125) ---
    // Tapping a card while on /map calls mapApi.focusProducer(id), which does
    // flyTo([lat,lng], 14) — MapComponent.jsx:392. The pane transform is a poor
    // probe (Leaflet renormalises it after a zoom settles), so read the ZOOM
    // straight off the tile URLs: OSM tiles are /{z}/{x}/{y}.png, and the z
    // segment is authoritative regardless of whether the image actually loads
    // (the sandbox has no outbound tile access — src is still set).
    const readZoom = () =>
      page.evaluate(() => {
        const tile = document.querySelector(".leaflet-tile");
        const m = tile?.getAttribute("src")?.match(/\/(\d+)\/\d+\/\d+(\.png|@2x)/);
        return m ? Number(m[1]) : null;
      });

    const beforeZoom = await readZoom();
    const beforeTransform = await mapPane.getAttribute("style");

    // Same dual-render caveat as the map container: scope to :visible.
    const cards = page.locator('[data-testid="map-card"]:visible');
    const card = cards.first();
    const cardCount = await cards.count();
    let afterTransform = beforeTransform;
    let clicked = "none";
    if (cardCount > 0) {
      await card.scrollIntoViewIfNeeded();
      // At 375px the collapsed bottom sheet puts the first card under three
      // z-1000 floats (BottomNav pill, near-me pill, the sheet's drag handle),
      // so a hit-tested tap can't reach it. That overlap is a pre-existing
      // layout property, not what this ticket changes — so try a real tap and
      // fall back to dispatching the event straight at the card. Either way the
      // React onClick → useMapSync focusProducer path is what gets exercised.
      try {
        await card.click({ position: { x: 40, y: 16 }, timeout: 4000 });
        clicked = "tap";
      } catch {
        await card.dispatchEvent("click");
        clicked = "dispatched";
      }
      // useMapSync defers the focusProducer call by 250ms; flyTo animates.
      await page.waitForTimeout(2500);
      afterTransform = await mapPane.getAttribute("style");
    }
    const afterZoom = await readZoom();
    await page.screenshot({ path: `${OUT}/map-${label}-2-card-focused.png`, fullPage: false });

    results.push({
      label,
      markers,
      cardCount,
      clicked,
      beforeZoom,
      afterZoom,
      // focusProducer flies to zoom 14 (MapComponent.jsx:392).
      flewToZoom14: afterZoom === 14 && beforeZoom !== 14,
      recentred: beforeTransform !== afterTransform,
      pageErrors: pageErrors.length,
    });

    await ctx.close();
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
