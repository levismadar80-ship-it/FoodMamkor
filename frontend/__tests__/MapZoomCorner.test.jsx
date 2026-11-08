/**
 * MEH-2843 — on a phone the «?» map key rides the sheet edge in the top-start
 * corner and sat on Leaflet's zoom «−». The zoom moves to the top-right corner
 * on a phone (one control per corner, MEH-2776); desktop keeps the default.
 * Leaflet is stubbed (repo convention — MapMarkerFanOut.test.jsx).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));

const zoom = vi.hoisted(() => ({ setPosition: null }));
// The stub map's own panBy, and the handlers MapComponent registers with on().
const leafletMap = vi.hoisted(() => ({ panBy: null, handlers: {} }));
vi.mock("leaflet", () => {
  const makeStub = (extra = {}) => {
    const base = {
      whenReady: (fn) => { if (fn) fn(); return proxy; },
      getBounds: () => ({ getNorth: () => 0, getSouth: () => 0, getEast: () => 0, getWest: () => 0 }),
      getContainer: () => document.createElement("div"),
      ...extra,
    };
    const proxy = new Proxy(base, { get: (t, p) => (p in t ? t[p] : () => proxy) });
    return proxy;
  };
  return {
    default: {
      map: () => {
        const m = makeStub({
          zoomControl: { setPosition: (...a) => zoom.setPosition(...a) },
          panBy: (...a) => leafletMap.panBy(...a),
          getCenter: () => ({ lat: 32, lng: 35 }),
          getZoom: () => 12,
          on: (ev, fn) => { leafletMap.handlers[ev] = fn; return m; },
        });
        return m;
      },
      tileLayer: () => makeStub(),
      markerClusterGroup: () => makeStub(),
      marker: () => makeStub(),
      circleMarker: () => makeStub(),
      divIcon: (o) => ({ __divIcon: o }),
    },
  };
});
vi.mock("leaflet-defaulticon-compatibility", () => ({}));
vi.mock("leaflet.markercluster", () => ({}));

import MapComponent from "@/components/MapComponent";

const viewport = (desktop) => {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: q.includes("min-width: 1024px") ? desktop : false,
    media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
  }));
};

beforeEach(() => {
  zoom.setPosition = vi.fn();
  leafletMap.panBy = vi.fn();
  leafletMap.handlers = {};
});

describe("map zoom control corner (MEH-2843)", () => {
  it("phone: the zoom moves to the top-right corner, away from the «?» key", () => {
    viewport(false);
    render(<MapComponent producers={[]} />);
    expect(zoom.setPosition).toHaveBeenCalledWith("topright");
  });

  it("desktop (lg+): the zoom keeps Leaflet's default corner", () => {
    viewport(true);
    render(<MapComponent producers={[]} />);
    expect(zoom.setPosition).not.toHaveBeenCalled();
  });
});

// MapClient lifts a tapped marker clear of the phone sheet through the map
// API's panBy. That move is ours: its moveend must not raise «חפשו באזור זה»
// (at 375×667 a raw map.panBy did). A later move by the visitor still must.
describe("map API panBy is a programmatic move (MEH-2843)", () => {
  const mount = () => {
    viewport(false);
    let api = null;
    const onMapMove = vi.fn();
    render(<MapComponent producers={[]} registerApi={(a) => { api = a; }} onMapMove={onMapMove} />);
    expect(api?.panBy, "control: the API is registered").toBeTypeOf("function");
    expect(leafletMap.handlers.moveend, "control: moveend is listened to").toBeTypeOf("function");
    return { api, onMapMove };
  };

  it("pans the map and its moveend does not raise «חפשו באזור זה»; the next user move does", () => {
    const { api, onMapMove } = mount();
    api.panBy([0, 40], { animate: true });
    expect(leafletMap.panBy).toHaveBeenCalledWith([0, 40], { animate: true });
    leafletMap.handlers.moveend();
    expect(onMapMove).not.toHaveBeenCalled();
    leafletMap.handlers.moveend(); // the visitor drags afterwards
    expect(onMapMove).toHaveBeenCalledTimes(1);
  });

  it("a zero offset is skipped, so it cannot swallow the visitor's next move", () => {
    const { api, onMapMove } = mount();
    api.panBy([0, 0], { animate: true });
    expect(leafletMap.panBy).not.toHaveBeenCalled();
    leafletMap.handlers.moveend();
    expect(onMapMove).toHaveBeenCalledTimes(1);
  });
});
