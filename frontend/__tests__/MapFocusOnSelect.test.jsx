/**
 * MEH-1611 chunk 1 — /map focus-on-select (demote + fitBounds).
 *
 * Locks the four invariants the feature is defined by:
 *   1. demote != remove — the marker population on the map is byte-identical
 *      before and after a selection (0 added, 0 removed, no layer churn);
 *   2. exactly the selected business's pins carry the focus flag, and the
 *      container carries the class the CSS demote hangs off;
 *   3. a business with >= 2 usable points is FRAMED (fitBounds over all of
 *      them, zoom-capped) rather than flown to its primary alone; a
 *      single-point business keeps the old flyTo;
 *   4. deselect restores every pin.
 *
 * Leaflet is stubbed (repo convention — MapMarkerFanOut.test.jsx /
 * MapSsrFallback.test.jsx: real Leaflet never mounts under jsdom). This stub
 * additionally records setIcon traffic and the map's camera calls so the
 * invariants above are observable.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import MapComponent from "@/components/MapComponent";

vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));

const recorder = vi.hoisted(() => ({
  markers: [], // one entry per L.marker() call
  addLayerCalls: 0, // singular adds (must stay 0 — MEH-1424)
  removeLayerCalls: 0, // MEH-1611: demote must never remove a marker
  clearLayersCalls: 0,
  addLayersBatches: [],
  fitBounds: [], // [points, opts]
  flyTo: [], // [latlng, zoom]
}));

vi.mock("leaflet", () => {
  const makeStub = () => {
    const base = {
      whenReady: (fn) => {
        if (fn) fn();
        return proxy;
      },
      getBounds: () => ({
        getNorth: () => 0,
        getSouth: () => 0,
        getEast: () => 0,
        getWest: () => 0,
      }),
      getContainer: () => document.createElement("div"),
      fitBounds: (points, opts) => {
        recorder.fitBounds.push([points, opts]);
        return proxy;
      },
      flyTo: (latlng, zoom) => {
        recorder.flyTo.push([latlng, zoom]);
        return proxy;
      },
    };
    const proxy = new Proxy(base, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return () => proxy;
      },
    });
    return proxy;
  };
  const makeMarker = (latlng) => {
    const marker = {
      latlng,
      // The icon the marker currently carries — this is what Leaflet re-applies
      // to the DOM every time the marker renders out of a cluster, so it is the
      // real carrier of the focus flag.
      icon: null,
      on: () => marker,
      setIcon: (icon) => {
        marker.icon = icon;
        return marker;
      },
      getLatLng: () => ({ lat: latlng[0], lng: latlng[1] }),
      getElement: () => null,
    };
    return marker;
  };
  return {
    default: {
      map: () => makeStub(),
      tileLayer: () => makeStub(),
      markerClusterGroup: () => {
        const group = makeStub();
        Object.defineProperty(group, "addLayer", {
          value: () => {
            recorder.addLayerCalls += 1;
            return group;
          },
        });
        Object.defineProperty(group, "addLayers", {
          value: (layers) => {
            recorder.addLayersBatches.push(Array.isArray(layers) ? layers : []);
            return group;
          },
        });
        Object.defineProperty(group, "removeLayer", {
          value: () => {
            recorder.removeLayerCalls += 1;
            return group;
          },
        });
        Object.defineProperty(group, "removeLayers", {
          value: () => {
            recorder.removeLayerCalls += 1;
            return group;
          },
        });
        Object.defineProperty(group, "clearLayers", {
          value: () => {
            recorder.clearLayersCalls += 1;
            return group;
          },
        });
        return group;
      },
      marker: (latlng, opts = {}) => {
        const m = makeMarker(latlng);
        m.icon = opts.icon ?? null;
        recorder.markers.push({ latlng, marker: m });
        return m;
      },
      circleMarker: () => makeStub(),
      divIcon: (o) => ({ __divIcon: o }),
    },
  };
});
vi.mock("leaflet-defaulticon-compatibility", () => ({}));
vi.mock("leaflet.markercluster", () => ({}));

// The demo-business shape: one branch + several pickup points.
const multiPointProducer = {
  id: "p-multi",
  name: "עסק מרובה נקודות",
  lat: 32.1,
  lng: 34.9,
  locations: [
    { kind: "branch", label: "סניף", lat: 32.1, lng: 34.9, is_primary: true, precision: "exact" },
    { kind: "pickup", label: "איסוף א", lat: 32.12, lng: 34.92, is_primary: false, precision: "exact" },
    { kind: "pickup", label: "איסוף ב", lat: 32.3, lng: 35.1, is_primary: false, precision: "exact" },
  ],
};
const singlePointProducer = {
  id: "p-single",
  name: "עסק נקודה אחת",
  lat: 31.8,
  lng: 35.2,
  locations: [],
};
const otherProducer = {
  id: "p-other",
  name: "עסק אחר",
  lat: 33.0,
  lng: 35.5,
  locations: [],
};

const ALL = [multiPointProducer, singlePointProducer, otherProducer];
// 3 fan-out points + 1 fallback + 1 fallback.
const TOTAL_MARKERS = 5;

const classNameOf = (marker) => marker.icon?.__divIcon?.className ?? "";
const focusedMarkers = () =>
  recorder.markers.filter((m) => classNameOf(m.marker).includes("mehamakor-marker-focused"));

const reset = () => {
  recorder.markers.length = 0;
  recorder.addLayerCalls = 0;
  recorder.removeLayerCalls = 0;
  recorder.clearLayersCalls = 0;
  recorder.addLayersBatches.length = 0;
  recorder.fitBounds.length = 0;
  recorder.flyTo.length = 0;
};

describe("MEH-1611 — focus-on-select demotes, never removes", () => {
  beforeEach(reset);

  it("keeps the marker population identical before and after a selection — exactly 0 removed", () => {
    const { rerender } = render(<MapComponent producers={ALL} focusedProducerId={null} />);
    const before = recorder.markers.length;
    expect(before).toBe(TOTAL_MARKERS);
    // Deltas, not absolutes: mounting the map legitimately builds the layer
    // once (one clearLayers + one bulk addLayers). What must not happen is any
    // further layer traffic when the SELECTION changes.
    const batchesBefore = recorder.addLayersBatches.length;
    const clearsBefore = recorder.clearLayersCalls;

    rerender(<MapComponent producers={ALL} focusedProducerId="p-multi" />);

    // The whole point of the ticket: demote != remove. Nothing leaves the
    // cluster group, nothing is re-added, the group is not wiped and rebuilt.
    expect(recorder.markers).toHaveLength(before);
    expect(recorder.removeLayerCalls).toBe(0);
    expect(recorder.clearLayersCalls).toBe(clearsBefore);
    expect(recorder.addLayersBatches).toHaveLength(batchesBefore);
    // MEH-1424 perf guard still holds — no per-marker layer traffic on select.
    expect(recorder.addLayerCalls).toBe(0);
  });

  it("flags exactly the selected business's own pins, and nobody else's", () => {
    const { rerender } = render(<MapComponent producers={ALL} focusedProducerId={null} />);
    expect(focusedMarkers()).toHaveLength(0);

    rerender(<MapComponent producers={ALL} focusedProducerId="p-multi" />);

    // p-multi owns 3 of the 5 markers; the other 2 belong to other businesses
    // and are the ones the CSS rule fades.
    const focused = focusedMarkers();
    expect(focused).toHaveLength(3);
    expect(focused.every((m) => m.marker.producerId === "p-multi")).toBe(true);
    const demoted = recorder.markers.filter(
      (m) => !classNameOf(m.marker).includes("mehamakor-marker-focused"),
    );
    expect(demoted).toHaveLength(TOTAL_MARKERS - 3);
    expect(demoted.every((m) => m.marker.producerId !== "p-multi")).toBe(true);
  });

  it("puts the demote class on the map container while selected, and takes it off on deselect", () => {
    const { container, rerender } = render(
      <MapComponent producers={ALL} focusedProducerId={null} />,
    );
    // The map container is the component's only rendered node.
    const mapEl = container.firstChild;
    expect(mapEl.classList.contains("mehamakor-map-focused")).toBe(false);

    rerender(<MapComponent producers={ALL} focusedProducerId="p-multi" />);
    expect(mapEl.classList.contains("mehamakor-map-focused")).toBe(true);

    rerender(<MapComponent producers={ALL} focusedProducerId={null} />);
    expect(mapEl.classList.contains("mehamakor-map-focused")).toBe(false);
  });

  it("restores every pin on deselect", () => {
    const { rerender } = render(<MapComponent producers={ALL} focusedProducerId="p-multi" />);
    expect(focusedMarkers().length).toBeGreaterThan(0);

    rerender(<MapComponent producers={ALL} focusedProducerId={null} />);

    expect(focusedMarkers()).toHaveLength(0);
    expect(recorder.markers).toHaveLength(TOTAL_MARKERS);
    expect(recorder.removeLayerCalls).toBe(0);
  });

  it("keeps the selected business focused across a marker rebuild (refetch / layer toggle)", () => {
    const { rerender } = render(<MapComponent producers={ALL} focusedProducerId="p-multi" />);
    reset();
    // A "חפשי באזור זה" refetch hands down a new producers array while the
    // selection is still live — the rebuilt markers must come back focused.
    rerender(
      <MapComponent producers={[...ALL]} focusedProducerId="p-multi" showSecondaryLayer={false} />,
    );
    const focused = focusedMarkers();
    expect(focused.length).toBeGreaterThan(0);
    expect(focused.every((m) => m.marker.producerId === "p-multi")).toBe(true);
  });
});

describe("MEH-1611 — focusProducer frames all of a business's points", () => {
  let api;
  const registerApi = (a) => {
    if (a) api = a;
  };

  beforeEach(() => {
    reset();
    api = null;
  });

  it("fitBounds over ALL usable points when the business has >= 2, zoom-capped", () => {
    render(<MapComponent producers={ALL} registerApi={registerApi} />);
    api.focusProducer("p-multi");

    expect(recorder.flyTo).toHaveLength(0); // not the single-point path
    expect(recorder.fitBounds).toHaveLength(1);
    const [points, opts] = recorder.fitBounds[0];
    // Every one of the business's points is inside the frame — including the
    // far pickup at 32.3/35.1 that the old flyTo-to-primary left off-screen.
    expect(points).toEqual([
      [32.1, 34.9],
      [32.12, 34.92],
      [32.3, 35.1],
    ]);
    expect(opts.maxZoom).toBe(15);
    expect(opts.padding).toEqual([40, 40]);
  });

  it("keeps the existing flyTo for a single-point business", () => {
    render(<MapComponent producers={ALL} registerApi={registerApi} />);
    api.focusProducer("p-single");

    expect(recorder.fitBounds).toHaveLength(0);
    expect(recorder.flyTo).toHaveLength(1);
    expect(recorder.flyTo[0][0]).toEqual([31.8, 35.2]);
    expect(recorder.flyTo[0][1]).toBe(14);
  });

  it("moves the camera without removing or re-adding any marker", () => {
    render(<MapComponent producers={ALL} registerApi={registerApi} />);
    const before = recorder.markers.length;
    api.focusProducer("p-multi");
    expect(recorder.markers).toHaveLength(before);
    expect(recorder.removeLayerCalls).toBe(0);
    expect(recorder.addLayerCalls).toBe(0);
  });
});
