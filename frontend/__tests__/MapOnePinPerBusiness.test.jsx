/**
 * MEH-3054 (option ה׳, Sapir 13/11) — one pin per business on /map.
 *
 * Cells (pickup points per business 0 / 1 / many × selected or not × «איסוף
 * עצמי» chip on or off), read off the LIVE layer set of a stubbed cluster
 * group: what is on the map, not how many markers were ever built.
 *
 * Leaflet is stubbed (repo convention, see MapFocusOnSelect.test.jsx).
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

const row = (kind, lat, extra = {}) => ({ kind, lat, lng: 35, precision: "exact", is_primary: false, ...extra });

// many: one branch + three pickup points.
const MANY = {
  id: "many",
  name: "שלוש נקודות איסוף",
  locations: [row("branch", 32.0, { is_primary: true }), row("pickup", 32.1), row("pickup", 32.2), row("market_stand", 32.3)],
};
// one: one branch + one pickup point.
const ONE = { id: "one", name: "נקודת איסוף אחת", locations: [row("branch", 31.0, { is_primary: true }), row("pickup", 31.1)] };
// zero: a branch only.
const ZERO = { id: "zero", name: "בלי נקודות איסוף", locations: [row("branch", 30.0, { is_primary: true })] };
// pickup-only: no branch at all (has_physical_location false).
const PICKUP_ONLY = {
  id: "pickup-only",
  name: "רק נקודות איסוף",
  has_physical_location: false,
  locations: [row("pickup", 29.0), row("pickup", 29.1)],
};
const ALL = [MANY, ONE, ZERO, PICKUP_ONLY];

const pinsOf = (id) => [...live.layers].filter((m) => m.producerId === id).map((m) => m.latlng[0]).sort();

beforeEach(() => {
  live.layers.clear();
  live.clusterCalls = 0;
});

describe("MEH-3054 — chip off, nothing selected", () => {
  it("draws one pin per business: the branch, or the first point of a pickup-only business", () => {
    render(<MapComponent producers={ALL} focusedProducerId={null} />);
    expect(pinsOf("many")).toEqual([32.0]);
    expect(pinsOf("one")).toEqual([31.0]);
    expect(pinsOf("zero")).toEqual([30.0]);
    expect(pinsOf("pickup-only")).toEqual([29.0]);
    expect(live.layers.size).toBe(4);
  });
});

describe("MEH-3054 — chip off, a business selected", () => {
  it("many: adds all of its points, and only its", () => {
    const { rerender } = render(<MapComponent producers={ALL} focusedProducerId={null} />);
    rerender(<MapComponent producers={ALL} focusedProducerId="many" />);
    expect(pinsOf("many")).toEqual([32.0, 32.1, 32.2, 32.3]);
    expect(pinsOf("one")).toEqual([31.0]);
    expect(pinsOf("pickup-only")).toEqual([29.0]);
  });

  it("selecting and deselecting never touches the cluster group", () => {
    const { rerender } = render(<MapComponent producers={ALL} focusedProducerId={null} />);
    const afterMount = live.clusterCalls;
    rerender(<MapComponent producers={ALL} focusedProducerId="many" />);
    rerender(<MapComponent producers={ALL} focusedProducerId="one" />);
    rerender(<MapComponent producers={ALL} focusedProducerId={null} />);
    expect(live.clusterCalls).toBe(afterMount);
  });

  it("one: adds its single pickup point", () => {
    const { rerender } = render(<MapComponent producers={ALL} focusedProducerId={null} />);
    rerender(<MapComponent producers={ALL} focusedProducerId="one" />);
    expect(pinsOf("one")).toEqual([31.0, 31.1]);
  });

  it("zero: nothing to add", () => {
    const { rerender } = render(<MapComponent producers={ALL} focusedProducerId={null} />);
    rerender(<MapComponent producers={ALL} focusedProducerId="zero" />);
    expect(pinsOf("zero")).toEqual([30.0]);
    expect(live.layers.size).toBe(4);
  });

  it("pickup-only: its other point appears, the stand-in pin is not doubled", () => {
    const { rerender } = render(<MapComponent producers={ALL} focusedProducerId={null} />);
    rerender(<MapComponent producers={ALL} focusedProducerId="pickup-only" />);
    expect(pinsOf("pickup-only")).toEqual([29.0, 29.1]);
  });

  it("the added points carry the focus flag", () => {
    const { rerender } = render(<MapComponent producers={ALL} focusedProducerId={null} />);
    rerender(<MapComponent producers={ALL} focusedProducerId="many" />);
    const mine = [...live.layers].filter((m) => m.producerId === "many");
    expect(mine).toHaveLength(4);
    expect(mine.every((m) => m.icon.__divIcon.className.includes("mehamakor-marker-focused"))).toBe(true);
  });

  it("switching selection takes the previous business's points away", () => {
    const { rerender } = render(<MapComponent producers={ALL} focusedProducerId="many" />);
    expect(pinsOf("many")).toHaveLength(4);
    rerender(<MapComponent producers={ALL} focusedProducerId="one" />);
    expect(pinsOf("many")).toEqual([32.0]);
    expect(pinsOf("one")).toEqual([31.0, 31.1]);
  });

  it("deselect returns to one pin per business", () => {
    const { rerender } = render(<MapComponent producers={ALL} focusedProducerId="many" />);
    rerender(<MapComponent producers={ALL} focusedProducerId={null} />);
    expect(live.layers.size).toBe(4);
  });

  it("a refetch while selected keeps the selected business's points", () => {
    const { rerender } = render(<MapComponent producers={ALL} focusedProducerId="many" />);
    rerender(<MapComponent producers={[...ALL]} focusedProducerId="many" />);
    expect(pinsOf("many")).toEqual([32.0, 32.1, 32.2, 32.3]);
    expect(live.layers.size).toBe(7);
  });
});

describe("MEH-3054 — «איסוף עצמי» chip on", () => {
  it("draws every business's points, selected or not", () => {
    render(<MapComponent producers={ALL} showAllPickupPoints focusedProducerId={null} />);
    expect(pinsOf("many")).toHaveLength(4);
    expect(pinsOf("one")).toHaveLength(2);
    expect(pinsOf("zero")).toHaveLength(1);
    expect(pinsOf("pickup-only")).toHaveLength(2);
  });

  it("selecting adds nothing on top (no duplicate pins)", () => {
    const { rerender } = render(<MapComponent producers={ALL} showAllPickupPoints focusedProducerId={null} />);
    rerender(<MapComponent producers={ALL} showAllPickupPoints focusedProducerId="many" />);
    expect(live.layers.size).toBe(9);
  });

  it("turning the chip off while selected keeps the selected business expanded", () => {
    const { rerender } = render(<MapComponent producers={ALL} showAllPickupPoints focusedProducerId="many" />);
    rerender(<MapComponent producers={ALL} showAllPickupPoints={false} focusedProducerId="many" />);
    expect(pinsOf("many")).toHaveLength(4);
    expect(pinsOf("one")).toEqual([31.0]);
  });
});
