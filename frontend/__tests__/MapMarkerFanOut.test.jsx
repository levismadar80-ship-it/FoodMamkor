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
  clusterOptions: null, // MEH-1568: the whole options object, for the dead-zone guards
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
        recorder.clusterOptions = opts;
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
    recorder.clusterOptions = null;
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

/**
 * MEH-1568 — the /map clustering dead-zone.
 *
 * `disableClusteringAtZoom: 11` switched clustering OFF above zoom 11, which
 * also made spiderfy unreachable: markercluster only spiderfies a cluster that
 * survives down to the group's internal _maxZoom, and the option caps that at
 * `disableClusteringAtZoom - 1` (leaflet.markercluster-src.js:868-888, :975-976).
 * Two markers at identical coordinates therefore stacked forever and the lower
 * one was permanently unclickable at EVERY zoom. These guards lock the fix so a
 * future "let's decluster when zoomed in" edit can't silently restore it.
 */
describe("MEH-1568 — cluster dead-zone guards", () => {
  beforeEach(() => {
    recorder.markers.length = 0;
    recorder.addLayerCalls = 0;
    recorder.addLayersBatches.length = 0;
    recorder.iconCreateFunction = null;
    recorder.clusterOptions = null;
  });

  it("never sets disableClusteringAtZoom — clustering (and therefore spiderfy) stays live at every zoom", () => {
    render(<MapComponent producers={[multiLocationProducer]} />);
    expect(recorder.clusterOptions).toBeTruthy();
    expect(recorder.clusterOptions.disableClusteringAtZoom).toBeUndefined();
    // spiderfyOnMaxZoom defaults to true (leaflet.markercluster-src.js:25) —
    // the guard is that we never turn it OFF.
    expect(recorder.clusterOptions.spiderfyOnMaxZoom).not.toBe(false);
    // MEH-1424 semantics preserved: bulk addLayers path stays synchronous.
    expect(recorder.clusterOptions.chunkedLoading).toBe(false);
  });

  it("scales maxClusterRadius by zoom — 60 wide, 40 from zoom 11 in", () => {
    render(<MapComponent producers={[multiLocationProducer]} />);
    const radius = recorder.clusterOptions.maxClusterRadius;
    expect(typeof radius).toBe("function");
    expect(radius(8)).toBe(60);
    expect(radius(10)).toBe(60);
    expect(radius(11)).toBe(40);
    expect(radius(16)).toBe(40);
  });

  it("renders a single-business cluster as the category marker + POINT count, not a badge reading '1'", () => {
    render(<MapComponent producers={[multiLocationProducer]} />);
    // All 3 markers belong to one business — the unique-business count is 1,
    // which is what used to render and looked like a broken badge.
    const ownMarkers = recorder.markers.map((m) => m.marker);
    expect(ownMarkers).toHaveLength(3);
    const icon = recorder.iconCreateFunction({
      getAllChildMarkers: () => ownMarkers,
      getChildCount: () => ownMarkers.length,
    });
    expect(icon.__divIcon.className).toContain("mehamakor-cluster-single");
    // Keeps the base class: globals.css transparent background + the
    // marker-presence E2E locator (15-map-markers.spec.ts:28).
    expect(icon.__divIcon.className).toContain("mehamakor-cluster");
    expect(icon.__divIcon.html).toContain(">3</div>"); // 3 points…
    expect(icon.__divIcon.html).not.toContain(">1</div>"); // …not "1 business"
  });

  it("leaves the multi-business cluster badge untouched (MEH-1412 unique-business count)", () => {
    render(<MapComponent producers={[multiLocationProducer, emptyLocationsProducer]} />);
    const icon = recorder.iconCreateFunction({
      getAllChildMarkers: () => recorder.markers.map((m) => m.marker),
      getChildCount: () => recorder.markers.length,
    });
    expect(icon.__divIcon.className).toBe("mehamakor-cluster");
    expect(icon.__divIcon.className).not.toContain("mehamakor-cluster-single");
    expect(icon.__divIcon.html).toContain(">2<"); // 2 unique businesses, not 4 markers
  });
});
