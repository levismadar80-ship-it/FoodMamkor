/**
 * MEH-2767: home and /producers count their chip gates on the unfiltered
 * catalog from lib/use-catalog-snapshot.js (one GET /producers). Component
 * specs mock that hook with this, so the snapshot is the fixture the spec
 * renders — not an extra api call the spec's own api mock has to answer.
 *
 *   vi.mock("@/lib/use-catalog-snapshot", async () =>
 *     (await import("./helpers/catalog-snapshot")).catalogSnapshotMock);
 *
 * Default status is "failed" = no gating, so a spec that is not about gates
 * sees every chip. A gate spec calls setCatalogSnapshot(fixture) before render.
 */
export const snapshotState = { catalog: null, status: "failed" };

export function setCatalogSnapshot(catalog) {
  snapshotState.catalog = catalog;
  snapshotState.status = "ready";
}

export function resetCatalogSnapshot() {
  snapshotState.catalog = null;
  snapshotState.status = "failed";
}

export const catalogSnapshotMock = {
  useCatalogSnapshot: () => ({ catalog: snapshotState.catalog, status: snapshotState.status }),
  resetCatalogSnapshotCache: () => {},
};
