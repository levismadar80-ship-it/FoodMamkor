import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1233 B5: the mini-map navigation offers Waze next to Google on ALL
// viewports (previously Waze was mobile-only, so the desktop audit saw only
// Google). Leaflet + react-leaflet are stubbed — jsdom has no real map.

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const map = {
      default_label: "מיקום",
      open_in_waze: "פתיחה ב-Waze",
      open_in_google: "פתיחה במפות Google",
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
  NavigationArrow: () => <span data-testid="nav-arrow" />,
}));

import MiniMap from "@/components/MiniMap";

describe("MiniMap — B5 Waze next to Google (MEH-1233)", () => {
  it("renders both Waze and Google nav links with correct hrefs", () => {
    render(<MiniMap lat={32.57} lng={34.95} name="רוח השדה" />);
    const waze = screen.getByText("פתיחה ב-Waze").closest("a");
    const google = screen.getByText("פתיחה במפות Google").closest("a");
    expect(waze).toHaveAttribute("href", "https://waze.com/ul?ll=32.57,34.95&navigate=yes");
    expect(google).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=32.57,34.95",
    );
    // opens in a new tab, safely
    expect(waze).toHaveAttribute("target", "_blank");
    expect(waze).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders no nav links without valid coordinates", () => {
    render(<MiniMap lat={null} lng={null} name="x" />);
    expect(screen.queryByText("פתיחה ב-Waze")).not.toBeInTheDocument();
    expect(screen.queryByText("פתיחה במפות Google")).not.toBeInTheDocument();
  });
});
