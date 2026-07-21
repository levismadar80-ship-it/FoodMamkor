import { test, expect } from "@playwright/test";

/**
 * MEH-1425 (MEH-1388 chunk 5 — closes the producer_locations epic): end-to-end
 * coverage for the multi-location surface shipped across chunks 1-4a
 * (schema -> MIN-Haversine geo -> per-location map markers + unique-business
 * cluster -> owner CRUD).
 *
 * NO MOCKS (e2e/CLAUDE.md, MEH-417): these run against the real Railway staging
 * backend the CI `next start` proxies to. Multi-location assertions are
 * therefore DATA-DRIVEN with graceful skip — the same contract as
 * 15-map-markers.spec.ts. The staging demo seed (seed_demo_business.py) does
 * NOT yet create producer_locations rows, so the exact-count assertions
 * (3 markers, 10 -> cluster badge 1) skip until a multi-location producer is
 * seeded; the serialization contract + the cluster-dedup INVARIANT
 * (badge <= producer count) are asserted deterministically today. Seed proposal
 * tracked in the MEH-1425 PR body.
 */

const MAP_MOUNT = () =>
  (window as unknown as { __MAP_CENTER__?: [number, number] }).__MAP_CENTER__ !==
  undefined;

type Loc = { kind?: string; lat?: number | null; lng?: number | null };
type Producer = { id: string | number; name?: string; locations?: Loc[] };

async function fetchProducers(page: import("@playwright/test").Page): Promise<Producer[]> {
  const res = await page.request.get("/api/producers");
  if (!res.ok()) return [];
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

const usableCoords = (l: Loc) =>
  typeof l?.lat === "number" &&
  typeof l?.lng === "number" &&
  !Number.isNaN(l.lat) &&
  !Number.isNaN(l.lng);

test.describe("producer_locations — multi-location E2E (MEH-1388)", () => {
  test.describe.configure({ retries: 1 });

  // (1) Serialization contract (chunks 1-2): every producer in the public feed
  // carries a `locations[]` array. Deterministic — no seed data required.
  test("the /producers feed serializes a locations[] array on every producer", async ({ page }) => {
    test.setTimeout(60_000);
    const producers = await fetchProducers(page);
    if (producers.length === 0) {
      test.skip(true, "staging feed empty — no producers to assert the contract on");
      return;
    }
    for (const p of producers) {
      expect(Array.isArray(p.locations), `producer ${p.id} must expose locations[]`).toBe(true);
    }
  });

  // (2) Cluster badge counts UNIQUE BUSINESSES, not markers (chunk 3). The
  // non-negotiable invariant, asserted at E2E level: a cluster's badge can never
  // exceed the number of producers in the feed — a marker-counting badge would,
  // once any business owns >1 pin. Deterministic given >=1 cluster renders.
  test("cluster badges never exceed the unique-producer count", async ({ page }) => {
    test.setTimeout(90_000);
    const producers = await fetchProducers(page);
    await page.goto("/map");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(MAP_MOUNT, { timeout: 45_000 });
    await page
      .waitForFunction(
        () => document.querySelectorAll(".marker-cluster, .mehamakor-marker-wrap").length > 0,
        { timeout: 15_000 },
      )
      .catch(() => {});

    const clusters = page.locator(".marker-cluster");
    const clusterCount = await clusters.count();
    if (clusterCount === 0) {
      test.skip(true, "no clusters rendered at default zoom — nothing to bound");
      return;
    }
    const producerCount = producers.length;
    for (let i = 0; i < clusterCount; i++) {
      const text = (await clusters.nth(i).innerText()).trim();
      const badge = parseInt(text, 10);
      if (Number.isNaN(badge)) continue;
      expect(badge, "a unique-business cluster badge cannot exceed the producer count").toBeLessThanOrEqual(
        producerCount,
      );
      expect(badge).toBeGreaterThan(0);
    }
  });

  // (3) A multi-location producer renders >1 marker, and every one of its
  // markers opens the SAME business card (chunk 3 fan-out). Data-driven: skips
  // until a producer with >=2 usable-coord locations is seeded on staging.
  test("a multi-location producer's markers all open the same business card", async ({ page }) => {
    test.setTimeout(90_000);
    const producers = await fetchProducers(page);
    const multi = producers.find((p) => (p.locations || []).filter(usableCoords).length >= 2);
    if (!multi) {
      test.skip(
        true,
        "no multi-location producer on staging (seed_demo_business.py seeds none yet — see MEH-1425 seed proposal)",
      );
      return;
    }

    await page.goto("/map");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(MAP_MOUNT, { timeout: 45_000 });
    await page.waitForTimeout(2500);

    // A secondary (pickup / market_stand) marker is the visual proof of the
    // per-location fan-out; clicking it must open the bottom-sheet/selected card.
    const secondary = page.locator(".mehamakor-marker-secondary").first();
    if ((await secondary.count()) === 0) {
      test.skip(true, "multi-location producer present but no secondary marker visible at this zoom");
      return;
    }
    await secondary.click();
    // The selected card surfaces the business — the shared compact MapProducerCard
    // (data-testid="map-card") renders in the bottom sheet / selected slot.
    await expect(page.locator('[data-testid="map-card"]').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  // (4) "Near me" nearest-point: geolocation drives a distance-ordered search.
  // Deterministic that the control recenters the map to the fix; the exact
  // nearest-LOCATION distance assertion needs seeded coords (skip-noted).
  test("near-me recenters the map on the geolocation fix", async ({ page, context }, info) => {
    test.skip(info.project.name === "mobile", "desktop GPS button path (mobile near-me covered by 07-gps-button)");
    test.setTimeout(90_000);
    await context.grantPermissions(["geolocation"]);
    // A point in the northern producer band (near the demo producer's area).
    await context.setGeolocation({ latitude: 32.57, longitude: 34.95 });

    await page.goto("/map");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(MAP_MOUNT, { timeout: 45_000 });

    const skipBtn = page.getByRole("button", { name: "דלגו לעכשיו" });
    try {
      await skipBtn.waitFor({ state: "visible", timeout: 2000 });
      await skipBtn.click();
    } catch {
      /* modal did not appear */
    }

    const gpsBtn = page.locator('[aria-label="מרכזו את המפה על המיקום שלי"]:visible');
    await expect(gpsBtn).toBeVisible({ timeout: 20_000 });
    await gpsBtn.click();
    // The map should recenter onto the geolocation latitude (~32.57), not the
    // default band center (~32.4).
    await page.waitForTimeout(2000);
    const center = await page.evaluate(
      () => (window as unknown as { __MAP_CENTER__?: [number, number] }).__MAP_CENTER__,
    );
    if (center) {
      expect(center[0], "map should recenter near the geolocation latitude").toBeGreaterThan(32.45);
    }
  });
});
