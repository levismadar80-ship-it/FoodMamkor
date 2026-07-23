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

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  useMap: () => ({
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
  default: { Icon: { Default: { prototype: {}, mergeOptions: () => {} } } },
}));

vi.mock("@phosphor-icons/react", () => ({
  MapPin: () => <span data-testid="map-pin" />,
}));

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
