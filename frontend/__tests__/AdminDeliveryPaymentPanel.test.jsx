/**
 * MEH-3475 — the admin fills delivery (day + minimum per city), order window
 * and payment on the admin edit page, with the owner's own editors.
 *
 * Cells: bulk day × (0/1 city: hidden · many: shown) × (none ticked: apply
 * disabled · ticked: applies to ticked only) · minimum per city sent · every
 * editor saves to the ADMIN route, never /producers/me.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import AdminDeliveryPaymentPanel from "@/components/admin/AdminDeliveryPaymentPanel";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const D = he.dashboard.producer.delivery;
const P = he.dashboard.producer;

const area = (city, extra = {}) => ({ city, delivery_day: null, min_order: null, delivery_fee: null, ...extra });

function mount(areas) {
  const producer = {
    has_physical_location: true,
    offers_delivery: true,
    delivery_nationwide: false,
    delivery_areas: areas,
    locations: [],
    order_window: null,
    payment_info: null,
  };
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AdminDeliveryPaymentPanel producerId="biz-1" producer={producer} />
    </NextIntlClientProvider>,
  );
}

const saveDelivery = () =>
  fireEvent.click(within(screen.getByTestId("admin-section-delivery")).getByRole("button", { name: D.save_cta }));
const sentRows = () => api.put.mock.calls[0][1].delivery_areas;

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.put.mockResolvedValue({ data: {} });
});

describe("AdminDeliveryPaymentPanel (MEH-3475)", () => {
  it("renders the three owner editors under their owner headings", () => {
    mount([area("חיפה")]);
    expect(screen.getByTestId("admin-section-delivery")).toHaveTextContent(D.heading);
    expect(screen.getByTestId("admin-section-order-window")).toHaveTextContent(P.order_window.heading);
    expect(screen.getByTestId("admin-section-payment-info")).toHaveTextContent(P.payment_info.heading);
  });

  it("one city: no bulk step", () => {
    mount([area("חיפה")]);
    expect(screen.queryByTestId("delivery-bulk-day")).not.toBeInTheDocument();
  });

  it("many cities, none ticked: apply is disabled", () => {
    mount([area("חיפה"), area("עכו")]);
    expect(screen.getByTestId("delivery-bulk-day")).toBeInTheDocument();
    expect(screen.getByTestId("delivery-bulk-apply")).toBeDisabled();
  });

  it("bulk day goes to the ticked cities only and saves to the admin route", async () => {
    mount([area("חיפה"), area("עכו"), area("נהריה", { delivery_day: "שני" })]);
    fireEvent.click(screen.getByTestId("delivery-bulk-city-חיפה"));
    fireEvent.click(screen.getByTestId("delivery-bulk-city-עכו"));
    fireEvent.change(screen.getByTestId("delivery-bulk-day-select"), { target: { value: "שלישי" } });
    fireEvent.click(screen.getByTestId("delivery-bulk-apply"));
    expect(screen.getByTestId("delivery-day-select-חיפה")).toHaveValue("שלישי");
    expect(screen.getByTestId("delivery-day-select-נהריה")).toHaveValue("שני");
    saveDelivery();
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put.mock.calls[0][0]).toBe("/admin/producers/biz-1");
    const days = Object.fromEntries(sentRows().map((r) => [r.city, r.delivery_day]));
    expect(days).toEqual({ "חיפה": "שלישי", "עכו": "שלישי", "נהריה": "שני" });
  });

  it("a minimum typed per city is sent as a number; an empty one as null", async () => {
    mount([area("חיפה", { min_order: 100 }), area("עכו")]);
    expect(screen.getByTestId("delivery-min-input-חיפה")).toHaveValue(100);
    fireEvent.change(screen.getByTestId("delivery-min-input-עכו"), { target: { value: "150" } });
    fireEvent.change(screen.getByTestId("delivery-min-input-חיפה"), { target: { value: "" } });
    saveDelivery();
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const mins = Object.fromEntries(sentRows().map((r) => [r.city, r.min_order]));
    expect(mins).toEqual({ "חיפה": null, "עכו": 150 });
  });

  it("payment info saves to the admin route", async () => {
    mount([area("חיפה")]);
    fireEvent.click(screen.getByTestId("payment-method-cash"));
    fireEvent.click(screen.getByTestId("payment-info-save"));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put.mock.calls[0][0]).toBe("/admin/producers/biz-1");
    expect(api.put.mock.calls[0][1].payment_info.methods).toContain("cash");
  });
});
