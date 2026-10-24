import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

// MEH-2281: unit coverage for the homepage mini-map, measured at 0/58
// statements by the MEH-1980 gap report. Playwright sees the happy path; what
// this file owns is the Leaflet INIT path that the E2E cannot discriminate:
// the MEH-604 deferral (nothing fetched before the 200ms floor; the rIC branch
// vs the direct branch), exactly one MapContainer mount, the no-coordinates
// fallback, the API-failure fallback, and a clean unmount (timer cleared, map
// listener detached). Leaflet + react-leaflet are stubbed at the module
// boundary — the stub shape is lifted from MiniMap.test.jsx (MEH-1659); this
// file deliberately does NOT read the real bundle the way
// leaflet-inline-writers.test.js does, that is a different concern.

const apiMock = vi.hoisted(() => {
  const state = { producers: [], error: null };
  return {
    state,
    get: vi.fn(() =>
      state.error ? Promise.reject(state.error) : Promise.resolve({ data: state.producers }),
    ),
  };
});
vi.mock("@/lib/api", () => ({ default: apiMock }));

const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }) => (
    <a href={typeof href === "string" ? href : "#"} {...p}>
      {children}
    </a>
  ),
}));

// Every <MapContainer> that mounts registers a stub here, in mount order, and
// the stub RECORDS what the component did to it (gesture handlers, Leaflet
// event bindings, fitBounds calls). REUSES: __tests__/MiniMap.test.jsx:37.
const leafletStubs = vi.hoisted(() => ({ maps: [] }));

vi.mock("react-leaflet", async () => {
  const { createContext, useContext, useState } = await vi.importActual("react");
  const MapStubContext = createContext(null);
  const makeHandler = () => {
    const handler = {
      enabled: null,
      enable() {
        handler.enabled = true;
      },
      disable() {
        handler.enabled = false;
      },
    };
    return handler;
  };
  const makeMapStub = () => ({
    fitBoundsCalls: [],
    fitBounds(bounds, opts) {
      this.fitBoundsCalls.push({ bounds, opts });
    },
    dragging: makeHandler(),
    touchZoom: makeHandler(),
    doubleClickZoom: makeHandler(),
    scrollWheelZoom: makeHandler(),
    listeners: {},
    on(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    },
    off(type, fn) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
    },
  });
  const MapContainer = ({ children, zoomControl, attributionControl, zoom, center }) => {
    const [stub] = useState(() => {
      const created = makeMapStub();
      leafletStubs.maps.push(created);
      return created;
    });
    return (
      <div
        data-testid="map"
        data-zoom-control={String(zoomControl)}
        data-attribution-control={String(attributionControl)}
        data-zoom={String(zoom)}
        data-center={Array.isArray(center) ? center.join(",") : String(center)}
      >
        <MapStubContext.Provider value={stub}>{children}</MapStubContext.Provider>
      </div>
    );
  };
  return {
    MapContainer,
    TileLayer: ({ attribution }) => <div data-testid="tile-layer" data-attribution={attribution} />,
    Marker: ({ children, title, icon, position, eventHandlers }) => (
      <div
        data-testid="marker"
        data-title={title}
        data-position={position.join(",")}
        data-icon-class={icon?.options?.className ?? ""}
        data-has-click={String(Boolean(eventHandlers?.click))}
      >
        {children}
      </div>
    ),
    Tooltip: ({ children, direction }) => (
      <div data-testid="tooltip" data-direction={String(direction)}>
        {children}
      </div>
    ),
    useMap: () => useContext(MapStubContext),
  };
});

vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet", () => ({
  default: {
    divIcon: (o) => ({ options: o }),
    latLngBounds: (latlngs) => ({ latlngs }),
  },
}));

import HomepageMiniMap from "@/components/HomepageMiniMap";

const M = he.map.homepage_mini;

const withPrimary = (id, name, lat, lng, extra = {}) => ({
  id,
  name,
  categories: [{ name: "מאפייה", slug: "bakery" }],
  locations: [{ lat, lng, kind: "branch", is_primary: true }],
  ...extra,
});

