// MEH-3770: the warning after a vacation or a closed date overlaps orders the
// business already accepted.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/toast", () => ({ showToast: { info: vi.fn() } }));
vi.mock("@/lib/product-orders", async (importOriginal) => ({
  ...(await importOriginal()),
  loadAcceptedOrders: vi.fn(),
}));

import { loadAcceptedOrders } from "@/lib/product-orders";
import { showToast } from "@/lib/toast";
import { LISTED, ORDERS_HREF, onClosedDays, warnClosedDayOrders } from "@/lib/closed-day-orders";

// 22:30 UTC on 9/12 is already 10/12 in Israel (UTC+2 in December).
const order = (id, slot, name = `לקוח ${id}`) => ({ id, slot_start: slot, customer_name: name });
const t = (key, values) => (key === "warning" ? `${values.count}|${values.list}` : key);

describe("onClosedDays", () => {
  const orders = [
    order(1, "2026-12-09T22:30:00Z"), // Israel 10/12
    order(2, "2026-12-11T08:00:00Z"),
    order(3, "2026-12-20T08:00:00Z"),
  ];

  it("matches a single closed date by the Israel day, not the UTC day", () => {
    expect(onClosedDays(orders, { dates: ["2026-12-10"] }).map((o) => o.id)).toEqual([1]);
    expect(onClosedDays(orders, { dates: ["2026-12-09"] })).toEqual([]);
  });

  it("takes both ends of a vacation as closed", () => {
    const hit = onClosedDays(orders, { from: "2026-12-10", until: "2026-12-11" });
    expect(hit.map((o) => o.id)).toEqual([1, 2]);
  });

  it("an open-ended vacation covers every later order", () => {
    const hit = onClosedDays(orders, { from: "2026-12-11", openEnded: true });
    expect(hit.map((o) => o.id)).toEqual([2, 3]);
  });

  it("a vacation with no end and not open-ended covers nothing", () => {
    expect(onClosedDays(orders, { from: "2026-12-10", until: null })).toEqual([]);
  });

  it("skips an order with no slot", () => {
    expect(onClosedDays([{ id: 9, customer_name: "x" }], { dates: ["2026-12-10"] })).toEqual([]);
  });
});

describe("warnClosedDayOrders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("0 orders on the closed days: no toast", async () => {
    loadAcceptedOrders.mockResolvedValue([order(1, "2026-12-20T08:00:00Z")]);
    expect(await warnClosedDayOrders({ dates: ["2026-12-10"] }, { t, locale: "he" })).toBe(0);
    expect(showToast.info).not.toHaveBeenCalled();
  });

  it("1 order: names it and links to the orders tab", async () => {
    loadAcceptedOrders.mockResolvedValue([order(1, "2026-12-10T08:00:00Z", "דנה")]);
    expect(await warnClosedDayOrders({ dates: ["2026-12-10"] }, { t, locale: "he" })).toBe(1);
    const [text, opts] = showToast.info.mock.calls[0];
    expect(text.startsWith("1|דנה, ")).toBe(true);
    expect(opts.action).toEqual({ label: "action", href: ORDERS_HREF });
  });

  it("many orders: counts all, lists only the first few", async () => {
    const many = [1, 2, 3, 4, 5].map((i) => order(i, "2026-12-10T08:00:00Z"));
    loadAcceptedOrders.mockResolvedValue(many);
    expect(await warnClosedDayOrders({ dates: ["2026-12-10"] }, { t, locale: "he" })).toBe(5);
    const [text] = showToast.info.mock.calls[0];
    expect(text.split("|")[0]).toBe("5");
    expect(text.split("; ")).toHaveLength(LISTED);
    expect(text).not.toContain("לקוח 4");
  });

  it("the orders read fails: no toast and no throw", async () => {
    loadAcceptedOrders.mockRejectedValue(new Error("404"));
    expect(await warnClosedDayOrders({ dates: ["2026-12-10"] }, { t, locale: "he" })).toBe(0);
    expect(showToast.info).not.toHaveBeenCalled();
  });
});
