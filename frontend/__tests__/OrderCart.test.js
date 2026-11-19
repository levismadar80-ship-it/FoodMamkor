import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

import api from "@/lib/api";
import {
  MAX_LINES,
  MAX_QTY_PER_ITEM,
  keepOrderable,
  loadOrderMenu,
  pickedCount,
  pickedTotalAgorot,
  setQty,
} from "@/lib/order-cart";

const ID_A = "0a000000-0000-4000-8000-00000000000a";
const ID_B = "0b000000-0000-4000-8000-00000000000b";
const PRODUCER = "7e57a6f0-0000-4000-8000-000000000007";

const product = (id, over = {}) => ({
  id,
  name: "חלה",
  image_url: null,
  price_min_agorot: 2500,
  price_max_agorot: 2500,
  price_unit: "unit",
  price_is_estimate: false,
  in_stock: true,
  contains_alcohol: false,
  ...over,
});

const MENU = {
  producer_id: PRODUCER,
  min_order_agorot: null,
  cancel_cutoff_hours: 12,
  lead_time_hours: 24,
  business_id_number: "512345678",
  products: [product(ID_A)],
  slots: [],
};

describe("setQty", () => {
  it("adds, changes and removes a line", () => {
    const one = setQty({}, { id: ID_A, qty: 1 });
    expect(one).toEqual({ [ID_A]: 1 });
    expect(setQty(one, { id: ID_A, qty: 3 })).toEqual({ [ID_A]: 3 });
    expect(setQty(one, { id: ID_A, qty: 0 })).toEqual({});
  });

  it("stops at the per-product cap the server enforces", () => {
    const full = { [ID_A]: MAX_QTY_PER_ITEM };
    expect(setQty(full, { id: ID_A, qty: MAX_QTY_PER_ITEM + 1 })).toBe(full);
  });

  it("refuses a new line past the line cap, but still changes an existing one", () => {
    const picks = Object.fromEntries(Array.from({ length: MAX_LINES }, (_, i) => [`p${i}`, 1]));
    expect(setQty(picks, { id: "new", qty: 1 })).toBe(picks);
    expect(setQty(picks, { id: "p0", qty: 2 }).p0).toBe(2);
  });
});

describe("sums", () => {
  it("counts items, not lines", () => {
    expect(pickedCount({})).toBe(0);
    expect(pickedCount({ [ID_A]: 2 })).toBe(2);
    expect(pickedCount({ [ID_A]: 2, [ID_B]: 1 })).toBe(3);
  });

  it("totals a range at its high end, as the order route stores it, and skips what left the menu or sold out", () => {
    const products = [
      product(ID_A),
      product(ID_B, { price_min_agorot: 6000, price_max_agorot: 8000, price_is_estimate: true }),
    ];
    expect(pickedTotalAgorot({ [ID_A]: 2, [ID_B]: 1 }, products)).toBe(13000);
    expect(pickedTotalAgorot({ [ID_A]: 1, gone: 5 }, products)).toBe(2500);
    const soldOut = [product(ID_A, { in_stock: false })];
    expect(pickedTotalAgorot({ [ID_A]: 1 }, soldOut)).toBe(0);
  });

  it("keeps only picks that are still orderable", () => {
    const products = [product(ID_A), product(ID_B, { in_stock: false })];
    expect(keepOrderable({ [ID_A]: 1, [ID_B]: 2, gone: 1 }, products)).toEqual({ [ID_A]: 1 });
  });
});

describe("loadOrderMenu", () => {
  it("returns the parsed menu", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: MENU });
    const menu = await loadOrderMenu(PRODUCER);
    expect(api.get).toHaveBeenCalledWith(`/producers/${PRODUCER}/order-menu`);
    expect(menu?.products[0].id).toBe(ID_A);
  });

  it("returns null on a 404 or a payload that does not parse", async () => {
    vi.mocked(api.get).mockRejectedValueOnce({ response: { status: 404 } });
    expect(await loadOrderMenu(PRODUCER)).toBeNull();
    vi.mocked(api.get).mockResolvedValueOnce({ data: { ...MENU, products: "nope" } });
    expect(await loadOrderMenu(PRODUCER)).toBeNull();
  });
});
