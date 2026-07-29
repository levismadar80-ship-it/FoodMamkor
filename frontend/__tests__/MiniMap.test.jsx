import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

// MEH-1233 B5: the mini-map navigation offers Waze next to Google on ALL
// viewports (previously Waze was mobile-only, so the desktop audit saw only
// Google). Leaflet + react-leaflet are stubbed — jsdom has no real map.

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const map = {
      default_label: "מיקום",
      // MEH-1305 B: short visible labels; full purpose in the accessible name.
      open_in_waze: "Waze",
      open_in_google: "מפות Google",
      open_in_waze_aria: "פתיחה ב-Waze",
      open_in_google_aria: "פתיחה במפות Google",
      // MEH-1659: expand / close affordances.
      expand_aria: "הגדלת המפה למסך מלא",
      close_aria: "סגירת המפה במסך מלא",
      expanded_aria: "מפה במסך מלא",
    };
    return map[key] ?? key;
  },
}));

// MEH-1659: every <MapContainer> that mounts registers a stub here, in mount
// order, and each stub RECORDS what the component did to it — which gesture
// handlers were enabled or disabled, and which Leaflet events were bound. That
// is what lets a test assert the inline map is frozen and the overlay map is
// live in the same run, instead of asserting one and assuming the other.
// `data-stub-index` on the rendered div ties a DOM node back to its stub, so a
// test can say "the map INSIDE the dialog" rather than "the second one".
const leafletStubs = vi.hoisted(() => ({ maps: [] }));

// MEH-1611: Marker renders its pin + tooltip, so the stub surfaces the props
// the location pins are asserted on (it used to render null).
vi.mock("react-leaflet", async () => {
  const { createContext, useContext, useState } = await vi.importActual("react");
  const MapStubContext = createContext(null);

  // enabled starts `null` — "the component never touched this handler" is a
  // distinct outcome from "it disabled it", and the tests rely on the
  // difference (a no-op InteractionMode must not read as a frozen map).
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
    setView: () => {},
    fitBounds: () => {},
    dragging: makeHandler(),
    touchZoom: makeHandler(),
    doubleClickZoom: makeHandler(),
    scrollWheelZoom: makeHandler(),
    boxZoom: makeHandler(),
    keyboard: makeHandler(),
    // Leaflet 1.9.4 ships NO `tap` handler (leaflet-src.js has only TapHold),
    // so the stub omits it too — the component must tolerate its absence.
    listeners: {},
    on(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    },
    off(type, fn) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
    },
  });

  const MapContainer = ({ children, zoomControl, attributionControl }) => {
    const [stub] = useState(() => {
      const created = makeMapStub();
      leafletStubs.maps.push(created);
      return created;
    });
    const index = leafletStubs.maps.indexOf(stub);
    return (
      <div
        data-testid="map"
        data-stub-index={index}
        // `undefined` here is the assertion target: a present-and-false value
        // on either prop is what MEH-1633 (attribution) and MEH-1659 (zoom)
        // both turned out to be.
        data-zoom-control={String(zoomControl)}
        data-attribution-control={String(attributionControl)}
      >
        <MapStubContext.Provider value={stub}>{children}</MapStubContext.Provider>
      </div>
    );
  };

  return {
    MapContainer,
    TileLayer: ({ attribution }) => <div data-testid="tile-layer" data-attribution={attribution} />,
    Marker: ({ children, title, icon, eventHandlers }) => (
      <div
        data-testid="marker"
        data-title={title}
        data-icon-class={icon?.options?.className ?? ""}
        data-has-click={String(Boolean(eventHandlers?.click))}
        onClick={eventHandlers?.click}
      >
        {children}
      </div>
    ),
    // MEH-1682: the stub used to swallow `direction` and `offset`, so the
    // tooltip's placement was invisible to every test here — which is exactly
    // how a bare, `direction:'auto'` tooltip shipped. `String(direction)` keeps
    // "undefined" (the buggy default-inheriting form) assertable rather than
    // dropping the attribute.
    Tooltip: ({ children, direction, offset }) => (
      <div
        data-testid="tooltip"
        data-direction={String(direction)}
        data-offset-y={String(offset?.[1])}
      >
        {children}
      </div>
    ),
    useMap: () => useContext(MapStubContext),
  };
});

vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet", () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: () => {} } },
    // MEH-1611: real L.divIcon exposes the options it was built with; the
    // location pins are identified through `icon.options.className`.
    divIcon: (o) => ({ options: o }),
  },
}));

// MEH-1611: MiniMap now pulls the category glyph through category-registry,
// which imports several Phosphor icons by name (and re-exports CategoryIcons).
// A fixed {MapPin} stub left those undefined and renderToStaticMarkup threw, so
// the mock resolves ANY icon name to a stub component.
vi.mock("@phosphor-icons/react", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, MapPin: () => <span data-testid="map-pin" /> };
});

import MiniMap from "@/components/MiniMap";

describe("MiniMap — B5 Waze next to Google (MEH-1233)", () => {
  it("renders both Waze and Google nav links with correct hrefs + accessible names", () => {
    render(<MiniMap lat={32.57} lng={34.95} name="רוח השדה" />);
    // MEH-1305 B: short visible label, full "open in ..." purpose in aria-label.
    const waze = screen.getByText("Waze").closest("a");
    const google = screen.getByText("מפות Google").closest("a");
    expect(waze).toHaveAttribute("href", "https://waze.com/ul?ll=32.57,34.95&navigate=yes");
    expect(google).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=32.57,34.95",
    );
    // opens in a new tab, safely
    expect(waze).toHaveAttribute("target", "_blank");
    expect(waze).toHaveAttribute("rel", "noopener noreferrer");
    // WCAG 2.4.6: accessible name conveys the link purpose despite the short label.
    expect(waze).toHaveAttribute("aria-label", "פתיחה ב-Waze");
    expect(google).toHaveAttribute("aria-label", "פתיחה במפות Google");
  });

  it("renders no nav links without valid coordinates", () => {
    render(<MiniMap lat={null} lng={null} name="x" />);
    expect(screen.queryByText("Waze")).not.toBeInTheDocument();
    expect(screen.queryByText("מפות Google")).not.toBeInTheDocument();
  });
});

/**
 * MEH-1611 chunk 2 — the business page's map shows every point the business
 * owns (branch + pickup / market_stand) and nothing else. The store-locator
 * half of the ticket: /map demotes neighbours, this page isolates outright.
 */
