import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
    };
    return map[key] ?? key;
  },
}));

// MEH-1611: Marker now renders its pin + tooltip, so the stub surfaces the
// props the location pins are asserted on (it used to render null).
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children, title, icon }) => (
    <div data-testid="marker" data-title={title} data-icon-class={icon?.options?.className ?? ""}>
      {children}
    </div>
  ),
  Tooltip: ({ children }) => <div data-testid="tooltip">{children}</div>,
  useMap: () => ({
    setView: () => {},
    fitBounds: () => {},
    dragging: { disable() {} },
    touchZoom: { disable() {} },
    doubleClickZoom: { disable() {} },
    scrollWheelZoom: { disable() {} },
    boxZoom: { disable() {} },
    keyboard: { disable() {} },
    tap: { disable() {} },
  }),
}));

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
