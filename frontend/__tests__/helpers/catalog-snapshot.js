/**
 * MEH-2767: home and /producers count their chip gates on the unfiltered
 * catalog from lib/use-catalog-snapshot.js (one GET /producers). Component
 * specs mock that hook with this, so the snapshot is the fixture the spec
 * renders — not an extra api call the spec's own api mock has to answer.
 *
 *   vi.mock("@/lib/use-catalog-snapshot", async () =>
 *     (await import("./helpers/catalog-snapshot")).catalogSnapshotMock);
 *
 * Default: a ready snapshot that opens every count gate (five rows carrying
 * every flag), so a spec that is not about gates sees every count-gated chip.
 * (A "failed" default would not do that since MEH-2767's review: a failed
 * snapshot gates on the page's own catalog.) A gate spec calls
 * setCatalogSnapshot(fixture) before render.
 */
const RICH = Array.from({ length: 5 }, (_, i) => ({
  id: `rich-${i}`,
  has_vegan_products: true,
  has_vegetarian_products: true,
  has_gluten_free_products: true,
  has_lactose_free_products: true,
  has_no_added_sugar_products: true,
  sells_on_site: true,
  grass_fed: true,
}));
export const snapshotState = { catalog: RICH, status: "ready" };

export function setCatalogSnapshot(catalog) {
  snapshotState.catalog = catalog;
  snapshotState.status = "ready";
}

export function resetCatalogSnapshot() {
  snapshotState.catalog = RICH;
  snapshotState.status = "ready";
}

export const catalogSnapshotMock = {
  useCatalogSnapshot: () => ({ catalog: snapshotState.catalog, status: snapshotState.status, complete: true }),
  resetCatalogSnapshotCache: () => {},
};
