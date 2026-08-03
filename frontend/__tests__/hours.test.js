import { describe, it, expect, vi, afterEach } from "vitest";
import { parseHours, computeStatus, toMinutes } from "@/lib/hours";

// MEH-845: unit coverage for the open/closed-now parser (MEH-826). computeStatus
// reads the wall-clock in Asia/Jerusalem, so the clock is pinned with
// vi.setSystemTime. June instants → Israel is on IDT (UTC+3), no DST ambiguity.
// 2026-06-15 is a Monday; 2026-06-20 is a Saturday.

afterEach(() => vi.useRealTimers());

function at(utcIso) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(utcIso));
}

describe("parseHours", () => {
  // MEH-1870: values are LISTS of ranges. A legacy single-range day is a
  // one-element list, so flattening reproduces the pre-1870 map exactly — that
  // equivalence is asserted explicitly in the backward-compat block below.
  it("expands a day range into each day index", () => {
    expect(parseHours("Sun-Thu 09:00-18:00")).toEqual({
      0: [{ open: "09:00", close: "18:00" }],
      1: [{ open: "09:00", close: "18:00" }],
      2: [{ open: "09:00", close: "18:00" }],
      3: [{ open: "09:00", close: "18:00" }],
      4: [{ open: "09:00", close: "18:00" }],
    });
  });

  it("parses a single day + multiple comma-separated entries", () => {
    expect(parseHours("Fri 09:00-14:00")).toEqual({ 5: [{ open: "09:00", close: "14:00" }] });
    const m = parseHours("Sun-Thu 09:00-18:00, Fri 09:00-14:00");
    expect(m[4]).toEqual([{ open: "09:00", close: "18:00" }]);
    expect(m[5]).toEqual([{ open: "09:00", close: "14:00" }]);
  });

  it("returns null for empty/nullish and ignores malformed entries", () => {
    expect(parseHours("")).toBeNull();
    expect(parseHours(null)).toBeNull();
    expect(parseHours("garbage")).toBeNull();
    expect(parseHours("Mon 09:00-18:00, garbage")).toEqual({ 1: [{ open: "09:00", close: "18:00" }] });
  });
});

// MEH-1870 — the extended grammar: extra ranges inside a day group are
// separated by a SPACE, the comma still separates day groups.
describe("parseHours — several ranges per day (MEH-1870)", () => {
  it("parses a lunch break into two ranges on one day", () => {
    expect(parseHours("Fri 09:00-13:00 16:00-19:00")).toEqual({
      5: [
        { open: "09:00", close: "13:00" },
        { open: "16:00", close: "19:00" },
      ],
    });
  });

  it("applies a multi-range list to every day of a day RANGE", () => {
    const m = parseHours("Sun-Mon 09:00-13:00 16:00-19:00");
    expect(m[0]).toEqual(m[1]);
    expect(m[0]).toHaveLength(2);
    // Each day gets its OWN objects — a shared reference would let a mutation
    // on one day silently rewrite another.
    expect(m[0][0]).not.toBe(m[1][0]);
  });

  it("mixes single-range and multi-range groups in one string", () => {
    const m = parseHours("Sun-Thu 09:00-18:00, Fri 08:00-13:00 16:00-19:00");
    expect(m[2]).toHaveLength(1);
    expect(m[5]).toHaveLength(2);
  });

  it("rejects the WHOLE entry on a malformed tail (no half-parsing)", () => {
    // The entry regex is anchored, so a bad trailing token must not leave a
    // silently-truncated first range behind.
    expect(parseHours("Fri 09:00-13:00 garbage")).toBeNull();
    expect(parseHours("Fri 09:00-13:00 16:00")).toBeNull();
  });

  // The <constraints> "identical parse" requirement. The output SHAPE changed,
  // so byte-equality is impossible; what must hold is that flattening the new
  // output reproduces the old map exactly, for every string already in the wild.
  it("every legacy string flattens to exactly the pre-1870 map", () => {
    const LEGACY = {
      "Sun-Thu 09:00-18:00, Fri 09:00-14:00": {
        0: { open: "09:00", close: "18:00" }, 1: { open: "09:00", close: "18:00" },
        2: { open: "09:00", close: "18:00" }, 3: { open: "09:00", close: "18:00" },
        4: { open: "09:00", close: "18:00" }, 5: { open: "09:00", close: "14:00" },
      },
      "Mon 09:00-18:00": { 1: { open: "09:00", close: "18:00" } },
      "Sat 00:00-02:00": { 6: { open: "00:00", close: "02:00" } },
      "Sun-Sat 08:00-20:00": Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => [i, { open: "08:00", close: "20:00" }]),
      ),
    };
    for (const [raw, expected] of Object.entries(LEGACY)) {
      const parsed = parseHours(raw);
      const flattened = Object.fromEntries(
        Object.entries(parsed).map(([day, ranges]) => {
          expect(ranges).toHaveLength(1); // legacy = exactly one range
          return [day, ranges[0]];
        }),
      );
      expect(flattened).toEqual(expected);
    }
  });
});

