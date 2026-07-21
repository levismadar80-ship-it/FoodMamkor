/**
 * MEH-1424 — /map load-perf regression guards for the MEH-1412 marker fan-out.
 *
 * Locks the three load-path invariants the perf fix must preserve, plus the
 * fix itself:
 *   1. marker count == renderable locations (a producer's locations[] rows
 *      each get exactly one marker);
 *   2. NO duplicate producer.lat/lng pin when locations[] has a usable row
 *      (the fallback is exclusive — firing it alongside the fan-out would
 *      both double-pin and inflate marker totals);
 *   3. the cluster badge still counts UNIQUE businesses (dedup by
 *      marker.producerId), not raw markers;
 *   4. (the MEH-1424 fix) markers reach the cluster group via ONE bulk
 *      addLayers() call — never per-marker addLayer(), which re-runs the
 *      subtree-walking iconCreateFunction per add and made the load O(N²).
 *
 * Leaflet is stubbed (repo convention — MapGeolocationPersist.test.jsx /
 * MapSsrFallback.test.jsx: real Leaflet never mounts under jsdom); the stub
 * here additionally records marker() calls and the cluster group's
 * addLayer/addLayers traffic so the invariants are observable.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import MapComponent from "@/components/MapComponent";

vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));

// Instrumented chainable Leaflet stub. `recorder` is hoisted via vi.hoisted so
// the mock factory (hoisted by vitest) and the tests share one object.
const recorder = vi.hoisted(() => ({
  markers: [], // one entry per L.marker() call: { latlng, marker }
  addLayerCalls: 0, // singular adds on the cluster group (must stay 0)
  addLayersBatches: [], // arrays passed to bulk addLayers
  iconCreateFunction: null, // captured from markerClusterGroup options
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
      on: () => marker,
      setIcon: () => marker,
      getLatLng: () => ({ lat: latlng[0], lng: latlng[1] }),
      getElement: () => null,
    };
    return marker;
  };
  return {
    default: {
      map: () => makeStub(),
      tileLayer: () => makeStub(),
      markerClusterGroup: (opts = {}) => {
        recorder.iconCreateFunction = opts.iconCreateFunction || null;
        const group = makeStub();
        // Shadow the proxy's generic no-ops with recording variants.
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
        return group;
      },
      marker: (latlng) => {
        const m = makeMarker(latlng);
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

const multiLocationProducer = {
  id: "p-multi",
  name: "עסק מרובה נקודות",
  lat: 32.1,
  lng: 34.9,
  locations: [
    { kind: "branch", label: "סניף", lat: 32.1, lng: 34.9, is_primary: true, precision: "exact" },
    { kind: "pickup", label: "איסוף א", lat: 32.12, lng: 34.92, is_primary: false, precision: "exact" },
    { kind: "market_stand", label: "דוכן", lat: 32.14, lng: 34.94, is_primary: false, precision: "approximate" },
  ],
};
const emptyLocationsProducer = {
  id: "p-empty",
  name: "עסק בלי שורות מיקום",
  lat: 31.8,
  lng: 35.2,
  locations: [],
};

describe("MEH-1424 — marker fan-out load invariants", () => {
  beforeEach(() => {
    recorder.markers.length = 0;
    recorder.addLayerCalls = 0;
    recorder.addLayersBatches.length = 0;
    recorder.iconCreateFunction = null;
  });

  it("creates one marker per renderable location — and NO duplicate producer pin when locations[] is non-empty", () => {
    render(<MapComponent producers={[multiLocationProducer]} />);
    // 3 usable location rows → exactly 3 markers; the p.lat/lng fallback must
    // NOT fire on top of them (that would be 4 and a double pin at 32.1/34.9).
    expect(recorder.markers).toHaveLength(3);
    const atProducerPoint = recorder.markers.filter(
      (m) => m.latlng[0] === 32.1 && m.latlng[1] === 34.9,
    );
    expect(atProducerPoint).toHaveLength(1); // the primary row only, not row+fallback
  });

  it("falls back to the producer's own point ONLY when locations[] is empty", () => {
    render(<MapComponent producers={[emptyLocationsProducer]} />);
    expect(recorder.markers).toHaveLength(1);
    expect(recorder.markers[0].latlng).toEqual([31.8, 35.2]);
  });

  it("cluster badge counts unique businesses, not markers", () => {
    render(<MapComponent producers={[multiLocationProducer, emptyLocationsProducer]} />);
    expect(typeof recorder.iconCreateFunction).toBe("function");
    // Fake cluster containing all 4 markers (3 fan-out + 1 fallback) — the
    // badge must read 2 (unique producerIds), not 4.
    const allMarkers = recorder.markers.map((m) => m.marker);
    expect(allMarkers).toHaveLength(4);
    const icon = recorder.iconCreateFunction({
      getAllChildMarkers: () => allMarkers,
      getChildCount: () => allMarkers.length,
    });
    expect(icon.__divIcon.html).toContain(">2<");
    expect(icon.__divIcon.html).not.toContain(">4<");
  });

  it("adds markers via ONE bulk addLayers() call — never per-marker addLayer (the O(N²) load path)", () => {
    render(<MapComponent producers={[multiLocationProducer, emptyLocationsProducer]} />);
    expect(recorder.addLayerCalls).toBe(0);
    expect(recorder.addLayersBatches).toHaveLength(1);
    expect(recorder.addLayersBatches[0]).toHaveLength(4);
  });
});
