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

  const MapContainer = ({ children, zoomControl, attributionControl, zoom }) => {
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
        // MEH-1808: the camera the container is built with. Exposed so the
        // default-preserving assertions below read the real value instead of
        // trusting that nothing moved.
        data-zoom={String(zoom)}
      >
        <MapStubContext.Provider value={stub}>{children}</MapStubContext.Provider>
      </div>
    );
  };

  return {
    MapContainer,
    TileLayer: ({ attribution }) => <div data-testid="tile-layer" data-attribution={attribution} />,
    // MEH-2182: `draggable` and a `dragend` binding are surfaced the same way
    // `direction` was for the tooltip below — `String(draggable)` keeps the
    // undefined (nobody opted in) case assertable instead of dropping the
    // attribute, which is the state four of the five consumers are in.
    Marker: ({ children, title, icon, eventHandlers, draggable }) => (
      <div
        data-testid="marker"
        data-title={title}
        data-icon-class={icon?.options?.className ?? ""}
        data-has-click={String(Boolean(eventHandlers?.click))}
        data-draggable={String(draggable)}
        data-has-dragend={String(Boolean(eventHandlers?.dragend))}
        onClick={eventHandlers?.click}
      >
        {children}
        {eventHandlers?.dragend ? (
          <button
            type="button"
            data-testid="marker-dragend"
            onClick={(e) => {
              e.stopPropagation();
              eventHandlers.dragend({
                target: { getLatLng: () => ({ lat: 31.7683, lng: 35.2137 }) },
              });
            }}
          />
        ) : null}
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

// MEH-1808 — `zoom` and `showNavigation` were added so the register address
// confirmation can reuse this component instead of growing a second
// map-rendering path. Both are OPT-IN: the producer / events / experiences
// mounts pass neither, so their behaviour has to be bit-for-bit what it was.
//
// Failing-by-construction, and each construction discriminates: flip either
// default (zoom → 16, showNavigation → false) and the two "unchanged" tests go
// red on the exact values the three existing consumers depend on; drop the
// prop plumbing entirely (hardcode SINGLE_POINT_ZOOM / always render the pills)
// and the two "override" tests go red instead. No single edit satisfies both
// pairs, which is what makes them evidence rather than decoration.
describe("MiniMap — opt-in zoom + showNavigation (MEH-1808)", () => {
  beforeEach(() => {
    leafletStubs.maps.length = 0;
  });

  it("defaults are unchanged: zoom 14 and both nav pills, when neither prop is passed", () => {
    render(<MiniMap lat={32.5} lng={34.9} name="הבית של רותי" />);
    expect(screen.getByTestId("map").dataset.zoom).toBe("14");
    expect(screen.getByText("Waze")).toBeInTheDocument();
    expect(screen.getByText("מפות Google")).toBeInTheDocument();
  });

  it("zoom override reaches the map container", () => {
    render(<MiniMap lat={32.5} lng={34.9} name="הבית של רותי" zoom={16} />);
    expect(screen.getByTestId("map").dataset.zoom).toBe("16");
  });

  it("showNavigation={false} drops BOTH nav pills and nothing else", () => {
    render(<MiniMap lat={32.5} lng={34.9} name="הבית של רותי" showNavigation={false} />);
    expect(screen.queryByText("Waze")).not.toBeInTheDocument();
    expect(screen.queryByText("מפות Google")).not.toBeInTheDocument();
    // the map itself still renders — this prop hides the CTAs, not the map
    expect(screen.getByTestId("map")).toBeInTheDocument();
    expect(screen.getByTestId("marker")).toBeInTheDocument();
  });
});

// MEH-2182 — the opt-in draggable marker, from the MiniMap side.
//
// The register wizard is the only caller that asks for it. The four other
// mounts (producer detail ×2, the admin preview, the fullscreen overlay) pass
// nothing, and the first test below is the one that pins their non-regression:
// `draggable` must be *undefined*, not `false` — a present-and-false prop is
// the MEH-1633 / MEH-1659 shape, and react-leaflet's Marker reads it either
// way, so only the absent form proves the opt-out path is untouched.
//
// Failing-by-construction (both directions, run before this block was trusted):
//   • hardcode `draggable` (drop the `|| undefined`) → test 1 goes red on
//     "false" while tests 2–4 stay green.
//   • drop the `draggableMarker ?` arm of `eventHandlers` → tests 2–4 go red
//     (no dragend to fire, and the click handler comes back) while 1 stays green.
//   • revert `coordKeyPart` to `${lat}-${lng}` → only test 5 goes red.
// No single edit reddens the whole block, which is what makes them evidence.
describe("MiniMap — opt-in draggable marker (MEH-2182)", () => {
  beforeEach(() => {
    leafletStubs.maps.length = 0;
  });

  it("without the prop the marker carries NO draggable and NO dragend", () => {
    render(<MiniMap lat={32.5} lng={34.9} name="הבית של רותי" />);
    const marker = screen.getByTestId("marker");
    expect(marker.dataset.draggable).toBe("undefined");
    expect(marker.dataset.hasDragend).toBe("false");
    // ...and the tap-to-expand handler the untouched consumers rely on is still
    // bound, so this is a pure addition rather than a swap.
    expect(marker.dataset.hasClick).toBe("true");
  });

  it("draggableMarker binds dragend and hands the caller the dropped point", () => {
    const onMarkerDragEnd = vi.fn();
    render(
      <MiniMap
        lat={32.5}
        lng={34.9}
        name="הבית של רותי"
        draggableMarker
        onMarkerDragEnd={onMarkerDragEnd}
      />,
    );
    const marker = screen.getByTestId("marker");
    expect(marker.dataset.draggable).toBe("true");
    expect(marker.dataset.hasDragend).toBe("true");

    fireEvent.click(screen.getByTestId("marker-dragend"));
    // The coordinates come off the Leaflet event target, not off the props —
    // reading them from props would report the OLD point after every drag.
    expect(onMarkerDragEnd).toHaveBeenCalledTimes(1);
    expect(onMarkerDragEnd).toHaveBeenCalledWith({ lat: 31.7683, lng: 35.2137 });
  });

  it("a draggable marker does not also expand the map on click", () => {
    render(<MiniMap lat={32.5} lng={34.9} name="הבית של רותי" draggableMarker />);
    expect(screen.getByTestId("marker").dataset.hasClick).toBe("false");
  });

  it("dragging without a callback does not throw", () => {
    render(<MiniMap lat={32.5} lng={34.9} name="הבית של רותי" draggableMarker />);
    expect(() => fireEvent.click(screen.getByTestId("marker-dragend"))).not.toThrow();
  });

  // The open half of the reveal. The automated reviewer spotted that
  // `surfaceProps` forwards the two props to the OVERLAY as well, and called it
  // inert because `showNavigation={false}` supposedly hides the expand button.
  // That reason is false — `showNavigation` gates only the nav pills
  // (`MiniMap.jsx:605`); the expand button (`:564`) is unconditional, and the
  // register QA screenshots show it sitting on the confirmation map. So the
  // overlay is one tap away and its marker really is draggable, which makes
  // this the (open × draggable) cell of the conditional-UI matrix — the exact
  // shape MEH-1583 left orphaned by counting two lists instead of the cells.
  it("the OVERLAY marker is draggable too, and its drag reaches the caller", () => {
    const onMarkerDragEnd = vi.fn();
    render(
      <MiniMap
        lat={32.5}
        lng={34.9}
        name="הבית של רותי"
        showNavigation={false}
        draggableMarker
        onMarkerDragEnd={onMarkerDragEnd}
      />,
    );

    // The expand affordance survives showNavigation={false} — assert it rather
    // than assume it, since that assumption is what the review got wrong.
    const expandButtons = screen.getAllByLabelText("הגדלת המפה למסך מלא");
    expect(expandButtons.length).toBeGreaterThan(0);

    fireEvent.click(expandButtons[0]);
    const dialog = screen.getByRole("dialog");
    expect(screen.getAllByTestId("map")).toHaveLength(2);

    const overlayMarker = within(dialog).getByTestId("marker");
    expect(overlayMarker.dataset.draggable).toBe("true");
    expect(overlayMarker.dataset.hasDragend).toBe("true");

    fireEvent.click(within(dialog).getByTestId("marker-dragend"));
    expect(onMarkerDragEnd).toHaveBeenCalledWith({ lat: 31.7683, lng: 35.2137 });
  });

  it("without the prop the overlay marker is NOT draggable either", () => {
    render(<MiniMap lat={32.5} lng={34.9} name="הבית של רותי" />);
    fireEvent.click(screen.getAllByLabelText("הגדלת המפה למסך מלא")[0]);
    const dialog = screen.getByRole("dialog");
    const overlayMarker = within(dialog).getByTestId("marker");
    expect(overlayMarker.dataset.draggable).toBe("undefined");
    expect(overlayMarker.dataset.hasDragend).toBe("false");
  });

  it("the container survives a coordinate change while draggable, and is rebuilt without it", () => {
    // Draggable: the caller owns the point, so a coordinate change must NOT
    // remount — a remount mid-drag tears the map down under the seller's finger.
    const { rerender, unmount } = render(
      <MiniMap lat={32.5} lng={34.9} name="הבית של רותי" draggableMarker />,
    );
    expect(leafletStubs.maps).toHaveLength(1);
    rerender(<MiniMap lat={31.7} lng={35.2} name="הבית של רותי" draggableMarker />);
    expect(leafletStubs.maps).toHaveLength(1);
    unmount();

    // Opt-out: the remount-on-move behaviour every other consumer has today is
    // unchanged. Without this half the test above would pass on a MiniMap that
    // simply never remounts, which is a different (and worse) component.
    leafletStubs.maps.length = 0;
    const second = render(<MiniMap lat={32.5} lng={34.9} name="הבית של רותי" />);
    expect(leafletStubs.maps).toHaveLength(1);
    second.rerender(<MiniMap lat={31.7} lng={35.2} name="הבית של רותי" />);
    expect(leafletStubs.maps).toHaveLength(2);
  });
});

// MEH-2148 — the inline map's expand button used a PAGE-level z token while its
// wrapper created no stacking context, so the value competed at the root and
// painted over the producer page's StickyContactBar (fixed, token 598). The fix
// is two halves and BOTH are load-bearing: a local value on the button, and a
// stacking context on the wrapper that keeps it local. Asserting either one
// alone passes on a component that is still broken — a local value with no
// context is one careless z away from escaping again, and a context around a
// page-scale value still wins against the CTA inside its own box.
describe("MEH-2148 — the mini-map contains its own z-index", () => {
  // Every element between the page and the CTA bar; anything the button could
  // outrank at page scale. 598 is StickyContactBar
  // (app/[locale]/producer/[id]/components/StickyContactBar.jsx:79).
  const STICKY_CONTACT_BAR_Z = 598;

  const zTokenOf = (className) => {
    // Both Tailwind forms: the scale token (z-10) and the arbitrary one
    // (bracketed). The regression this guards reintroduces the arbitrary form,
    // so a check that only understood the scale would go green on it.
    const match = className.match(/(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?:\s|$)/);
    return match ? Number(match[1] ?? match[2]) : null;
  };

  // Resolve the isolated box by what it CONTAINS, not by where it sits relative
  // to the button. `expand.parentElement` silently becomes the wrong element the
  // day the button gains a wrapper of its own (a tooltip trigger, a span), and
  // the two tests below fail differently on that: the first reds with a message
  // about a className, naming nothing structural; the second reds NOT AT ALL —
  // a nested span trivially does not contain the overlay, so the containment
  // assertion passes for the wrong reason. A false pass is the worse half, and
  // it is why this is a shared resolver rather than a message on one assertion.
  const isolatedBoxOf = (container, expand) => {
    const map = container.querySelector('[data-testid="map"]');
    expect(map, "no map surface rendered — the react-leaflet stub did not mount").not.toBeNull();
    const box = expand.parentElement;
    expect(
      box.contains(map),
      "the expand button's parent no longer holds the map surface: the button gained its own wrapper, so this test is pointed at the wrong element and its verdict means nothing",
    ).toBe(true);
    return box;
  };

  it("keeps the expand button's z below the page CTA, inside an isolated wrapper", () => {
    const { container } = render(<MiniMap lat={32.57} lng={34.95} name="רוח השדה" />);
    const expand = screen.getByRole("button", { name: "הגדלת המפה למסך מלא" });
    const wrapper = isolatedBoxOf(container, expand);

    // Half 1 — the button's own value is local, not page-scale.
    const z = zTokenOf(expand.className);
    expect(z, `expand button carries no z token: "${expand.className}"`).not.toBeNull();
    expect(z).toBeLessThan(STICKY_CONTACT_BAR_Z);

    // Half 2 — the wrapper creates a stacking context, so the value cannot
    // escape to the root even if it later grows. `relative` alone does not:
    // position without a z-index leaves the child competing at page scale,
    // which is exactly how the original defect reached the CTA.
    expect(wrapper.className).toMatch(/(^|\s)isolate(\s|$)/);
    expect(wrapper.className).toMatch(/(^|\s)relative(\s|$)/);
  });

  it("keeps the fullscreen overlay OUT of that stacking context", () => {
    // The overlay must still outrank the global header (1050) and the cookie
    // banner (1100) — .claude/rules/rtl.md § Map z-index tokens. It can only do
    // that as a SIBLING of the isolated wrapper. If a refactor moves it inside,
    // isolation traps it and the overlay renders under the header with no error
    // anywhere: the half of the fix that is invisible until someone opens it.
    const { container } = render(<MiniMap lat={32.57} lng={34.95} name="רוח השדה" />);
    const expand = screen.getByRole("button", { name: "הגדלת המפה למסך מלא" });
    const isolatedWrapper = isolatedBoxOf(container, expand);

    fireEvent.click(expand);
    const overlay = screen.getByRole("dialog", { name: "מפה במסך מלא" });

    expect(isolatedWrapper.contains(overlay)).toBe(false);
    expect(zTokenOf(overlay.className)).toBeGreaterThan(1100);
  });
});
