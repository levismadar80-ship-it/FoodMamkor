/**
 * MEH-3756 — the phone map's picked card, when the tapped pin is a pickup
 * point or a market stand: its days and «הוראות איסוף», Waze / Google Maps to
 * the point (exact points only), and «לדף בית העסק». Every other pin (a branch,
 * or a pick from the list) gets the same nav + button, without the pickup
 * details (one card for all pins, Sapir 25/11). Rendered with the real he.json.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

vi.mock("@/components/MapProducerCard", () => ({
  default: ({ producer }) => <div data-testid="map-producer-card">{producer.name}</div>,
}));

import MapPickupPointPanel, { isPickupPoint, panelPoint } from "@/app/[locale]/map/components/MapPickupPointPanel";
import MobileSheetSelectedCard from "@/app/[locale]/map/components/MobileSheetSelectedCard";

const producer = { id: "7e57a6f0-0000-4000-8000-000000000007", slug: "meshek-dugma", name: "משק הדוגמה" };
const point = (over = {}) => ({
  kind: "pickup",
  label: "נקודת איסוף בחדרה",
  lat: 32.43,
  lng: 34.92,
  precision: "exact",
  pickup_days: ["שלישי"],
  pickup_note: "נכנסים מהחצר האחורית",
  opening_hours: null,
  ...over,
});

const show = (location) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <MapPickupPointPanel producer={producer} location={location} />
    </NextIntlClientProvider>,
  );

describe("MapPickupPointPanel", () => {
  it("a pickup point: days, the note, nav to the point and the business page button", () => {
    show(point());
    expect(screen.getByTestId("pickup-days").textContent).toContain("שלישי");
    expect(screen.getByTestId("map-pickup-note").textContent).toBe("נכנסים מהחצר האחורית");
    const hrefs = [...screen.getByTestId("map-pickup-nav").querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"));
    expect(hrefs).toEqual([
      "https://waze.com/ul?ll=32.43,34.92&navigate=yes",
      "https://www.google.com/maps/dir/?api=1&destination=32.43,34.92",
    ]);
    const link = screen.getByTestId("map-pickup-business-link");
    expect(link.textContent).toBe("לדף בית העסק");
    expect(link.getAttribute("href")).toBe("/meshek-dugma?from=map");
  });

  it("a market stand gets the panel too", () => {
    show(point({ kind: "market_stand" }));
    expect(screen.getByTestId("map-pickup-panel")).toBeTruthy();
  });

  it("a branch pin: nav to the branch and the button, no pickup details", () => {
    show(point({ kind: "branch", label: null, lat: 31.9, lng: 34.8, pickup_note: "לא אמור להופיע" }));
    expect(screen.getByTestId("map-pickup-panel")).toBeTruthy();
    expect(screen.queryByTestId("pickup-days")).toBeNull();
    expect(screen.queryByTestId("map-pickup-note")).toBeNull();
    const hrefs = [...screen.getByTestId("map-pickup-nav").querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"));
    expect(hrefs[0]).toBe("https://waze.com/ul?ll=31.9,34.8&navigate=yes");
    expect(screen.getByTestId("map-pickup-business-link").getAttribute("href")).toBe("/meshek-dugma?from=map");
    expect(isPickupPoint(null)).toBe(false);
  });

  it("an approximate branch (a home business): only the button", () => {
    show(point({ kind: "branch", precision: "approximate" }));
    expect(screen.queryByTestId("map-pickup-nav")).toBeNull();
    expect(screen.getByTestId("map-pickup-business-link")).toBeTruthy();
  });

  it("picked from the list (no location): the business's own point, not its pickup", () => {
    const withLocations = {
      ...producer,
      locations: [point({ lat: 32.1, lng: 34.9 }), point({ kind: "branch", lat: 31.5, lng: 34.6 })],
    };
    expect(panelPoint(withLocations, null).kind).toBe("branch");
    expect(panelPoint({ ...producer, locations: [point()] }, null).kind).toBe("pickup");
    expect(panelPoint(producer, null)).toBeNull();
    render(
      <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
        <MapPickupPointPanel producer={withLocations} location={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("pickup-days")).toBeNull();
    const waze = screen.getByTestId("map-pickup-nav").querySelector("a").getAttribute("href");
    expect(waze).toBe("https://waze.com/ul?ll=31.5,34.6&navigate=yes");
  });

  it("no usable point at all: only the button", () => {
    show(null);
    expect(screen.queryByTestId("map-pickup-nav")).toBeNull();
    expect(screen.getByTestId("map-pickup-business-link")).toBeTruthy();
  });

  it("a point with nothing set: only the nav links and the button", () => {
    show(point({ pickup_days: null, pickup_note: null }));
    expect(screen.queryByTestId("pickup-terms")).toBeNull();
    expect(screen.queryByTestId("map-pickup-note")).toBeNull();
    expect(screen.getByTestId("map-pickup-nav")).toBeTruthy();
    expect(screen.getByTestId("map-pickup-business-link")).toBeTruthy();
  });

  it("an approximate point: no nav links (the pin is not where she collects)", () => {
    show(point({ precision: "approximate", pickup_note: null }));
    expect(screen.queryByTestId("map-pickup-nav")).toBeNull();
    expect(screen.getByTestId("map-pickup-business-link")).toBeTruthy();
  });

  it("a business with no slug links by id", () => {
    render(
      <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
        <MapPickupPointPanel producer={{ ...producer, slug: null }} location={point()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("map-pickup-business-link").getAttribute("href")).toBe(`/producer/${producer.id}?from=map`);
  });

  it("several days and opening hours: every day is listed", () => {
    show(point({ pickup_days: ["שלישי", "שישי"], opening_hours: "16:00-19:00" }));
    const days = screen.getByTestId("pickup-days").textContent;
    expect(days).toContain("שלישי");
    expect(days).toContain("שישי");
  });

  it("the phone's picked card mounts the panel for a pickup pin and for a branch", () => {
    const mount = (location) =>
      render(
        <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
          <MobileSheetSelectedCard selectedProducer={producer} selectedLocation={location} onClose={() => {}} />
        </NextIntlClientProvider>,
      );
    const pickup = mount(point());
    expect(pickup.getByTestId("pickup-days")).toBeTruthy();
    pickup.unmount();
    const branch = mount(point({ kind: "branch" }));
    expect(branch.getByTestId("map-producer-card")).toBeTruthy();
    expect(branch.getByTestId("map-pickup-business-link")).toBeTruthy();
    expect(branch.queryByTestId("pickup-days")).toBeNull();
  });
});
