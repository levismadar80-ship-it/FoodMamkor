// @ts-check
// MEH-3971: a delivery order's card names the city beside the street; a
// business may deliver to several cities.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

import OrderCard from "@/components/dashboard/orders/OrderCard";

const HOUR_MS = 60 * 60 * 1000; // eslint-disable-line no-magic-numbers -- an hour from now

/** @param {Record<string, any>} over */
function order(over) {
  const start = new Date(Date.now() + HOUR_MS).toISOString();
  return {
    id: "o-1",
    status: "pending",
    fulfilment: "delivery",
    slot_start: start,
    slot_end: start,
    items: [{ name: "חלה", qty: 1, unit_price_agorot: 2800, price_unit: "unit", price_is_estimate: false, contains_alcohol: false }],
    estimated_total_agorot: 2800,
    final_total_agorot: null,
    delivery_fee_agorot: 2000,
    customer_name: "נועה",
    customer_phone: "972501234567",
    delivery_address: null,
    delivery_city: null,
    note: null,
    expires_at: null,
    age_declared: false,
    has_estimate: false,
    ...over,
  };
}

/** @param {Record<string, any>} over */
function show(over) {
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <ul><OrderCard order={order(over)} onChanged={() => {}} /></ul>
    </NextIntlClientProvider>,
  );
}

describe("OrderCard: where a delivery goes (MEH-3971)", () => {
  it("street and city", () => {
    show({ delivery_address: "הרצל 12 דירה 3", delivery_city: "חדרה" });
    expect(screen.getByTestId("order-address")).toHaveTextContent("כתובת למשלוח: הרצל 12 דירה 3, חדרה");
  });

  it("an older row with the street only", () => {
    show({ delivery_address: "הרצל 12" });
    expect(screen.getByTestId("order-address").textContent).toBe("כתובת למשלוח: הרצל 12");
  });

  it("a pickup has no address line", () => {
    show({ fulfilment: "pickup", delivery_fee_agorot: 0 });
    expect(screen.queryByTestId("order-address")).toBeNull();
  });
});
