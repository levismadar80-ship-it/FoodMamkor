import { describe, it, expect } from "vitest";
import {
  serializeHours,
  daysFromString,
  invalidDayIndices,
  emptyDay,
  DEFAULT_OPEN,
  DEFAULT_CLOSE,
} from "@/lib/hours-serialize";
import { parseHours } from "@/lib/hours";

// MEH-1276: the serializer is the inverse of lib/hours.parseHours. These lock
// the storage-string contract so the DB/API format never drifts: compression
// of consecutive identical days into ranges, single-day rows, the empty case,
// per-day range validation, and a serialize→parse→serialize round-trip.

// Build a 7-row editor model with overrides keyed by day index (0=Sun … 6=Sat).
function days(overrides = {}) {
  return Array.from({ length: 7 }, (_, i) => ({ ...emptyDay(), ...overrides[i] }));
}

describe("serializeHours", () => {
  it("compresses consecutive identical days into a range", () => {
    const model = days({
      0: { open: true, from: "09:00", to: "18:00" },
      1: { open: true, from: "09:00", to: "18:00" },
      2: { open: true, from: "09:00", to: "18:00" },
      3: { open: true, from: "09:00", to: "18:00" },
      4: { open: true, from: "09:00", to: "18:00" },
      5: { open: true, from: "09:00", to: "14:00" },
    });
    expect(serializeHours(model)).toBe("Sun-Thu 09:00-18:00, Fri 09:00-14:00");
  });

  it("emits single days for lone open rows and breaks in a run", () => {
    const model = days({
      0: { open: true, from: "09:00", to: "13:00" },
      // Mon closed → breaks the run
      2: { open: true, from: "09:00", to: "13:00" },
    });
    expect(serializeHours(model)).toBe("Sun 09:00-13:00, Tue 09:00-13:00");
  });

  it("does NOT merge adjacent days with different hours", () => {
    const model = days({
      0: { open: true, from: "09:00", to: "18:00" },
      1: { open: true, from: "10:00", to: "18:00" },
    });
    expect(serializeHours(model)).toBe("Sun 09:00-18:00, Mon 10:00-18:00");
  });

  it("returns an empty string when every day is closed", () => {
    expect(serializeHours(days())).toBe("");
  });

  it("does not wrap Sat→Sun into a single range", () => {
    const model = days({
      6: { open: true, from: "09:00", to: "12:00" },
      0: { open: true, from: "09:00", to: "12:00" },
    });
    // Sun is index 0 (first), Sat index 6 (last) — no week-wrap merge.
    expect(serializeHours(model)).toBe("Sun 09:00-12:00, Sat 09:00-12:00");
  });
});

describe("daysFromString", () => {
  it("prefills the editor model from a canonical string", () => {
    const model = daysFromString("Sun-Thu 09:00-18:00, Fri 09:00-14:00");
    expect(model[0]).toEqual({ open: true, from: "09:00", to: "18:00" });
    expect(model[4]).toEqual({ open: true, from: "09:00", to: "18:00" });
    expect(model[5]).toEqual({ open: true, from: "09:00", to: "14:00" });
    expect(model[6]).toEqual({ open: false, from: DEFAULT_OPEN, to: DEFAULT_CLOSE });
  });

  it("returns all-closed rows for an empty or unparseable string", () => {
    for (const raw of ["", "   ", "not hours", "9 to 5"]) {
      const model = daysFromString(raw);
      expect(model).toHaveLength(7);
      expect(model.every((d) => d.open === false)).toBe(true);
    }
  });
});

describe("invalidDayIndices", () => {
  it("flags open days whose close is not after open", () => {
    const model = days({
      0: { open: true, from: "18:00", to: "09:00" }, // reversed
      1: { open: true, from: "09:00", to: "09:00" }, // equal
      2: { open: true, from: "09:00", to: "17:00" }, // valid
      3: { open: false, from: "18:00", to: "09:00" }, // closed → ignored
    });
    expect(invalidDayIndices(model)).toEqual([0, 1]);
  });

  it("returns an empty array when all open days are valid", () => {
    expect(invalidDayIndices(daysFromString("Sun-Thu 09:00-18:00"))).toEqual([]);
  });
});

describe("round-trip: serialize → parseHours → serialize", () => {
  const cases = [
    "Sun-Thu 09:00-18:00, Fri 09:00-14:00",
    "Sun 08:30-16:45",
    "Sun-Sat 00:00-23:00",
    "Mon 09:00-12:00, Wed 09:00-12:00, Fri 09:00-12:00",
    "",
  ];
  for (const canonical of cases) {
    it(`is stable for "${canonical || "(empty)"}"`, () => {
      const once = serializeHours(daysFromString(canonical));
      const twice = serializeHours(daysFromString(once));
      expect(twice).toBe(once);
      // And the compressed form re-parses to the same day map.
      expect(parseHours(once)).toEqual(parseHours(canonical));
    });
  }
});
