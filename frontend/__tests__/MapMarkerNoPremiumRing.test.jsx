/**
 * MEH-2519 — no "premium" gold ring on map pins.
 *
 * MapComponent drew a 6px gold ring for `plan === "premium"`. Nothing can set a
 * plan to premium, and a paid visual boost would contradict the site's promise
 * that there is no paid promotion. The ring is gone, so a premium-plan pin is
 * byte-identical to a free one.
 *
 * Leaflet is stubbed as in MapMarkerColorEscape.test.jsx.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import MapComponent from "@/components/MapComponent";

vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));

vi.mock("@/lib/marker-glyph", () => ({ categoryGlyphSvg: () => "<svg></svg>" }));

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

const base = {
  id: "p-1",
  name: "עסק בדיקה",
  lat: 32.0853,
  lng: 34.7818,
  locations: [{ kind: "branch", is_primary: true, lat: 32.0853, lng: 34.7818, precision: "exact" }],
  images: [],
  categories: [{ name: "ירקות, פירות ומשקים" }],
};

function markerHtml(producer) {
  recorder.icons.length = 0;
  render(<MapComponent producers={[producer]} />);
  const html = recorder.icons.filter(Boolean).map((i) => i.__divIcon?.html ?? "");
  cleanup();
  return html;
}

describe("MEH-2519 — map pins carry no premium ring", () => {
  beforeEach(() => {
    recorder.icons.length = 0;
  });

  it("a premium-plan pin renders exactly like a free-plan pin", () => {
    const free = markerHtml({ ...base, plan: "free" });
    const premium = markerHtml({ ...base, plan: "premium" });
    // Guard the guard: an empty list would make the comparison vacuous.
    expect(free.length).toBeGreaterThan(0);
    expect(premium).toEqual(free);
  });

  it("no pin draws the 6px gold ring", () => {
    for (const html of markerHtml({ ...base, plan: "premium" })) {
      expect(html).not.toContain("0 0 0 6px");
    }
  });
});
