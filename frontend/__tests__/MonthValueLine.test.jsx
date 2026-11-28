// MEH-3194 point 1: «מה הגיע דרך האתר החודש» on the dashboard home.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import MonthValueLine from "@/components/producer/MonthValueLine";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

const summary = (bookings, value) => ({
  month: "2026-11", phase: "launch", bookings, value_agorot: value, by_kind: [],
  threshold_agorot: 300000, over_threshold: false, fee_without_subscription_agorot: 1234,
  fee_with_subscription_agorot: 5678, charged_agorot: 0, price_list_version: 1,
});
const mount = () => render(
  <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
    <MonthValueLine />
  </NextIntlClientProvider>,
);
const line = () => screen.findByTestId("month-value-line");

describe("MonthValueLine", () => {
  beforeEach(() => api.get.mockReset());

  it("0 bookings: «עוד אין הזמנות», with no «0 ₪»", async () => {
    api.get.mockResolvedValueOnce({ data: summary(0, 0) });
    mount();
    expect((await line()).textContent).toBe("עוד אין הזמנות דרך האתר החודש");
  });

  it("1 booking with a value", async () => {
    api.get.mockResolvedValueOnce({ data: summary(1, 8600) });
    mount();
    expect((await line()).textContent).toBe("החודש הגיעה דרך האתר הזמנה אחת, בשווי 86₪");
  });

  it("many bookings with a value", async () => {
    api.get.mockResolvedValueOnce({ data: summary(12, 345050) });
    mount();
    expect((await line()).textContent).toBe("החודש הגיעו דרך האתר 12 הזמנות, בשווי 3,450.5₪");
  });

  it("free sign-ups only (value 0) drop the «בשווי» part", async () => {
    api.get.mockResolvedValueOnce({ data: summary(3, 0) });
    mount();
    expect((await line()).textContent).toBe("החודש הגיעו דרך האתר 3 הזמנות");
  });

  it("1 booking with no value (a free sign-up) drops the «בשווי» part", async () => {
    api.get.mockResolvedValueOnce({ data: summary(1, 0) });
    mount();
    expect((await line()).textContent).toBe("החודש הגיעה דרך האתר הזמנה אחת");
  });

  // MEH-3980: product orders are not in the ledger; the line adds them.
  it("product orders only: counted with their value", async () => {
    api.get.mockResolvedValueOnce({ data: { ...summary(0, 0), product_orders: 4, product_orders_value_agorot: 21600 } });
    mount();
    expect((await line()).textContent).toBe("החודש הגיעו דרך האתר 4 הזמנות, בשווי 216₪");
  });

  it("product orders and ledger bookings add up", async () => {
    api.get.mockResolvedValueOnce({ data: { ...summary(1, 8600), product_orders: 1, product_orders_value_agorot: 4200 } });
    mount();
    expect((await line()).textContent).toBe("החודש הגיעו דרך האתר 2 הזמנות, בשווי 128₪");
  });

  it("1 product order with no value: singular, no «בשווי»", async () => {
    api.get.mockResolvedValueOnce({ data: { ...summary(0, 0), product_orders: 1, product_orders_value_agorot: 0 } });
    mount();
    expect((await line()).textContent).toBe("החודש הגיעה דרך האתר הזמנה אחת");
  });

  it("holds its height while the read is in flight", () => {
    api.get.mockReturnValueOnce(new Promise(() => {}));
    mount();
    expect(screen.getByTestId("month-value-line-pending")).toHaveClass("h-5");
  });

  it("never shows a fee", async () => {
    api.get.mockResolvedValueOnce({ data: summary(2, 10000) });
    mount();
    const text = (await line()).textContent;
    expect(text).not.toContain("12.34");
    expect(text).not.toContain("56.78");
  });

  it("a failed or malformed read renders nothing", async () => {
    api.get.mockRejectedValueOnce(new Error("down"));
    const { container, unmount } = mount();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    unmount();
    api.get.mockResolvedValueOnce({ data: { bookings: "many" } });
    const again = mount();
    await waitFor(() => expect(again.container).toBeEmptyDOMElement());
  });
});