const PLOTTABLE = [
  withPrimary("a", "מאפיית השכונה", 32.08, 34.78),
  withPrimary("b", "מחלבת הגליל", 32.96, 35.5),
  // Primary row present but a pickup is listed first — primaryPoint must pick
  // the is_primary row, not the first usable one (STRICT, 02/09).
  {
    id: "c",
    name: "יקב ההר",
    categories: [],
    locations: [
      { lat: 31.0, lng: 35.0, kind: "pickup", is_primary: false },
      { lat: 31.77, lng: 35.21, kind: "branch", is_primary: true },
    ],
  },
];

const NOT_PLOTTABLE = [
  // no locations at all
  { id: "d", name: "ללא מיקום", categories: [] },
  // usable row but not primary — STRICT drops it
  { id: "e", name: "רק נקודת איסוף", locations: [{ lat: 32.0, lng: 34.8, kind: "pickup", is_primary: false }] },
  // primary row with unusable coordinates
  { id: "f", name: "קואורדינטות שבורות", locations: [{ lat: NaN, lng: 34.8, kind: "branch", is_primary: true }] },
];

function renderMap() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <HomepageMiniMap />
    </NextIntlClientProvider>,
  );
}

const mapEl = () => screen.queryByTestId("map");

// MEH-2297: the map container div renders before the async Leaflet init has
// built the map and run its setup (zoom handlers disabled, canvas click
// bound). Waiting for the div alone raced that setup on slow runners
// ("Target cannot be null" at the unmount case, "expected null to be false"
// at the init-path case). Wait for the last thing the init binds — the
// canvas click listener — which implies the stub exists and setup ran.
async function waitForMapReady() {
  await waitFor(() => expect(mapEl()).toBeInTheDocument(), { timeout: 3000 });
  await waitFor(() => expect(leafletStubs.maps[0]?.listeners.click).toHaveLength(1), { timeout: 3000 });
}

