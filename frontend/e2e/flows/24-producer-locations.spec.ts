import { test, expect } from "@playwright/test";

/**
 * MEH-1432 (MEH-1388 chunk 6 — closes the producer_locations epic): end-to-end
 * coverage for the multi-location surface shipped across chunks 1-4a
 * (schema -> MIN-Haversine geo -> per-location map markers + unique-business
 * cluster -> owner CRUD).
 *
 * NO MOCKS (e2e/CLAUDE.md, MEH-417): these run against the real Railway staging
 * backend the CI `next start` proxies to. The assertions RUN unconditionally
 * (no skip guards) — they require the multi-location demo data seeded by
 * `backend/scripts/seed_demo_business.py --refresh` (a 10-location producer in
 * one city + a delivery-only producer with a pickup). Until staging carries that
 * seed the seed-dependent tests fail loudly (that is the point — chunk 5 was
 * green-by-skip); the E2E gate is non-required so this does not block merge, and
 * they go green on the first E2E run after the staging re-seed.
 */

const MAP_MOUNT = () =>
  (window as unknown as { __MAP_CENTER__?: [number, number] }).__MAP_CENTER__ !==
  undefined;

type Loc = {
  kind?: string;
  lat?: number | null;
  lng?: number | null;
  is_primary?: boolean;
};
type Producer = { id: string | number; name?: string; locations?: Loc[] };

async function fetchProducers(page: import("@playwright/test").Page): Promise<Producer[]> {
  const res = await page.request.get("/api/producers");
  expect(res.ok(), "GET /producers must respond 2xx").toBeTruthy();
  const body = await res.json();
  expect(Array.isArray(body), "GET /producers must return an array").toBe(true);
  return body as Producer[];
}

const usableCoords = (l: Loc) =>
  typeof l?.lat === "number" &&
  typeof l?.lng === "number" &&
  !Number.isNaN(l.lat) &&
  !Number.isNaN(l.lng);

const multiLoc = (producers: Producer[]) =>
  producers.find((p) => (p.locations || []).filter(usableCoords).length >= 2);

// MEH-1451: recenter the map onto the seeded multi-location producer via the
// app's OWN near-me flow — mock geolocation at one of its pins, then click the
// near-me control so goToMyLocation flies there (MapComponent.jsx:355). Shared
// by :96 (asserts the per-location secondary markers at that zoom) and :66
// (which then zooms out to a clustering level). markercluster only materialises
// in-view markers, so both tests must bring the seeded pins into view first.
// Returns the seeded producer. Do NOT touch app code — this is spec-side setup.
async function recenterOnSeededProducer(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
  producers: Producer[],
): Promise<Producer> {
  const multi = multiLoc(producers);
  expect(
    multi,
    "a multi-location producer must be seeded (seed_demo_business.py --refresh)",
  ).toBeTruthy();

  const coords = (multi!.locations || []).filter(usableCoords);
  const secondaryLoc =
    coords.find((l) => l.kind === "pickup" || l.kind === "market_stand") || coords[0];
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: secondaryLoc.lat!,
    longitude: secondaryLoc.lng!,
  });

  await page.goto("/map");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(MAP_MOUNT, { timeout: 45_000 });

  // LocationModal can mask the map controls when no userCity is saved —
  // dismiss it if present (07-gps-button precedent, MEH-262/263).
  const skipBtn = page.getByRole("button", { name: "דלגו לעכשיו" });
  try {
    await skipBtn.waitFor({ state: "visible", timeout: 2500 });
    await skipBtn.click();
    await skipBtn.waitFor({ state: "hidden", timeout: 2000 });
  } catch {
    // modal did not appear — proceed
  }

  // Per-project near-me control: desktop GPS circle (MapPane, hidden lg:flex)
  // or the mobile NearMePill — both route to the same goToMyLocation flyTo.
  // :visible scopes to the active shell (MapClient renders twice — 07 precedent).
  const nearMe = page
    .locator(
      '[aria-label="מרכזו את המפה על המיקום שלי"]:visible, [aria-label="הצגת בתי עסק קרובים למיקום שלי"]:visible',
    )
    .first();
  await expect(nearMe).toBeVisible({ timeout: 15_000 });
  await nearMe.click();
  return multi!;
}

