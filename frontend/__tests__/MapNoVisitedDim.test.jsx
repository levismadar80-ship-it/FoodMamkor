/**
 * MEH-2423 — a business the reader already opened is NOT greyed out on the map.
 *
 * MEH-14 / MEH-1277 drew a recently-viewed business's pin in grayscale at 0.7
 * opacity. On a 36px circle that read as "closed / inactive" (Sapir's iPhone
 * screenshots, 27/10), and nothing on the page explained it. The whole
 * visitedIds chain is gone; this pins the behaviour: with the producer in the
 * recently-viewed store AND passed the old prop, no icon the map draws carries
 * a grayscale filter or the 0.7 dim.
 *
 * Leaflet is stubbed per repo convention (MapMarkerColorEscape.test.jsx).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import MapComponent from "@/components/MapComponent";
import { useFirstVisitHints } from "@/app/[locale]/map/state/useFirstVisitHints";

vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));
vi.mock("@/lib/marker-glyph", () => ({ categoryGlyphSvg: () => "<svg></svg>" }));
vi.mock("@/lib/recently-viewed", () => ({ getRecentlyViewedIds: () => ["p-1"] }));

const recorder = vi.hoisted(() => ({ icons: [] }));

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
      marker: (latlng, opts = {}) => {
        recorder.icons.push(opts.icon);
        const m = {
          latlng,
          on: () => m,
          setIcon: (icon) => {
            recorder.icons.push(icon);
            return m;
          },
          getLatLng: () => ({ lat: latlng[0], lng: latlng[1] }),
          getElement: () => null,
        };
        return m;
      },
      circleMarker: () => makeStub(),
      divIcon: (o) => ({ __divIcon: o }),
    },
  };
});
vi.mock("leaflet-defaulticon-compatibility", () => ({}));
vi.mock("leaflet.markercluster", () => ({}));

const producer = {
  id: "p-1",
  name: "עסק שנצפה",
  lat: 32.0853,
  lng: 34.7818,
  locations: [{ kind: "branch", is_primary: true, lat: 32.0853, lng: 34.7818, precision: "exact" }],
  images: [],
  categories: [{ name: "ירקות ופירות" }],
};

function iconHtml() {
  return recorder.icons.filter(Boolean).map((i) => i.__divIcon?.html ?? "");
}

describe("recently viewed business on the map (MEH-2423)", () => {
  beforeEach(() => {
    recorder.icons.length = 0;
  });

  it("draws the pin at full colour even when the old visitedIds prop is passed", () => {
    render(<MapComponent producers={[producer]} visitedIds={new Set(["p-1"])} />);
    const html = iconHtml();
    // Control: the stub actually captured the pin, so an empty list can't pass.
    expect(html.length).toBeGreaterThan(0);
    for (const h of html) {
      expect(h).not.toMatch(/grayscale/);
      expect(h).not.toMatch(/opacity:\s*0\.7/);
    }
  });

  it("the map's hint state no longer carries a visited list", () => {
    const { result } = renderHook(() => useFirstVisitHints());
    expect(result.current).not.toHaveProperty("visitedIds");
  });
});
