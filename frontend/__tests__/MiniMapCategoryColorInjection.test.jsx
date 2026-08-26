/**
 * MEH-2004 — the category colour cannot inject an attribute into MiniMap's
 * divIcon markup.
 *
 * WHY THIS FILE EXISTS. MEH-1998 put a colour validator inside
 * MapComponent.jsx, which left the two other consumers of the same registry
 * value — MiniMap's `locationIcon` and HomepageMiniMap's `createPreviewMarker`
 * — interpolating it into raw markup with no guard at all. The validator now
 * lives on `styleForProducer` (lib/category-registry.js), so this asserts the
 * property at a consumer that never had its own copy.
 *
 * WHAT MAKES IT A BEHAVIOUR TEST. The assertion reads the PARSED markup and
 * asks what attributes the browser ends up with. It says nothing about which
 * function was called: a fix that swapped the validator for an identity
 * function, or moved it somewhere `locationIcon` does not reach, goes red here
 * — which a "was the escape helper called" spy would not (ADR-032 §3.6).
 *
 * WHY THE REGISTRY IS NOT MOCKED. The validator IS the registry now. A stub
 * standing in for `styleForProducer` would route around the code under test
 * and report the payload landing in the markup however sound the fix is. The
 * hostile colour is therefore planted in the REAL `CATEGORY_STYLES` under a
 * throwaway key and resolved through the REAL resolver — which also models the
 * DB-driven palette this validator was filed for.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { CATEGORY_STYLES, DEFAULT_CATEGORY_STYLE } from "@/lib/category-registry";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

// A double quote is the whole attack: `background:${color}` sits inside a
// style="..." attribute, so a quote closes it and everything after becomes
// sibling attributes on the pin element.
const PAYLOAD = '#fff" onload="alert(1)';
const HOSTILE_CATEGORY = "בדיקה-עוינת";

const recorder = vi.hoisted(() => ({ icons: [] }));

vi.mock("react-leaflet", async () => {
  const { createContext, useContext } = await vi.importActual("react");
  const MapStubContext = createContext(null);
  const mapStub = {
    setView: () => {},
    fitBounds: () => {},
    dragging: { enable: () => {}, disable: () => {} },
    touchZoom: { enable: () => {}, disable: () => {} },
    doubleClickZoom: { enable: () => {}, disable: () => {} },
    scrollWheelZoom: { enable: () => {}, disable: () => {} },
    boxZoom: { enable: () => {}, disable: () => {} },
    keyboard: { enable: () => {}, disable: () => {} },
    on: () => {},
    off: () => {},
  };
  return {
    MapContainer: ({ children }) => (
      <div data-testid="map">
        <MapStubContext.Provider value={mapStub}>{children}</MapStubContext.Provider>
      </div>
    ),
    TileLayer: () => <div data-testid="tile-layer" />,
    Marker: ({ children, icon }) => {
      recorder.icons.push(icon);
      return <div data-testid="marker">{children}</div>;
    },
    Tooltip: ({ children }) => <div data-testid="tooltip">{children}</div>,
    useMap: () => useContext(MapStubContext),
  };
});

vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet", () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: () => {} } },
    divIcon: (options) => ({ options }),
  },
}));

import MiniMap from "@/components/MiniMap";

const producer = {
  id: "p-1",
  name: "עסק בדיקה",
  categories: [{ id: 99, name: HOSTILE_CATEGORY }],
};

const locations = [
  { id: "loc-0", kind: "branch", label: "הסניף", lat: 32.5732, lng: 34.9519, is_primary: true },
  { id: "loc-1", kind: "pickup", label: "איסוף", lat: 32.58, lng: 34.96, is_primary: false },
];

function setCategoryColour(colour) {
  CATEGORY_STYLES[HOSTILE_CATEGORY] = {
    color: colour,
    icon: () => null,
    iconName: "Test",
  };
}

/** Every element the divIcon markup produces, as the browser parses it. */
function pinElements() {
  return recorder.icons.filter(Boolean).flatMap((icon) => {
    const doc = new DOMParser().parseFromString(icon.options?.html ?? "", "text/html");
    return [...doc.body.querySelectorAll("*")];
  });
}

function renderPins() {
  recorder.icons.length = 0;
  render(<MiniMap lat={32.5732} lng={34.9519} name="עסק בדיקה" locations={locations} producer={producer} />);
  const elements = pinElements();
  // Guard the guard: an empty element list satisfies every assertion below,
  // and "the stub recorded nothing" is exactly what a broken harness prints.
  expect(elements.length).toBeGreaterThan(0);
  return elements;
}

describe("MEH-2004 — a hostile category colour injects no attribute into the MiniMap pin", () => {
  afterEach(() => {
    delete CATEGORY_STYLES[HOSTILE_CATEGORY];
  });

  it("plants no event-handler attribute and no attribute beyond style", () => {
    setCategoryColour(PAYLOAD);
    for (const el of renderPins()) {
      const names = [...el.attributes].map((a) => a.name);
      expect(names).not.toContain("onload");
      // The pin's own markup carries `style` and nothing else. Asserting the
      // whole attribute set (rather than just the one name in the payload)
      // means a differently-shaped injection is caught too.
      expect(names.filter((n) => n !== "style" && n !== "fill" && n !== "viewBox")).toEqual([]);
      expect(el.getAttribute("style") ?? "").not.toContain("alert(1)");
    }
  });

  it("degrades the hostile value to the primary token rather than dropping the colour", () => {
    setCategoryColour(PAYLOAD);
    const styles = renderPins().map((el) => el.getAttribute("style") ?? "");
    expect(styles.some((s) => s.includes(DEFAULT_CATEGORY_STYLE.color))).toBe(true);
    expect(styles.some((s) => s.includes("alert"))).toBe(false);
  });

  // The validator's real risk is rejecting a colour it should have passed: a
  // single-colour control cannot see that, and would stay green while eight of
  // the nine pins silently fell back to the primary token. Mirrors
  // category-registry.js CATEGORY_STYLES + DEFAULT_CATEGORY_STYLE.
  const REAL_PALETTE = [
    "#c04040", // בשר · דגים
    "#2e6853", // ירקות, פירות ומשקים · DEFAULT_CATEGORY_STYLE
    "#4a90d9", // חלב וגבינות
    "#896714", // לחמים ואפייה
    "#e8a020", // שמנים
    "#C8821E", // דבש — uppercase hex, which the validator must accept verbatim
    "#9b59b6", // טיפוח וסבונים
  ];

  it.each(REAL_PALETTE)("passes the legitimate palette colour %s through unchanged", (colour) => {
    setCategoryColour(colour);
    const styles = renderPins().map((el) => el.getAttribute("style") ?? "");
    // Primary pin fills with the colour, secondary pin rings with it — both
    // read the same validated value, so at least one carries it verbatim.
    expect(styles.some((s) => s.includes(colour))).toBe(true);
  });
});
