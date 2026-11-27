/**
 * MEH-3511 — the delivery-terms editor inside DeliveryCard (owner dashboard +
 * admin «משלוח ותשלום», which mounts the same card).
 * Covers: the business-wide minimum + delivery time are sent and round-trip;
 * a zone's own time and cutoff are sent; a nationwide business shows the
 * «אזורים בתנאים אחרים» editor (0 / 1 zone) and keeps its zone cities; a
 * business that fills nothing new sends nulls (today's answer).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { DeliveryCard } from "@/app/[locale]/producer/dashboard/edit/cards";
import { setTime } from "./helpers/time-of-day";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const D = he.dashboard.producer.delivery;

const cities = {
  has_physical_location: true,
  offers_delivery: true,
  delivery_nationwide: false,
  delivery_areas: [{ city: "חיפה", delivery_day: "ראשון", zone_name: "צפון" }],
  delivery_zones: [{ name: "צפון", cities: ["חיפה"], delivery_days: ["ראשון"] }],
};

const nationwide = {
  has_physical_location: true,
  offers_delivery: true,
  delivery_nationwide: true,
  delivery_min_order: 150,
  delivery_days_min: 2,
  delivery_days_max: 5,
  delivery_areas: [{ city: "תל אביב-יפו", zone_name: "גוש דן, אקספרס" }],
  delivery_zones: [
    { name: "גוש דן, אקספרס", cities: ["תל אביב-יפו"], delivery_days: [], delivery_fee: 40, delivery_days_max: 1 },
  ],
};

function renderCard(profile) {
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <DeliveryCard profile={profile} onSave={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

const save = () => fireEvent.click(screen.getByRole("button", { name: D.save_cta }));
const sent = () => api.put.mock.calls.at(-1)[1];
const type = (testid, value) => fireEvent.change(screen.getByTestId(testid), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.put.mockResolvedValue({ data: {} });
});

describe("DeliveryCard — delivery terms (MEH-3511)", () => {
  it("nothing new filled: the save sends nulls for every new field", async () => {
    renderCard(cities);
    type("delivery-zone-0-name", "צפון 2"); // any change, to enable the save
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const body = sent();
    expect(body.delivery_min_order).toBeNull();
    expect(body.delivery_days_min).toBeNull();
    expect(body.delivery_days_max).toBeNull();
    expect(body.delivery_zones[0]).toMatchObject({
      delivery_days_min: null, delivery_days_max: null, order_cutoff_day: null, order_cutoff_time: null,
    });
  });

  it("the business minimum and delivery time are sent as numbers", async () => {
    renderCard(cities);
    type("delivery-min-order", "120");
    type("delivery-time-dmax", "5");
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(sent()).toMatchObject({ delivery_min_order: 120, delivery_days_min: null, delivery_days_max: 5 });
  });

  it("a zone's own time and order cutoff are sent", async () => {
    renderCard(cities);
    type("delivery-zone-0-time-dmin", "1");
    type("delivery-zone-0-time-dmax", "2");
    fireEvent.change(screen.getByTestId("delivery-zone-0-cutoff-day"), { target: { value: "רביעי" } });
    setTime(screen.getByTestId("delivery-zone-0-cutoff-time"), "15:00"); // MEH-3955: 24-hour selects
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(sent().delivery_zones[0]).toMatchObject({
      name: "צפון", cities: ["חיפה"], delivery_days_min: 1, delivery_days_max: 2,
      order_cutoff_day: "רביעי", order_cutoff_time: "15:00",
    });
  });

  it("half a zone cutoff says so instead of the hint", () => {
    renderCard(cities);
    expect(screen.getByText(D.zone_cutoff_hint)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("delivery-zone-0-cutoff-day"), { target: { value: "רביעי" } });
    expect(screen.getByText(he.settings.locations.form.pickup_cutoff_half)).toBeInTheDocument();
  });

  it("nationwide, 1 zone: loads the «כל הארץ» terms, keeps the zone's own cities", async () => {
    renderCard(nationwide);
    expect(screen.getByText(D.zones_label_nationwide)).toBeInTheDocument();
    expect(screen.getByTestId("delivery-zone-0-cities-free")).toBeInTheDocument();
    expect(screen.getByTestId("delivery-min-order").value).toBe("150");
    expect(screen.getByTestId("delivery-time-dmax").value).toBe("5");
    type("delivery-zone-0-fee", "35");
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const body = sent();
    expect(body.delivery_nationwide).toBe(true);
    expect(body.delivery_areas).toEqual([]);
    expect(body.delivery_zones).toEqual([
      expect.objectContaining({ name: "גוש דן, אקספרס", cities: ["תל אביב-יפו"], delivery_fee: 35, delivery_days_max: 1 }),
    ]);
    expect(body).toMatchObject({ delivery_min_order: 150, delivery_days_min: 2, delivery_days_max: 5 });
  });

  it("nationwide, 0 zones: the empty line under «אזורים בתנאים אחרים»", () => {
    renderCard({ ...nationwide, delivery_zones: [], delivery_areas: [] });
    expect(screen.getByText(D.zones_label_nationwide)).toBeInTheDocument();
    expect(screen.getByTestId("delivery-zones-empty")).toBeInTheDocument();
  });

  it("pickup only: the new fields are cleared on save", async () => {
    renderCard(nationwide);
    fireEvent.click(screen.getByLabelText(D.offers_delivery));
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(sent()).toMatchObject({ delivery_min_order: null, delivery_days_min: null, delivery_days_max: null, delivery_zones: [] });
  });
});
