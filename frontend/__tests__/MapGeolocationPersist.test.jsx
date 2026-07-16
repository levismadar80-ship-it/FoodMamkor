/**
 * MEH-1230 — GPS success must persist the user's location fix.
 *
 * Regression: no code path ever wrote `user_location` to sessionStorage, so
 * the /map "מרחק" sort option stayed permanently disabled and card distance
 * labels never rendered. MapComponent.goToMyLocation (the shared imperative
 * path behind the filter-bar crosshair + the NearMePill) now calls
 * setUserLocation on a valid fix. lib/user-location itself is covered by
 * userLocation.test.js — this asserts the HANDLER actually invokes it.
 *
 * Leaflet is stubbed (the repo intentionally never mounts real Leaflet under
 * jsdom — see MapSsrFallback.test.jsx): a chainable Proxy satisfies the map
 * init effect + goToMyLocation without a browser canvas.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import MapComponent from "@/components/MapComponent";
import { STORAGE_KEY, EVENT_NAME } from "@/lib/user-location";

vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));

// Chainable no-op Leaflet stub: every method returns the same instance so the
// init effect's fluent calls (setView/addTo/addLayer/on/flyTo/…) resolve, while
// whenReady/getBounds/getContainer return the shapes the effect reads.
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
  return {
    default: {
      map: () => makeStub(),
      tileLayer: () => makeStub(),
      markerClusterGroup: () => makeStub(),
      marker: () => makeStub(),
      circleMarker: () => makeStub(),
      divIcon: () => ({}),
    },
  };
});
// Side-effect plugin imports — no-op under jsdom.
vi.mock("leaflet-defaulticon-compatibility", () => ({}));
vi.mock("leaflet.markercluster", () => ({}));

function mockGeolocation(coords) {
  const getCurrentPosition = vi.fn((success) => success({ coords }));
  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition },
    configurable: true,
  });
  return getCurrentPosition;
}

describe("MEH-1230 — GPS success persists user_location", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("writes user_location + dispatches the sync event on a valid fix", () => {
    mockGeolocation({ latitude: 31.78, longitude: 35.21 });
    const eventListener = vi.fn();
    window.addEventListener(EVENT_NAME, eventListener);

    let api = null;
    render(
      <MapComponent
        producers={[]}
        registerApi={(a) => {
          if (a) api = a;
        }}
      />,
    );
    expect(api).not.toBeNull();

    act(() => {
      api.goToMyLocation(vi.fn(), vi.fn());
    });

    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY))).toEqual({
      lat: 31.78,
      lng: 35.21,
    });
    expect(eventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(EVENT_NAME, eventListener);
  });

  it("does NOT persist an invalid (falsy/NaN) fix", () => {
    mockGeolocation({ latitude: 0, longitude: NaN });

    let api = null;
    render(
      <MapComponent
        producers={[]}
        registerApi={(a) => {
          if (a) api = a;
        }}
      />,
    );

    act(() => {
      api.goToMyLocation(vi.fn(), vi.fn());
    });

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(null);
  });
});
