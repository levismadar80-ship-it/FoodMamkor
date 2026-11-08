/**
 * MEH-2843 — on a phone the «?» map key rides the sheet edge at `end-4` and,
 * in rtl, sat on Leaflet's zoom «−». The mobile-shell map in rtl moves the
 * zoom to the top-right corner (one control per corner, MEH-2776); ltr and the
 * desktop shell keep the default. The map API's panBy is a programmatic move.
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

/** MapComponent mounted the way MapClient mounts it: inside a shell, under a dir. */
const mountIn = ({ shell, dir }, props = {}) => {
  const host = document.createElement("div");
  host.setAttribute("dir", dir);
  const shellEl = document.createElement("div");
  shellEl.setAttribute("data-map-shell", shell);
  host.appendChild(shellEl);
  document.body.appendChild(host);
  return render(<MapComponent producers={[]} {...props} />, { container: shellEl });
};

describe("map zoom control corner (MEH-2843)", () => {
  // The «?» key + layers toggle sit at `end-4` in the MOBILE shell: physical
  // left in rtl (on the zoom's «−»), physical right in ltr (clear of it).
  it("mobile shell, rtl: the zoom moves to the top-right corner, away from the «?» key", () => {
    viewport(false);
    mountIn({ shell: "mobile", dir: "rtl" });
    expect(zoom.setPosition).toHaveBeenCalledWith("topright");
  });

  it("mobile shell, ltr (/en): the key is already on the right, so the zoom keeps the top-left", () => {
    viewport(false);
    mountIn({ shell: "mobile", dir: "ltr" });
    expect(zoom.setPosition).not.toHaveBeenCalled();
  });

  // Decided per instance, not from the viewport: both shells mount at once,
  // and a rotation across 1024px shows the other one with its own corner.
  it("desktop shell keeps Leaflet's default corner even when mounted on a narrow viewport", () => {
    viewport(false);
    mountIn({ shell: "desktop", dir: "rtl" });
    expect(zoom.setPosition).not.toHaveBeenCalled();
  });

  it("mobile shell moves the zoom even when mounted on a wide viewport", () => {
    viewport(true);
    mountIn({ shell: "mobile", dir: "rtl" });
    expect(zoom.setPosition).toHaveBeenCalledWith("topright");
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
    mountIn({ shell: "mobile", dir: "rtl" }, { registerApi: (a) => { api = a; }, onMapMove });
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

  it("a zero offset is skipped (nothing to move) and the next user move still raises the banner", () => {
    const { api, onMapMove } = mount();
    api.panBy([0, 0], { animate: true });
    expect(leafletMap.panBy).not.toHaveBeenCalled();
    leafletMap.handlers.moveend();
    expect(onMapMove).toHaveBeenCalledTimes(1);
  });
});