describe("MEH-1611 — producer locations on the mini map", () => {
  // The demo business shape: 1 branch + 9 satellite points.
  const demoLocations = [
    {
      id: "loc-0",
      kind: "branch",
      label: "המאפייה (הסניף המרכזי)",
      lat: 32.5732,
      lng: 34.9519,
      is_primary: true,
      opening_hours: "א׳–ה׳ 08:00–17:00",
    },
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `loc-${i + 1}`,
      kind: i % 2 === 0 ? "pickup" : "market_stand",
      label: `איסוף ${i + 1}`,
      lat: 32.5 + i * 0.01,
      lng: 34.95 + i * 0.01,
      is_primary: false,
    })),
  ];
  const producer = { id: "p1", name: "רוח השדה", categories: [{ id: 4, name: "לחמים ואפייה" }] };

  const renderWith = (locations, overrides = {}) =>
    render(
      <MiniMap
        lat={32.5732}
        lng={34.9519}
        name="רוח השדה"
        locations={locations}
        producer={producer}
        {...overrides}
      />,
    );

  it("renders exactly one pin per location — 10 for the demo business, 1 primary + 9 secondary", () => {
    renderWith(demoLocations);
    const markers = screen.getAllByTestId("marker");
    expect(markers).toHaveLength(10);
    const isSecondary = (m) =>
      m.getAttribute("data-icon-class").includes("mehamakor-minimap-pin-secondary");
    expect(markers.filter(isSecondary)).toHaveLength(9);
    // Counted independently, not derived from the two assertions above: a
    // `secondary.length + 1` check would be arithmetically guaranteed by them
    // and could never fail on its own. This one falsifies if the branch row
    // ever renders as a secondary pin (or a second primary appears).
    expect(markers.filter((m) => !isSecondary(m))).toHaveLength(1);
  });

  it("renders ZERO foreign pins — the count never exceeds this producer's own points", () => {
    renderWith(demoLocations.slice(0, 3));
    // 3 rows in, 3 pins out. The component is handed one producer's locations
    // and never fetches, so a foreign pin cannot appear by construction.
    expect(screen.getAllByTestId("marker")).toHaveLength(3);
  });

  it("labels each point, and adds its opening hours when present", () => {
    renderWith(demoLocations);
    expect(screen.getByText("המאפייה (הסניף המרכזי)")).toBeInTheDocument();
    expect(screen.getByText("א׳–ה׳ 08:00–17:00")).toBeInTheDocument();
    expect(screen.getByText("איסוף 1")).toBeInTheDocument();
  });

  it("drops coordinate-invalid rows instead of NaN-ing the whole map", () => {
    renderWith([
      demoLocations[0],
      { id: "bad-1", kind: "pickup", label: "בלי קואורדינטות", lat: null, lng: null },
      { id: "bad-2", kind: "pickup", label: "NaN", lat: Number.NaN, lng: 34.9 },
    ]);
    expect(screen.getAllByTestId("marker")).toHaveLength(1);
  });

  it("is absent from the DOM entirely when the business has no usable coordinates", () => {
    const { container } = render(
      <MiniMap lat={null} lng={null} name="x" locations={[]} producer={producer} />,
    );
    // No empty map, no placeholder — nothing at all.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
  });

  it("still renders the single legacy marker when no locations are passed (events / experiences)", () => {
    // /events + /experiences call MiniMap with lat/lng/name only — that path
    // must keep working exactly as before this ticket.
    render(<MiniMap lat={32.57} lng={34.95} name="אירוע" />);
    const markers = screen.getAllByTestId("marker");
    expect(markers).toHaveLength(1);
    expect(markers[0].getAttribute("data-icon-class")).toBe(""); // default Leaflet icon
    expect(screen.getByText("Waze").closest("a")).toHaveAttribute(
      "href",
      "https://waze.com/ul?ll=32.57,34.95&navigate=yes",
    );
  });
});

/**
 * MEH-1659 — the inline map stops being frozen (+/− zoom, no scroll-trap) and
 * any tap on it opens a fullscreen overlay where every gesture works.
 *
 * The pair of assertions that carries this ticket is the gesture one: it reads
 * BOTH maps in the same run and requires opposite states. Asserting only the
 * overlay would pass just as well if the inline map had quietly become
 * draggable too — which is the scroll-trap the ticket exists to avoid.
 */
