/**
 * MEH-1544 — order-window serialization helper (dashboard chunk 2/3).
 *
 * Covers the round-trip between the backend `producers.order_window` JSONB
 * shape and the 7-row editor model, plus the client mirror of the backend's
 * close>open rule (backend/app/schemas/schemas.py:_order_window_validator).
 */
import { describe, it, expect } from "vitest";
import {
  ORDER_WINDOW_DAYS,
  daysFromOrderWindow,
  serializeOrderWindow,
  invalidOrderDayIndices,
  emptyOrderDay,
} from "@/lib/order-window";

const WINDOW = {
  sunday: { open: "09:00", close: "14:00" },
  thursday: { open: "10:00", close: "23:00" },
};

describe("ORDER_WINDOW_DAYS", () => {
  it("has the 7 backend day keys, sunday-first", () => {
    expect(ORDER_WINDOW_DAYS).toEqual([
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ]);
  });
});

describe("daysFromOrderWindow", () => {
  it("maps each stored day onto its index and leaves the rest closed", () => {
    const days = daysFromOrderWindow(WINDOW);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ open: true, from: "09:00", to: "14:00" });
    expect(days[4]).toEqual({ open: true, from: "10:00", to: "23:00" });
    // Every other row stays closed.
    [1, 2, 3, 5, 6].forEach((i) => expect(days[i].open).toBe(false));
  });

  it("treats null / undefined / {} as seven closed rows (feature unused)", () => {
    for (const seed of [null, undefined, {}]) {
      const days = daysFromOrderWindow(seed);
      expect(days).toHaveLength(7);
      expect(days.every((d) => d.open === false)).toBe(true);
    }
  });

  it("ignores unknown day keys rather than throwing", () => {
    const days = daysFromOrderWindow({ funday: { open: "09:00", close: "14:00" } });
    expect(days.every((d) => d.open === false)).toBe(true);
  });

  it("falls back to a closed row for a malformed stored time", () => {
    const days = daysFromOrderWindow({ sunday: { open: "9:00", close: "14:00" } });
    expect(days[0]).toEqual(emptyOrderDay());
  });
});

describe("serializeOrderWindow", () => {
  it("round-trips a stored window unchanged", () => {
    expect(serializeOrderWindow(daysFromOrderWindow(WINDOW))).toEqual(WINDOW);
  });

  it("returns null when no day is open (the null-clear body)", () => {
    const days = daysFromOrderWindow(null);
    expect(serializeOrderWindow(days)).toBeNull();
  });

  it("clearing every day from a filled window yields null", () => {
    const cleared = daysFromOrderWindow(WINDOW).map((d) => ({ ...d, open: false }));
    expect(serializeOrderWindow(cleared)).toBeNull();
  });

  it("emits only open days, keyed by the backend day names", () => {
    const days = daysFromOrderWindow(null);
    days[5] = { open: true, from: "08:00", to: "12:30" };
    expect(serializeOrderWindow(days)).toEqual({
      friday: { open: "08:00", close: "12:30" },
    });
  });
});

describe("invalidOrderDayIndices", () => {
  it("flags close === open and close < open on open rows", () => {
    const days = daysFromOrderWindow(null);
    days[0] = { open: true, from: "14:00", to: "14:00" };
    days[1] = { open: true, from: "16:00", to: "09:00" };
    expect(invalidOrderDayIndices(days)).toEqual([0, 1]);
  });

  it("ignores closed rows even when their times are inverted", () => {
    const days = daysFromOrderWindow(null);
    days[2] = { open: false, from: "18:00", to: "08:00" };
    expect(invalidOrderDayIndices(days)).toEqual([]);
  });

  it("returns no indices for a valid window", () => {
    expect(invalidOrderDayIndices(daysFromOrderWindow(WINDOW))).toEqual([]);
  });
});
