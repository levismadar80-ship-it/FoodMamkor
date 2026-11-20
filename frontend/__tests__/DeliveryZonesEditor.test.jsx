/**
 * MEH-3484 — «אזורי משלוח» inside the DeliveryCard (owner dashboard + admin).
 * States: 0 / 1 / many zones; a city ticked in a zone takes the zone's values
 * (its own boxes give way to «באזור …»); a city sits in one zone only; the
 * save sends `delivery_zones`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { DeliveryCard } from "@/app/[locale]/producer/dashboard/edit/cards";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const D = he.dashboard.producer.delivery;

const base = {
  has_physical_location: true,
  offers_delivery: true,
  delivery_nationwide: false,
  delivery_areas: [
    { city: "קריית ביאליק", delivery_day: "שני", delivery_days: ["שני", "חמישי"], zone_name: "קריות", min_order: 120 },
    { city: "קריית מוצקין", delivery_day: "שני", delivery_days: ["שני", "חמישי"], zone_name: "קריות", min_order: 120 },
    { city: "חיפה", delivery_day: "ראשון" },
  ],
  delivery_zones: [
    { name: "קריות", cities: ["קריית ביאליק", "קריית מוצקין"], delivery_days: ["שני", "חמישי"], min_order: 120, delivery_fee: 25, free_delivery_above: 300 },
  ],
};

function renderCard(profile) {
  const onSave = vi.fn();
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <DeliveryCard profile={profile} onSave={onSave} />
    </NextIntlClientProvider>,
  );
  return { onSave };
}

const save = () => fireEvent.click(screen.getByRole("button", { name: D.save_cta }));
const sent = () => api.put.mock.calls.at(-1)[1];

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.put.mockResolvedValue({ data: {} });
});

describe("DeliveryZonesEditor (MEH-3484)", () => {
  it("0 zones: the empty line and the add button; the save sends []", async () => {
    renderCard({ ...base, delivery_zones: [], delivery_areas: [{ city: "חיפה", delivery_day: "ראשון" }] });
    expect(screen.getByTestId("delivery-zones-empty").textContent).toBe(D.zone_empty);
    expect(screen.getByTestId("delivery-day-select-חיפה")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("delivery-day-select-חיפה"), { target: { value: "שני" } });
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(sent().delivery_zones).toEqual([]);
  });

  it("1 zone: its cities show the zone instead of their own boxes", () => {
    renderCard(base);
    expect(screen.queryByTestId("delivery-zones-empty")).toBeNull();
    expect(screen.getByTestId("delivery-city-zone-קריית ביאליק").textContent).toContain("באזור קריות");
    expect(screen.queryByTestId("delivery-day-select-קריית ביאליק")).toBeNull();
    expect(screen.getByTestId("delivery-day-select-חיפה")).toBeInTheDocument();
    expect(screen.getByTestId("delivery-zone-0-day-חמישי")).toBeChecked();
    expect(screen.getByTestId("delivery-zone-0-free")).toHaveValue(300);
  });

  it("many zones: a city ticked in a second zone leaves the first", async () => {
    renderCard(base);
    fireEvent.click(screen.getByRole("button", { name: D.zone_add }));
    fireEvent.change(screen.getByTestId("delivery-zone-1-name"), { target: { value: "חיפה והסביבה" } });
    fireEvent.click(screen.getByTestId("delivery-zone-1-city-קריית מוצקין"));
    fireEvent.click(screen.getByTestId("delivery-zone-1-day-ראשון"));
    expect(screen.getByTestId("delivery-zone-0-city-קריית מוצקין")).not.toBeChecked();
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(sent().delivery_zones).toEqual([
      { name: "קריות", cities: ["קריית ביאליק"], delivery_days: ["שני", "חמישי"], min_order: 120, delivery_fee: 25, free_delivery_above: 300, delivery_days_min: null, delivery_days_max: null, order_cutoff_day: null, order_cutoff_time: null },
      { name: "חיפה והסביבה", cities: ["קריית מוצקין"], delivery_days: ["ראשון"], min_order: null, delivery_fee: null, free_delivery_above: null, delivery_days_min: null, delivery_days_max: null, order_cutoff_day: null, order_cutoff_time: null },
    ]);
  });

  it("deleting the only zone gives each city its own boxes back", () => {
    renderCard(base);
    fireEvent.click(screen.getByTestId("delivery-zone-0-remove"));
    expect(screen.getByTestId("delivery-zones-empty")).toBeInTheDocument();
    expect(screen.getByTestId("delivery-day-select-קריית ביאליק")).toBeInTheDocument();
  });

  it("a city outside every zone keeps its other stored days on save", async () => {
    renderCard({
      ...base,
      delivery_zones: [],
      delivery_areas: [{ city: "עכו", delivery_day: "שלישי", delivery_days: ["שלישי", "שישי"] }],
    });
    fireEvent.change(screen.getByTestId("delivery-min-input-עכו"), { target: { value: "90" } });
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(sent().delivery_areas[0].delivery_days).toEqual(["שלישי", "שישי"]);
  });

  // MEH-3511 reversed this (was «nationwide sends no zones»): a nationwide
  // business keeps its zones as areas on other terms, and their cities are
  // its own — there is no city list to drop them against.
  it("nationwide keeps its zones and their cities (MEH-3511)", async () => {
    renderCard(base);
    fireEvent.click(screen.getByLabelText(D.delivery_nationwide));
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(sent().delivery_areas).toEqual([]);
    expect(sent().delivery_zones.map((z) => [z.name, z.cities])).toEqual([
      ["קריות", ["קריית ביאליק", "קריית מוצקין"]],
    ]);
  });

  it("pickup only sends no zones", async () => {
    renderCard(base);
    fireEvent.click(screen.getByLabelText(D.offers_delivery));
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(sent().delivery_zones).toEqual([]);
  });
});
