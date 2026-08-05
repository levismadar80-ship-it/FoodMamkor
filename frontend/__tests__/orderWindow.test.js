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
    // MEH-1869: a row now carries a LIST of ranges. The legacy single-dict
    // stored shape reads as exactly one range — that equivalence is the
    // backward-compat guarantee, so it is asserted rather than assumed.
    expect(days[0]).toEqual({ open: true, ranges: [{ from: "09:00", to: "14:00" }] });
    expect(days[4]).toEqual({ open: true, ranges: [{ from: "10:00", to: "23:00" }] });
    // Every other row stays closed.
    [1, 2, 3, 5, 6].forEach((i) => expect(days[i].open).toBe(false));
  });

  // MEH-1869 — the new capability.
  it("reads a stored day with several ranges as several editor ranges", () => {
    const days = daysFromOrderWindow({
      sunday: [
        { open: "09:00", close: "13:00" },
        { open: "16:00", close: "20:00" },
      ],
    });
    expect(days[0]).toEqual({
      open: true,
      ranges: [
        { from: "09:00", to: "13:00" },
        { from: "16:00", to: "20:00" },
      ],
    });
  });

  it("drops only the malformed range, keeping the good one on the same day", () => {
    const days = daysFromOrderWindow({
      sunday: [
        { open: "09:00", close: "13:00" },
        { open: "9:00", close: "20:00" },
      ],
    });
    expect(days[0].open).toBe(true);
    expect(days[0].ranges).toEqual([{ from: "09:00", to: "13:00" }]);
  });

  it("caps a stored day at 3 ranges rather than rendering a 4th row", () => {
    const days = daysFromOrderWindow({
      sunday: [
        { open: "06:00", close: "07:00" },
        { open: "08:00", close: "09:00" },
        { open: "10:00", close: "11:00" },
        { open: "12:00", close: "13:00" },
      ],
    });
    expect(days[0].ranges).toHaveLength(3);
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
  it("normalises a legacy stored window into the canonical list shape", () => {
    // MEH-1869: writes are ALWAYS the list shape, so a legacy dict does not
    // round-trip byte-identically — it round-trips SEMANTICALLY, into the shape
    // the backend validator now stores. Asserting the exact output is what
    // proves the client and the server agree on the canonical form.
    expect(serializeOrderWindow(daysFromOrderWindow(WINDOW))).toEqual({
      sunday: [{ open: "09:00", close: "14:00" }],
      thursday: [{ open: "10:00", close: "23:00" }],
    });
  });

  it("round-trips a canonical multi-range window unchanged", () => {
    const canonical = {
      sunday: [
        { open: "09:00", close: "13:00" },
        { open: "16:00", close: "20:00" },
      ],
      thursday: [{ open: "10:00", close: "23:00" }],
    };
    expect(serializeOrderWindow(daysFromOrderWindow(canonical))).toEqual(canonical);
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
    days[5] = { open: true, ranges: [{ from: "08:00", to: "12:30" }] };
    expect(serializeOrderWindow(days)).toEqual({
      friday: [{ open: "08:00", close: "12:30" }],
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