describe("toMinutes", () => {
  it("converts HH:MM to minutes since midnight", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("18:00")).toBe(1080);
  });
});

describe("computeStatus (clock pinned to Asia/Jerusalem)", () => {
  it("open: now is within today's window", () => {
    at("2026-06-15T07:00:00Z"); // IL Mon 10:00
    expect(computeStatus(parseHours("Mon 09:00-18:00"))).toEqual({
      isOpen: true,
      openTime: "09:00",
      closeTime: "18:00",
    });
  });

  it("closed after today's close → next slot is tomorrow", () => {
    at("2026-06-15T16:00:00Z"); // IL Mon 19:00 (past 18:00)
    expect(computeStatus(parseHours("Mon 09:00-18:00, Tue 09:00-14:00"))).toEqual({
      isOpen: false,
      nextDayKey: "tue",
      nextTime: "09:00",
      nextIsTomorrow: true,
    });
  });

  it("closed: next open slot several days out (not tomorrow)", () => {
    at("2026-06-15T07:00:00Z"); // IL Mon 10:00
    expect(computeStatus(parseHours("Thu 09:00-17:00"))).toEqual({
      isOpen: false,
      nextDayKey: "thu",
      nextTime: "09:00",
      nextIsTomorrow: false,
    });
  });

  it("midnight TZ boundary: open just after 00:00, correct day (not the prior UTC day)", () => {
    at("2026-06-19T21:30:00Z"); // IL Sat 00:30 (UTC is still Friday)
    expect(computeStatus(parseHours("Sat 00:00-02:00"))).toEqual({
      isOpen: true,
      openTime: "00:00",
      closeTime: "02:00",
    });
  });
});

// MEH-1870 — the lunch break. A day with two ranges has a genuinely CLOSED
// stretch in the middle, and the next opening is later the SAME day. Before
// the split-ranges change that state was not representable at all.
describe("computeStatus — split day (MEH-1870)", () => {
  const SPLIT = parseHours("Mon 09:00-13:00 16:00-19:00");

  it("is open inside the FIRST range", () => {
    at("2026-06-15T08:00:00Z"); // 11:00 Israel, Monday
    expect(computeStatus(SPLIT)).toEqual({
      isOpen: true,
      openTime: "09:00",
      closeTime: "13:00",
    });
  });

  it("is CLOSED in the gap and reopens LATER THE SAME DAY", () => {
    at("2026-06-15T11:30:00Z"); // 14:30 Israel — after 13:00, before 16:00
    expect(computeStatus(SPLIT)).toEqual({
      isOpen: false,
      nextDayKey: "mon",
      nextTime: "16:00",
      // The bug this pins: reporting tomorrow here would be wrong for every
      // split-hours business, and "closed" alone would hide the reopening.
      nextIsTomorrow: false,
    });
  });

  it("is open inside the SECOND range", () => {
    at("2026-06-15T15:00:00Z"); // 18:00 Israel
    expect(computeStatus(SPLIT)).toEqual({
      isOpen: true,
      openTime: "16:00",
      closeTime: "19:00",
    });
  });

  it("rolls to the next open day after the LAST range", () => {
    at("2026-06-15T17:00:00Z"); // 20:00 Israel, past 19:00
    const week = parseHours("Mon 09:00-13:00 16:00-19:00, Tue 10:00-14:00");
    expect(computeStatus(week)).toEqual({
      isOpen: false,
      nextDayKey: "tue",
      nextTime: "10:00",
      nextIsTomorrow: true,
    });
  });

  it("uses the EARLIEST upcoming range even if the string lists them out of order", () => {
    at("2026-06-15T04:00:00Z"); // 07:00 Israel, before both
    const jumbled = parseHours("Mon 16:00-19:00 09:00-13:00");
    expect(computeStatus(jumbled).nextTime).toBe("09:00");
  });
});
