/**
 * MEH-3824 — the offer mark is drawn on whatever pin stands for the business:
 * its branch pin, or, for a business with no branch, its pickup point or
 * market stand (mapPinPoints gives it that point as its one pin). Read off the
 * divIcon HTML of the LIVE layer set; Leaflet stubbed as in
 * MapOnePinPerBusiness.test.jsx.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import MapComponent from "@/components/MapComponent";

vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));

// `layers` = everything on the map (cluster group + the selected business's own
// layer); `clusterCalls` = cluster-group traffic after mount, which selection
// must never cause (it unspiderfies and can re-cluster the clicked pin).
const live = vi.hoisted(() => ({ layers: new Set(), clusterCalls: 0 }));

vi.mock("leaflet", () => {
  const makeStub = () => {
    const base = {
      whenReady: (fn) => {
        if (fn) fn();
        return proxy;
      },
      getBounds: () => ({ getNorth: () => 0, getSouth: () => 0, getEast: () => 0, getWest: () => 0 }),
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
  const makeMarker = (latlng, opts) => {
    const marker = {
      latlng,
      icon: opts?.icon ?? null,
      on: () => marker,
      bindTooltip: () => marker, // MEH-3066: the name label beside the pin
      setIcon: (icon) => {
        marker.icon = icon;
        return marker;
      },
      getLatLng: () => ({ lat: latlng[0], lng: latlng[1] }),
      getElement: () => null,
    };
    return marker;
  };
  const group = () => {
    const g = makeStub();
    Object.defineProperty(g, "addLayers", {
      value: (layers) => {
        live.clusterCalls += 1;
        layers.forEach((l) => live.layers.add(l));
        return g;
      },
    });
    Object.defineProperty(g, "removeLayers", {
      value: (layers) => {
        live.clusterCalls += 1;
        layers.forEach((l) => live.layers.delete(l));
        return g;
      },
    });
    Object.defineProperty(g, "clearLayers", {
      value: () => {
        live.layers.clear();
        return g;
      },
    });
    return g;
  };
  const plainLayer = () => {
    const own = new Set();
    const lg = {
      addTo: () => lg,
      addLayer: (m) => {
        own.add(m);
        live.layers.add(m);
        return lg;
      },
      clearLayers: () => {
        own.forEach((m) => live.layers.delete(m));
        own.clear();
        return lg;
      },
    };
    return lg;
  };
  return {
    default: {
      layerGroup: plainLayer,
      map: () => makeStub(),
      tileLayer: () => makeStub(),
      markerClusterGroup: group,
      marker: (latlng, opts) => makeMarker(latlng, opts),
      circleMarker: () => makeStub(),
      divIcon: (o) => ({ __divIcon: o }),
    },
  };
});
vi.mock("leaflet-defaulticon-compatibility", () => ({}));
vi.mock("leaflet.markercluster", () => ({}));

const row = (kind, lat) => ({ kind, lat, lng: 35, precision: "exact", is_primary: kind === "branch" });
const BRANCH = { id: "branch", name: "סניף", has_open_group_buy: true, locations: [row("branch", 30.0)] };
const STAND = { id: "stand", name: "דוכן", has_physical_location: false, has_open_group_buy: true, locations: [row("market_stand", 31.0)] };
const PICKUP = { id: "pickup", name: "איסוף", has_physical_location: false, has_open_group_buy: true, locations: [row("pickup", 32.0)] };
const NONE = { id: "none", name: "בלי", has_physical_location: false, locations: [row("pickup", 33.0)] };
const ALL = [BRANCH, STAND, PICKUP, NONE];

const markOf = (id) => {
  const pins = [...live.layers].filter((m) => m.producerId === id);
  expect(pins).toHaveLength(1);
  const m = /data-offer-mark="([a-z_]+)"/.exec(pins[0].icon.__divIcon.html);
  return m ? m[1] : null;
};

beforeEach(() => {
  live.layers.clear();
  live.clusterCalls = 0;
});

describe("MEH-3824 — offer mark on every kind of pin", () => {
  it("switch on: the branch pin, the market-stand pin and the pickup pin of a matching business are all marked", () => {
    render(<MapComponent producers={ALL} focusedProducerId={null} offerMarks={["group_buy"]} />);
    expect(markOf("branch")).toBe("group_buy");
    expect(markOf("stand")).toBe("group_buy");
    expect(markOf("pickup")).toBe("group_buy");
    expect(markOf("none")).toBeNull();
  });

  it("switch off: no pin is marked", () => {
    render(<MapComponent producers={ALL} focusedProducerId={null} offerMarks={[]} />);
    for (const id of ["branch", "stand", "pickup", "none"]) expect(markOf(id)).toBeNull();
  });
});
