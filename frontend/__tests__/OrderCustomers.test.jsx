/**
 * MEH-3561 — «הלקוחות שלכם» in the orders tab, and its CSV.
 *
 * The 5-state matrix: 0 customers (empty line, no download) / 1 / many
 * (first FIRST_ROWS, «עוד …» opens the rest, and closes again). Rendered with
 * the real he.json, so a missing key or a broken plural is read, not mocked.
 *
 * Discrimination: show the tag from 1 order → the «לקוח חוזר» case goes red;
 * render the card on a failed read → the failure case goes red; drop the
 * formula guard in csvCell → the injection case goes red; drop the BOM → the
 * CSV case goes red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
import api from "@/lib/api";
import OrderCustomersCard, { FIRST_ROWS } from "@/components/dashboard/orders/OrderCustomersCard";
import { csvCell, customersCsv } from "@/lib/order-customers";

const customer = (i, over = {}) => ({
  name: `לקוח ${i}`,
  phone: `97250000${String(i).padStart(4, "0")}`,
  order_count: 1,
  last_order_at: "2026-11-19T08:00:00",
  ...over,
});

function renderCard(rows) {
  api.get.mockResolvedValueOnce({ data: { customers: rows } });
  return render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <OrderCustomersCard />
    </NextIntlClientProvider>,
  );
}

describe("OrderCustomersCard", () => {
  beforeEach(() => api.get.mockReset());

  it("reads the customers route", async () => {
    renderCard([]);
    await screen.findByTestId("orders-customers");
    expect(api.get).toHaveBeenCalledWith("/producers/me/product-orders/customers");
  });

  it("0 customers: the empty line, the note, and no download", async () => {
    renderCard([]);
    expect((await screen.findByTestId("orders-customers-empty")).textContent).toBe(
      he.dashboard.producer.orders.customers.empty,
    );
    expect(screen.queryByTestId("orders-customers-csv")).toBeNull();
    expect(screen.getByTestId("orders-customers").textContent).toContain(he.dashboard.producer.orders.customers.note);
  });

  it("1 customer with one order: one row, no «לקוח חוזר»", async () => {
    renderCard([customer(1)]);
    const rows = await screen.findAllByTestId("orders-customers-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("לקוח 1 · הזמנה אחת · אחרונה ב-");
    expect(screen.queryByTestId("orders-customers-repeat")).toBeNull();
    expect(screen.getByTestId("orders-customers-csv")).toBeTruthy();
    expect(screen.queryByTestId("orders-customers-more")).toBeNull();
  });

  it("dates read in Israel time: 22:30 UTC on the 19th is the 20th", async () => {
    renderCard([customer(1, { last_order_at: "2026-11-19T22:30:00Z" })]);
    const [row] = await screen.findAllByTestId("orders-customers-row");
    expect(row.textContent).toContain("20.11.2026");
  });

  it("two orders make a returning customer, with the dual form", async () => {
    renderCard([customer(1, { order_count: 2 }), customer(2, { order_count: 5 })]);
    const rows = await screen.findAllByTestId("orders-customers-row");
    expect(rows[0].textContent).toContain("שתי הזמנות");
    expect(rows[1].textContent).toContain("5 הזמנות");
    expect(screen.getAllByTestId("orders-customers-repeat")).toHaveLength(2);
  });

  it("many: the first rows, then «עוד …» opens the rest and closes again", async () => {
    const many = Array.from({ length: FIRST_ROWS + 3 }, (_, i) => customer(i + 1));
    renderCard(many);
    expect(await screen.findAllByTestId("orders-customers-row")).toHaveLength(FIRST_ROWS);
    const more = screen.getByTestId("orders-customers-more");
    expect(more.textContent).toContain("עוד 3 לקוחות");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(screen.getAllByTestId("orders-customers-row")).toHaveLength(FIRST_ROWS + 3);
    expect(screen.getByTestId("orders-customers-more").getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByTestId("orders-customers-more"));
    expect(screen.getAllByTestId("orders-customers-row")).toHaveLength(FIRST_ROWS);
  });

  it("a failed read shows nothing, not «no customers»", async () => {
    api.get.mockRejectedValueOnce(new Error("500"));
    render(
      <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
        <OrderCustomersCard />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("orders-customers")).toBeNull();
  });
});

describe("customers CSV", () => {
  it("a BOM, the headers, a local phone and one row per customer", () => {
    const csv = customersCsv(
      [customer(1, { order_count: 3 }), customer(2)],
      ["שם", "טלפון", "הזמנות", "הזמנה אחרונה"],
      () => "19.11.2026",
    );
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toEqual([
      '"שם","טלפון","הזמנות","הזמנה אחרונה"',
      '"לקוח 1","050-000-0001","3","19.11.2026"',
      '"לקוח 2","050-000-0002","1","19.11.2026"',
    ]);
  });

  it.each(["=HYPERLINK(\"x\")", "+972", "-1", "@SUM(A1)", "\tx"])(
    "a name that starts a formula (%s) is written as text",
    (name) => {
      expect(csvCell(name).startsWith(`"'`)).toBe(true);
    },
  );

  it("quotes are doubled and an ordinary name is untouched", () => {
    expect(csvCell('דנה "הקטנה"')).toBe('"דנה ""הקטנה"""');
    expect(csvCell("דנה")).toBe('"דנה"');
  });
});