describe("MEH-1659 — inline zoom + fullscreen expand", () => {
  beforeEach(() => {
    leafletStubs.maps.length = 0;
  });

  const EXPAND_LABEL = "הגדלת המפה למסך מלא";
  const CLOSE_LABEL = "סגירת המפה במסך מלא";
  // Every name in INTERACTION_HANDLERS that Leaflet 1.9.4 actually ships. `tap`
  // is deliberately absent (the component's guard skips it — see
  // leaflet-interaction-contract.test.js); `keyboard` is NOT, and its omission
  // here was a real hole: deleting `"keyboard"` from INTERACTION_HANDLERS left
  // the inline map arrow-pannable and every assertion still green.
  const GESTURES = [
    "dragging",
    "touchZoom",
    "doubleClickZoom",
    "scrollWheelZoom",
    "boxZoom",
    "keyboard",
  ];

  const renderMini = () => render(<MiniMap lat={32.57} lng={34.95} name="רוח השדה" />);
  const stubFor = (node) => leafletStubs.maps[Number(node.dataset.stubIndex)];

  it("renders exactly ONE expand button and ONE map before anything is opened", () => {
    renderMini();
    // Not `getByLabelText` — that passes on 1 and THROWS on 2, which reads as a
    // failure of the wrong thing. The count is the assertion: a duplicated
    // button is the shape a second MiniMap mount (or a stray render) takes.
    expect(screen.getAllByLabelText(EXPAND_LABEL)).toHaveLength(1);
    expect(screen.getAllByTestId("map")).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a fullscreen dialog on expand, focuses close, locks body scroll, and Esc closes it", () => {
    renderMini();
    fireEvent.click(screen.getAllByLabelText(EXPAND_LABEL)[0]);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "מפה במסך מלא");
    // A SECOND MapContainer — the overlay gets a fresh instance rather than
    // re-parenting the inline one (Leaflet must size against the final box).
    expect(screen.getAllByTestId("map")).toHaveLength(2);
    expect(within(dialog).getByLabelText(CLOSE_LABEL)).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("map")).toHaveLength(1);
    expect(document.body.style.overflow).toBe("");
  });

  it("closes on the X button as well as on Esc", () => {
    renderMini();
    fireEvent.click(screen.getAllByLabelText(EXPAND_LABEL)[0]);
    fireEvent.click(screen.getByLabelText(CLOSE_LABEL));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("opens from a tap on the map CANVAS (Leaflet click), not only from the button", () => {
    renderMini();
    const inline = screen.getByTestId("map");
    const bound = stubFor(inline).listeners.click ?? [];
    expect(bound).toHaveLength(1);
    act(() => {
      for (const fn of bound) fn();
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens from a tap on a PIN — Leaflet delivers marker clicks to the marker, not the map", () => {
    renderMini();
    const pin = screen.getByTestId("marker");
    expect(pin).toHaveAttribute("data-has-click", "true");
    fireEvent.click(pin);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("freezes every gesture INLINE while enabling every gesture in the OVERLAY", () => {
    renderMini();
    fireEvent.click(screen.getAllByLabelText(EXPAND_LABEL)[0]);

    const dialog = screen.getByRole("dialog");
    const overlayMap = within(dialog).getByTestId("map");
    const inlineMap = screen.getAllByTestId("map").find((node) => !dialog.contains(node));
    const inline = stubFor(inlineMap);
    const overlay = stubFor(overlayMap);

    for (const gesture of GESTURES) {
      // `false` (not falsy): `null` would mean the handler was never touched.
      expect(inline[gesture].enabled, `inline ${gesture}`).toBe(false);
      expect(overlay[gesture].enabled, `overlay ${gesture}`).toBe(true);
    }
    // A pin in the overlay is already at its destination — no expand handler.
    for (const marker of within(dialog).getAllByTestId("marker")) {
      expect(marker).toHaveAttribute("data-has-click", "false");
    }
  });

  it("keeps the +/− control AND the OSM attribution on both surfaces", () => {
    renderMini();
    fireEvent.click(screen.getAllByLabelText(EXPAND_LABEL)[0]);

    const maps = screen.getAllByTestId("map");
    expect(maps).toHaveLength(2);
    for (const map of maps) {
      // MEH-1633 / MEH-1659: the failure mode of both is a present-and-false
      // prop that deletes the control a sibling prop configures. "undefined"
      // is react-leaflet's default-on path.
      expect(map.dataset.zoomControl).toBe("undefined");
      expect(map.dataset.attributionControl).toBe("undefined");
    }
    const tiles = screen.getAllByTestId("tile-layer");
    expect(tiles).toHaveLength(2);
    for (const tile of tiles) expect(tile.dataset.attribution).toContain("OpenStreetMap");
  });

  it("still renders exactly TWO nav pills — Waze and Google, never a third", () => {
    renderMini();
    // The expand/close affordances are <button>s, so a new pill-shaped link
    // sneaking into the nav row is the only way this count moves.
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});

/**
 * MEH-1682 — the pin tooltip is anchored VERTICALLY, on purpose.
 *
 * Leaflet's default `direction: 'auto'` chooses a horizontal side from the
 * marker's container x, and that choice is broken under `html { direction: rtl }`
 * (Leaflet #7201, open upstream, present in 1.9.4): the tooltip floats detached
 * beside the pin with a lateral gap and no arrow. `direction="top"` removes the
 * horizontal decision from the equation.
 *
 * Two independent properties are asserted, because either one alone passes on a
 * shape the ticket exists to prevent: a `direction="top"` with the wrong offset
 * buries the tooltip inside the pin, and a correct offset with `direction`
 * unset is still the RTL bug.
 */
describe("MEH-1682 — tooltip anchored above the pin, not auto-placed", () => {
  const PRIMARY_PIN_PX = 32;
  const SECONDARY_PIN_PX = 24;

  // Deliberately NOT imported from the component: these mirror its constants so
  // that resizing a pin without revisiting the offset reds this test instead of
  // silently shifting the tooltip onto the pin.
  const locations = [
    { id: "a", kind: "branch", label: "הסניף", lat: 32.57, lng: 34.95, is_primary: true },
    { id: "b", kind: "pickup", label: "איסוף", lat: 32.58, lng: 34.96 },
    { id: "c", kind: "market_stand", label: "דוכן", lat: 32.59, lng: 34.97 },
  ];
  const producer = { id: "p1", name: "רוח השדה", categories: [{ id: 4, name: "לחמים ואפייה" }] };

  const renderPins = () =>
    render(
      <MiniMap
        lat={32.57}
        lng={34.95}
        name="רוח השדה"
        locations={locations}
        producer={producer}
      />,
    );

  // Each tooltip paired with the pin it belongs to, so the offset is checked
  // against that pin's real size rather than against a global expectation.
  const tooltipsWithPinSize = () =>
    screen.getAllByTestId("marker").map((marker) => ({
      tooltip: within(marker).getByTestId("tooltip"),
      pinPx: marker.getAttribute("data-icon-class").includes("mehamakor-minimap-pin-secondary")
        ? SECONDARY_PIN_PX
        : PRIMARY_PIN_PX,
    }));

  it("gives EVERY tooltip an explicit vertical direction — never Leaflet's 'auto'", () => {
    renderPins();
    const pairs = tooltipsWithPinSize();
    expect(pairs).toHaveLength(3);
    for (const { tooltip } of pairs) {
      // "undefined" is the bare form that inherits `auto`; "auto" is it spelled
      // out. Both are the bug, and asserting equality with "top" rejects the
      // horizontal values ("left" / "right") too.
      expect(tooltip.dataset.direction).toBe("top");
    }
  });

  it("offsets every tooltip clear of its OWN pin — bigger pin, bigger offset", () => {
    renderPins();
    for (const { tooltip, pinPx } of tooltipsWithPinSize()) {
      const offsetY = Number(tooltip.dataset.offsetY);
      // Upward is negative in Leaflet's offset space.
      expect(offsetY).toBeLessThan(0);
      // The invariant that matters: the tooltip's anchor edge sits ABOVE the
      // circle. iconAnchor is the pin CENTRE, so anything within half the pin
      // renders on top of it. This is what rejects reusing HomepageMiniMap's
      // -8 (correct for its 24px pin, 8 < 16 = inside the 32px primary pin).
      expect(Math.abs(offsetY)).toBeGreaterThan(pinPx / 2);
    }
  });

  it("uses two DISTINCT offsets — the primary and secondary pins are not interchangeable", () => {
    renderPins();
    const pairs = tooltipsWithPinSize();
    const primary = pairs.filter((p) => p.pinPx === PRIMARY_PIN_PX);
    const secondary = pairs.filter((p) => p.pinPx === SECONDARY_PIN_PX);
    expect(primary).toHaveLength(1);
    expect(secondary).toHaveLength(2);
    // Exact values, so collapsing both sizes onto one shared constant fails
    // here even though it would still satisfy the clears-the-pin check above
    // (a single -18 clears both pins, but floats the 24px one too high).
    expect(primary[0].tooltip.dataset.offsetY).toBe("-18");
    for (const { tooltip } of secondary) expect(tooltip.dataset.offsetY).toBe("-14");
  });
});