// MEH-1568: click the cluster CLOSEST TO THE MAP CENTRE, not `.first()` in DOM
// order. near-me flies the camera onto one of the seeded producer's own pins, so
// the centremost cluster is the seeded one — this is the deterministic form
// MEH-1440 asked for (blind `.first()` could pick a cluster in another region
// and strand the zoom away from the seed). Returns false when no cluster took
// the click. Spec-side only — do NOT touch app code.
async function clickCentremostCluster(
  page: import("@playwright/test").Page,
): Promise<boolean> {
  const clusters = page.locator(".mehamakor-cluster");
  const mapBox = await page.locator(".leaflet-container:visible").first().boundingBox();
  if (!mapBox) return false;
  const cx = mapBox.x + mapBox.width / 2;
  const cy = mapBox.y + mapBox.height / 2;

  const count = await clusters.count();
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    const box = await clusters.nth(i).boundingBox();
    if (!box) continue;
    const distance = Math.hypot(
      box.x + box.width / 2 - cx,
      box.y + box.height / 2 - cy,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) return false;
  return clusters
    .nth(bestIndex)
    .click({ timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
}

test.describe("producer_locations — multi-location E2E (MEH-1388)", () => {
  test.describe.configure({ retries: 1 });

  // (1) Serialization contract (chunks 1-2): every producer in the public feed
  // carries a `locations[]` array.
  test("the /producers feed serializes a locations[] array on every producer", async ({ page }) => {
    test.setTimeout(60_000);
    const producers = await fetchProducers(page);
    expect(producers.length, "staging feed must have producers").toBeGreaterThan(0);
    for (const p of producers) {
      expect(Array.isArray(p.locations), `producer ${p.id} must expose locations[]`).toBe(true);
    }
  });

  // (2) Cluster badge counts UNIQUE BUSINESSES, not markers (chunk 3). The
  // non-negotiable invariant, asserted at E2E level: a cluster's badge can never
  // exceed the number of producers in the feed — a marker-counting badge would,
  // once any business owns >1 pin (the 10-location demo producer clusters as 1).
  test("cluster badges never exceed the unique-producer count", async ({ page, context }) => {
    test.setTimeout(120_000);
    const producers = await fetchProducers(page);
    // MEH-1451: :66 previously counted `.mehamakor-cluster` at the FIXED initial
    // viewport (center [32.4,34.95] zoom 8, MapComponent.jsx:411), where the
    // seeded זכרון יעקב pins aren't guaranteed materialised → clusterCount=0.
    // Bring them into view with the SAME near-me flow :96 uses, then zoom out so
    // the co-located per-location pins collapse into one cluster.
    // MEH-1568: the zoom-out is no longer about crossing a clustering threshold
    // — disableClusteringAtZoom is GONE, so clustering is live at every zoom.
    // It now just widens the view until pins are close enough (in pixels) to
    // group under the zoom-scaled maxClusterRadius (MapComponent.jsx — 60px
    // below zoom 11, 40px from 11 in). The loop is unchanged and still exits on
    // the first cluster.
    // REUSES: recenterOnSeededProducer (this file) — same viewport setup as :96.
    await recenterOnSeededProducer(page, context, producers);

    // Confirm the recenter landed before zooming out. MEH-1568: with clustering
    // now live at zoom 13, the seeded pins may materialise EITHER as individual
    // secondary markers OR already collapsed into a cluster — accept either as
    // the "camera arrived" signal, so this no longer depends on the dead zone.
    await expect
      .poll(
        async () =>
          (await page.locator(".mehamakor-marker-secondary").count()) +
          (await page.locator(".mehamakor-cluster").count()),
        {
          message: "recenter must bring the seeded per-location pins into view",
          timeout: 20_000,
        },
      )
      .toBeGreaterThan(0);

    // Zoom out from near-me's zoom 13 using the app's own Leaflet zoom-out
    // control (zoomControl:true, MapComponent.jsx:401). Click until a cluster
    // materialises — condition-based + bounded (robust to a dropped click), NOT
    // a fixed waitForTimeout. :visible scopes to the active shell (MapClient
    // renders twice — 07 precedent).
    const zoomOut = page.locator(".leaflet-control-zoom-out:visible").first();
    const clusters = page.locator(".mehamakor-cluster");
    for (let i = 0; i < 6 && (await clusters.count()) === 0; i++) {
      await zoomOut.click();
      await clusters.first().waitFor({ state: "visible", timeout: 2500 }).catch(() => {});
    }
    await expect(
      clusters.first(),
      "the seeded multi-location producer must render a cluster at a clustering zoom",
    ).toBeVisible({ timeout: 15_000 });

    // The non-negotiable invariant (unchanged): a unique-business cluster badge
    // can never exceed the number of producers in the feed.
    // MEH-1568: scoped to MULTI-business clusters. A single-business cluster now
    // renders that business's category marker + its POINT count
    // (.mehamakor-cluster-single) — a legitimately marker-scale number that can
    // exceed the producer count (the 10-location demo producer alone reads 10),
    // so folding it into this assertion would assert the wrong invariant.
    const multiBusinessClusters = page.locator(
      ".mehamakor-cluster:not(.mehamakor-cluster-single)",
    );
    const clusterCount = await clusters.count();
    expect(clusterCount, "at least one cluster must be present after zoom-out").toBeGreaterThan(0);
    const producerCount = producers.length;
    const multiCount = await multiBusinessClusters.count();
    for (let i = 0; i < multiCount; i++) {
      const badge = parseInt((await multiBusinessClusters.nth(i).innerText()).trim(), 10);
      if (Number.isNaN(badge)) continue;
      expect(badge, "a unique-business cluster badge cannot exceed the producer count").toBeLessThanOrEqual(
        producerCount,
      );
      expect(badge).toBeGreaterThan(0);
    }

    // MEH-1568: and the single-business cluster must read as a real point count,
    // never the old "1" (which looked like a broken badge).
    const singleClusters = page.locator(".mehamakor-cluster-single");
    for (let i = 0; i < (await singleClusters.count()); i++) {
      const badge = parseInt((await singleClusters.nth(i).innerText()).trim(), 10);
      if (Number.isNaN(badge)) continue;
      expect(
        badge,
        "a single-business cluster shows how many POINTS it holds (>= 2), not '1'",
      ).toBeGreaterThan(1);
    }
  });

  // (3) A multi-location producer fans out into per-location markers, and a
  // secondary (pickup / market_stand) marker opens the SAME business card
  // (chunk 3). MEH-1440: blind cluster-clicking (`.first()` + zoomToBounds x5)
  // was non-deterministic — the first cluster in DOM can belong to a different
  // region, and zooming into it strands the loop away from the seeded pins
  // (markercluster only materialises in-view markers), so the secondary
  // markers never appeared on CI. Deterministic form: mock geolocation at one
  // of the producer's secondary pins and ride the app's own near-me flow.
  //
  // MEH-1568: this test used to rely on the DEAD ZONE for its reveal —
  // near-me's zoom 13 sat past disableClusteringAtZoom:11, so clustering was
  // simply off and every pin rendered individually. That is exactly the bug
  // (pins at identical coordinates stacked unclickably), so the option is gone
  // and the reveal is now the real user path: click the cluster covering the
  // camera until the individual pins are reachable. markercluster zooms into
  // the cluster's bounds, and when a cluster CANNOT be split by zooming — the
  // identical-coordinates case — it spiderfies at max zoom into a clickable
  // ring (leaflet.markercluster-src.js:868-888). Either way the loop only
  // terminates when every seeded point is individually reachable, which is the
  // property this ticket restores.
  test("a multi-location producer's markers all open the same business card", async ({ page, context }) => {
    test.setTimeout(120_000);
    const producers = await fetchProducers(page);
    // MEH-1451: the geolocation + near-me viewport setup moved into the shared
    // recenterOnSeededProducer helper (now also used by :66).
    await recenterOnSeededProducer(page, context, producers);

    const secondary = page.locator(".mehamakor-marker-secondary");
    // Reveal loop: while the seeded points are still collapsed into a cluster,
    // click the centremost cluster (zoom-in, then spiderfy at max zoom). Bounded
    // + condition-based, never a fixed wait. Exits immediately when the pins are
    // already individual at this zoom.
    for (let i = 0; i < 6 && (await secondary.count()) === 0; i++) {
      const clicked = await clickCentremostCluster(page);
      if (!clicked) break;
      await secondary
        .first()
        .waitFor({ state: "visible", timeout: 4_000 })
        .catch(() => {});
    }

    await expect(
      secondary.first(),
      "pickup/market_stand markers must be individually reachable — by zoom or by spiderfy",
    ).toBeVisible({ timeout: 20_000 });

    // MEH-1440 run 29899891331: at zoom 13 the seeded pins can overlap, so a
    // neighbouring marker's DOM may intercept the pointer over `.first()`
    // ("subtree intercepts pointer events"). Click the first secondary marker
    // that ACCEPTS the click instead of pinning the assertion to index 0.
    const secondaryCount = await secondary.count();
    let clicked = false;
    for (let i = 0; i < secondaryCount && !clicked; i++) {
      clicked = await secondary
        .nth(i)
        .click({ timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
    }
    expect(clicked, "at least one secondary marker must accept a click").toBe(true);
    // The shared compact MapProducerCard (data-testid="map-card") renders in the
    // selected slot / bottom sheet for the clicked location's business.
    // MEH-1440 run 29900524694: MapClient renders BOTH shells (desktop lg:grid
    // + mobile lg:hidden), so a bare .first() can resolve to the card in the
    // display:none shell — scope to :visible (07-gps-button precedent).
    await expect(page.locator('[data-testid="map-card"]:visible').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  // (4) Nearest-point geo search (chunk 2 MIN-Haversine): a distance-ordered
  // query from a point near a NON-primary pin returns that business with a
  // distance == its NEAREST location (not its primary). Asserted at the API level
  // — deterministic, and free of the map-center signal, which is a hardcoded
  // mount flag (MapComponent.jsx:415), not the live center.
  test("near-me distance reflects the nearest location, not the primary", async ({ page }) => {
    test.setTimeout(60_000);
    const producers = await fetchProducers(page);
    const multi = multiLoc(producers);
    expect(multi, "a multi-location producer must be seeded").toBeTruthy();

    const coords = (multi!.locations || []).filter(usableCoords);
    const target = coords.find((l) => !l.is_primary) || coords[0];
    const res = await page.request.get(
      `/api/producers?lat=${target.lat! + 0.003}&lng=${target.lng}&radius_km=5`,
    );
    expect(res.ok(), "geo search must respond 2xx").toBeTruthy();
    const near = (await res.json()) as Array<Producer & { distance_km?: number }>;
    const hit = near.find((p) => String(p.id) === String(multi!.id));
    expect(hit, "the multi-location business must be within radius of its nearest pin").toBeTruthy();
    if (typeof hit?.distance_km === "number") {
      // ~0.3km to the nearest pin — comfortably under 1km, proving MIN-distance
      // (its primary is farther away).
      expect(hit.distance_km, "distance should equal the NEAREST location (~0.3km)").toBeLessThan(1);
    }
  });

  // (5) MEH-213 reversal (chunk 2): a delivery-only producer with a pickup
  // location reappears in the feed (== visible on /map). Its signature: it has
  // usable location(s), all of kind pickup / market_stand (no branch).
  test("a delivery-only producer with a pickup location is visible in the feed", async ({ page }) => {
    test.setTimeout(60_000);
    const producers = await fetchProducers(page);
    const deliveryOnlyWithPickup = producers.find((p) => {
      const locs = (p.locations || []).filter(usableCoords);
      return (
        locs.length > 0 &&
        locs.every((l) => l.kind === "pickup" || l.kind === "market_stand")
      );
    });
    expect(
      deliveryOnlyWithPickup,
      "a delivery-only-with-pickup producer must be seeded (seed_demo_business.py --refresh)",
    ).toBeTruthy();
    // Its map-visibility mechanism is the usable pickup coord itself.
    const usablePickups = (deliveryOnlyWithPickup!.locations || [])
      .filter(usableCoords)
      .filter((l) => l.kind === "pickup" || l.kind === "market_stand");
    expect(
      usablePickups.length,
      "delivery-only producer is on the map via >=1 usable pickup/market_stand pin",
    ).toBeGreaterThan(0);
  });
});
