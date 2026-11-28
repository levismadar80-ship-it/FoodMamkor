// @ts-check
// MEH-3970: delivery hours with no city priced are not offered to buyers, and
// the «מתי מוסרים הזמנות» card says so, with a link to the delivery settings.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

import OrderWindowsCard from "@/components/dashboard/orders/OrderWindowsCard";

const pickup = { weekday: 0, start_time: "09:00", end_time: "12:00", fulfilment: "pickup" };
const delivery = { ...pickup, start_time: "16:00", end_time: "19:00", fulfilment: "delivery" };

/** @param {any[]} windows @param {boolean} deliveryPriced */
function show(windows, deliveryPriced) {
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <OrderWindowsCard windows={windows} orderWindow={null} deliveryPriced={deliveryPriced} />
    </NextIntlClientProvider>,
  );
}

const line = () => screen.queryByTestId("order-windows-no-delivery-price");

describe("OrderWindowsCard: delivery hours with nothing priced (MEH-3970)", () => {
  it("0 delivery rows: no line, even with nothing priced", () => {
    show([pickup], false);
    expect(line()).toBeNull();
  });

  it("1 delivery row, nothing priced: the line and a link to the delivery settings", () => {
    show([pickup, delivery], false);
    expect(line()).toHaveTextContent("עד אז לקוחות יראו רק איסוף עצמי");
    const link = screen.getByRole("link", { name: "להגדרת המשלוחים" });
    expect(link.getAttribute("href")).toMatch(/\/producer\/dashboard\/edit#delivery$/);
  });

  it("many delivery rows, priced: no line", () => {
    show([delivery, { ...delivery, weekday: 1 }, { ...delivery, weekday: 2 }], true);
    expect(line()).toBeNull();
  });

  it("switching her only row to delivery shows the line before she saves", () => {
    show([pickup], false);
    expect(line()).toBeNull();
    const row = screen.getByTestId("order-window-row");
    fireEvent.change(within(row).getByLabelText("איסוף או משלוח"), { target: { value: "delivery" } });
    expect(line()).not.toBeNull();
  });
});
