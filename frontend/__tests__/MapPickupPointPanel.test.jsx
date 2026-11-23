/**
 * MEH-3756 — the phone map's picked card, when the tapped pin is a pickup
 * point or a market stand: its days and «הוראות איסוף», Waze / Google Maps to
 * the point (exact points only), and «לדף בית העסק». A branch pin shows none
 * of it. Rendered with the real he.json.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

import MapPickupPointPanel, { isPickupPoint } from "@/app/[locale]/map/components/MapPickupPointPanel";

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

  it("a branch or the primary pin: no panel", () => {
    show(point({ kind: "branch" }));
    expect(screen.queryByTestId("map-pickup-panel")).toBeNull();
    expect(isPickupPoint(null)).toBe(false);
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
});