describe("HomepageMiniMap — MEH-604 deferral + mount (MEH-2281)", () => {
  beforeEach(() => {
    apiMock.state.producers = [];
    apiMock.state.error = null;
    apiMock.get.mockClear();
    routerMock.push.mockClear();
    leafletStubs.maps.length = 0;
    delete globalThis.requestIdleCallback;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.requestIdleCallback;
  });

  it("renders the skeleton and issues NO fetch before the 200ms floor; after it, GET /producers fires exactly once", async () => {
    vi.useFakeTimers();
    renderMap();
    expect(screen.getByText(M.loading)).toBeInTheDocument();
    expect(screen.getByTestId("home-minimap")).toHaveAttribute("aria-label", M.aria);
    await act(async () => {
      vi.advanceTimersByTime(199);
    });
    expect(apiMock.get).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(apiMock.get).toHaveBeenCalledTimes(1);
    expect(apiMock.get).toHaveBeenCalledWith("/producers");
  });

  it("when requestIdleCallback exists, the load is chained through it (not fired from the timer directly)", async () => {
    vi.useFakeTimers();
    const idle = [];
    globalThis.requestIdleCallback = vi.fn((cb) => {
      idle.push(cb);
      return 1;
    });
    renderMap();
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(globalThis.requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(apiMock.get).not.toHaveBeenCalled();
    await act(async () => {
      idle[0]();
    });
    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });

  it("with plottable producers: exactly ONE MapContainer, one marker per primary point (pickup-first order resolved to the primary row), tile attribution present", async () => {
    apiMock.state.producers = PLOTTABLE;
    renderMap();
    await waitForMapReady();
    expect(screen.getAllByTestId("map")).toHaveLength(1);
    expect(leafletStubs.maps).toHaveLength(1);
    const markers = screen.getAllByTestId("marker");
    expect(markers).toHaveLength(3);
    expect(markers.map((m) => m.dataset.title)).toEqual(["מאפיית השכונה", "מחלבת הגליל", "יקב ההר"]);
    expect(markers[2].dataset.position).toBe("31.77,35.21");
    expect(markers[0].dataset.iconClass).toBe("mehamakor-homepage-preview-marker");
    expect(markers[0].dataset.hasClick).toBe("true");
    expect(screen.getByTestId("tile-layer").dataset.attribution).toContain("openstreetmap.org/copyright");
    expect(mapEl().dataset.attributionControl).toBe("true");
    expect(mapEl().dataset.zoomControl).toBe("false");
    expect(screen.queryByText(M.loading)).toBeNull();
    expect(screen.queryByText(M.pre_launch_hint)).toBeNull();
  });

  it("the Leaflet init path: non-click zoom disabled, dragging untouched, canvas click bound to /map, fitBounds once with the padding + maxZoom cap", async () => {
    apiMock.state.producers = PLOTTABLE;
    renderMap();
    await waitForMapReady();
    const map = leafletStubs.maps[0];
    expect(map.scrollWheelZoom.enabled).toBe(false);
    expect(map.touchZoom.enabled).toBe(false);
    expect(map.doubleClickZoom.enabled).toBe(false);
    expect(map.dragging.enabled).toBeNull();
    expect(map.fitBoundsCalls).toHaveLength(1);
    expect(map.fitBoundsCalls[0].bounds.latlngs).toEqual([
      [32.08, 34.78],
      [32.96, 35.5],
      [31.77, 35.21],
    ]);
    expect(map.fitBoundsCalls[0].opts).toEqual({ padding: [40, 40], maxZoom: 11 });
    expect(map.listeners.click).toHaveLength(1);
    act(() => {
      map.listeners.click[0]();
    });
    expect(routerMock.push).toHaveBeenCalledWith("/map");
  });

  it("no plottable coordinates → the pre-launch fallback, and no MapContainer", async () => {
    apiMock.state.producers = NOT_PLOTTABLE;
    renderMap();
    await waitFor(() => expect(screen.getByText(M.pre_launch_hint)).toBeInTheDocument(), { timeout: 3000 });
    expect(mapEl()).toBeNull();
    expect(leafletStubs.maps).toHaveLength(0);
    expect(screen.queryByText(M.loading)).toBeNull();
  });

  it("GET /producers failure → the same fallback, not a stuck skeleton", async () => {
    apiMock.state.error = new Error("network");
    renderMap();
    await waitFor(() => expect(screen.getByText(M.pre_launch_hint)).toBeInTheDocument(), { timeout: 3000 });
    expect(mapEl()).toBeNull();
  });

  it("a non-array payload is treated as empty (rule 19 — never iterate an unknown shape)", async () => {
    apiMock.state.producers = { detail: "unexpected" };
    renderMap();
    await waitFor(() => expect(screen.getByText(M.pre_launch_hint)).toBeInTheDocument(), { timeout: 3000 });
    expect(mapEl()).toBeNull();
  });

  it("the full-map CTA links to /map in every state", async () => {
    renderMap();
    expect(screen.getByRole("link", { name: M.open_full })).toHaveAttribute("href", "/map");
  });
});

describe("HomepageMiniMap — unmount", () => {
  beforeEach(() => {
    apiMock.state.producers = PLOTTABLE;
    apiMock.state.error = null;
    apiMock.get.mockClear();
    leafletStubs.maps.length = 0;
    delete globalThis.requestIdleCallback;
  });
  afterEach(() => vi.useRealTimers());

  it("unmounting before the floor clears the timer: no fetch ever fires", async () => {
    vi.useFakeTimers();
    const { unmount } = renderMap();
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(apiMock.get).not.toHaveBeenCalled();
  });

  it("unmounting a mounted map detaches the canvas click listener it bound", async () => {
    const { unmount } = renderMap();
    await waitForMapReady();
    const map = leafletStubs.maps[0];
    unmount();
    expect(map.listeners.click).toHaveLength(0);
    expect(mapEl()).toBeNull();
  });
});
