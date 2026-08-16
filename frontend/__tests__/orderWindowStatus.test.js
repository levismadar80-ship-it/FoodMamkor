/**
 * MEH-1546 — order-window status helper (public producer page, chunk 3/3).
 *
 * All assertions pin "now" to an explicit UTC instant and read the result in
 * Asia/Jerusalem, so the suite is deterministic regardless of the runner's TZ
 * (the MEH-1531 lesson: time-derived UI must never be left to ambient clocks).
 *
 * July 2026 is IDT (UTC+3), so 06:00Z == 09:00 Israel.
 */
import { describe, it, expect } from "vitest";
import {
  getOrderWindowStatus,
  getOrderWindowRanges,
  getSingleOrderCutoff,
  israelNowParts,
  CLOSING_SOON_MINUTES,
} from "@/lib/orderWindow";

// 2026-07-26 is a Sunday.
const SUNDAY = (hhmmZ) => new Date(`2026-07-26T${hhmmZ}:00Z`);

const WINDOW = {
  sunday: { open: "09:00", close: "14:00" },
  monday: { open: "09:00", close: "14:00" },
};

describe("israelNowParts", () => {
  it("reports Israel local time, not the runner's timezone", () => {
    // 06:00Z during IDT == 09:00 in Jerusalem, on a Sunday (index 0).
    expect(israelNowParts(SUNDAY("06:00"))).toEqual({ dayIndex: 0, minutes: 9 * 60 });
  });
});

describe("getOrderWindowStatus — null cases", () => {
  it("returns null when the feature is unused", () => {
    for (const empty of [null, undefined, {}]) {
      expect(getOrderWindowStatus(empty, SUNDAY("06:00"))).toBeNull();
    }
  });
});

describe("getOrderWindowStatus — open", () => {
  it("is open mid-window", () => {
    // 08:00Z == 11:00 Israel, inside 09:00–14:00.
    const s = getOrderWindowStatus(WINDOW, SUNDAY("08:00"));
    expect(s.state).toBe("open");
    // Closes at 14:00 Israel == 11:00Z.
    expect(s.nextChange.toISOString()).toBe("2026-07-26T11:00:00.000Z");
  });

  it("is open exactly at the opening minute (inclusive)", () => {
    expect(getOrderWindowStatus(WINDOW, SUNDAY("06:00")).state).toBe("open");
  });
});

describe("getOrderWindowStatus — closing_soon boundary", () => {
  it("flips to closing_soon exactly CLOSING_SOON_MINUTES before close", () => {
    // 10:00Z == 13:00 Israel — exactly 60 min to the 14:00 close.
    const s = getOrderWindowStatus(WINDOW, SUNDAY("10:00"));
    expect(CLOSING_SOON_MINUTES).toBe(60);
    expect(s.state).toBe("closing_soon");
  });

  it("is still plain open one minute earlier", () => {
    // 09:59Z == 12:59 Israel — 61 min to close.
    expect(getOrderWindowStatus(WINDOW, SUNDAY("09:59")).state).toBe("open");
  });

  it("is closed at the closing minute (exclusive)", () => {
    // 11:00Z == 14:00 Israel — the window has ended.
    expect(getOrderWindowStatus(WINDOW, SUNDAY("11:00")).state).toBe("closed");
  });
});

describe("getOrderWindowStatus — closed", () => {
  it("before today's opening, points at today's opening", () => {
    // 05:00Z == 08:00 Israel, an hour before the 09:00 open.
    const s = getOrderWindowStatus(WINDOW, SUNDAY("05:00"));
    expect(s.state).toBe("closed");
    expect(s.nextChange.toISOString()).toBe("2026-07-26T06:00:00.000Z");
  });

  it("after today's close, rolls to the NEXT day that is open", () => {
    // 12:00Z Sunday == 15:00 Israel; next opening is Monday 09:00 Israel.
    const s = getOrderWindowStatus(WINDOW, SUNDAY("12:00"));
    expect(s.state).toBe("closed");
    expect(s.nextChange.toISOString()).toBe("2026-07-27T06:00:00.000Z");
  });

  it("wraps to NEXT WEEK for a single-day window", () => {
    // Only Sunday is open; after it closes the next opening is Sunday +7d.
    const s = getOrderWindowStatus(
      { sunday: { open: "09:00", close: "14:00" } },
      SUNDAY("12:00")
    );
    expect(s.state).toBe("closed");
    expect(s.nextChange.toISOString()).toBe("2026-08-02T06:00:00.000Z");
  });

  it("treats a day whose close is not after its open as closed", () => {
    const s = getOrderWindowStatus(
      { sunday: { open: "14:00", close: "14:00" } },
      SUNDAY("08:00")
    );
    expect(s.state).toBe("closed");
    expect(s.nextChange).toBeNull();
  });
});

// MEH-1869 — the lunch break. A day with two ranges has a genuinely CLOSED
// stretch in the middle, and the next opening is later the SAME day. Before
// the split-ranges change this state was not representable at all.
describe("getOrderWindowStatus — split day (MEH-1869)", () => {
  const SPLIT = {
    sunday: [
      { open: "09:00", close: "13:00" },
      { open: "16:00", close: "20:00" },
    ],
  };

  it("is open inside the FIRST range", () => {
    // 08:00Z == 11:00 Israel.
    expect(getOrderWindowStatus(SPLIT, SUNDAY("08:00")).state).toBe("open");
  });

  it("is CLOSED in the gap, and reopens later the same day", () => {
    // 11:30Z == 14:30 Israel — after the morning close, before the evening open.
    const s = getOrderWindowStatus(SPLIT, SUNDAY("11:30"));
    expect(s.state).toBe("closed");
    // 16:00 Israel == 13:00Z, i.e. 90 minutes after 14:30 Israel.
    expect(s.nextChange.toISOString()).toBe("2026-07-26T13:00:00.000Z");
  });

  it("is open inside the SECOND range", () => {
    // 15:00Z == 18:00 Israel.
    expect(getOrderWindowStatus(SPLIT, SUNDAY("15:00")).state).toBe("open");
  });

  it("closes for the day after the LAST range", () => {
    // 18:00Z == 21:00 Israel, past the 20:00 close.
    expect(getOrderWindowStatus(SPLIT, SUNDAY("18:00")).state).toBe("closed");
  });

  it("reads a legacy single-dict day identically to a one-range list", () => {
    const legacy = { sunday: { open: "09:00", close: "13:00" } };
    const listed = { sunday: [{ open: "09:00", close: "13:00" }] };
    const at = SUNDAY("08:00");
    expect(getOrderWindowStatus(legacy, at)).toEqual(getOrderWindowStatus(listed, at));
  });
});

describe("getSingleOrderCutoff — split day (MEH-1869)", () => {
  it("reports the LAST close of the single open day", () => {
    const cutoff = getSingleOrderCutoff({
      sunday: [
        { open: "09:00", close: "13:00" },
        { open: "16:00", close: "20:00" },
      ],
    });
    // A mid-day break does not create a second "until" candidate; it moves the
    // final one. Returning 13:00 here would understate the cutoff by 7 hours.
    expect(cutoff).toEqual({ dayIndex: 0, close: "20:00" });
  });

  it("still returns null when TWO days are open (ambiguous — MEH-1646)", () => {
    expect(
      getSingleOrderCutoff({
        sunday: [{ open: "09:00", close: "13:00" }],
        monday: [{ open: "09:00", close: "13:00" }],
      }),
    ).toBeNull();
  });
});

describe("getOrderWindowRanges", () => {
  it("merges consecutive days with identical hours", () => {
    const ranges = getOrderWindowRanges({
      sunday: { open: "09:00", close: "14:00" },
      monday: { open: "09:00", close: "14:00" },
      tuesday: { open: "09:00", close: "14:00" },
      thursday: { open: "10:00", close: "23:00" },
    });
    // MEH-1869: a row carries `ranges` (a list) instead of a flat open/close.
    expect(ranges).toEqual([
      { fromDay: 0, toDay: 2, ranges: [{ open: "09:00", close: "14:00" }] },
      { fromDay: 4, toDay: 4, ranges: [{ open: "10:00", close: "23:00" }] },
    ]);
  });

  // MEH-1869 — merging is now a comparison of the WHOLE range list. Two days
  // that share a morning block but differ in the evening are different
  // schedules; collapsing them would silently drop one day's second range.
  it("merges consecutive days only when their FULL range list matches", () => {
    const merged = getOrderWindowRanges({
      sunday: [{ open: "09:00", close: "13:00" }, { open: "16:00", close: "20:00" }],
      monday: [{ open: "09:00", close: "13:00" }, { open: "16:00", close: "20:00" }],
    });
    expect(merged).toEqual([
      {
        fromDay: 0,
        toDay: 1,
        ranges: [{ open: "09:00", close: "13:00" }, { open: "16:00", close: "20:00" }],
      },
    ]);

    const notMerged = getOrderWindowRanges({
      sunday: [{ open: "09:00", close: "13:00" }, { open: "16:00", close: "20:00" }],
      monday: [{ open: "09:00", close: "13:00" }],
    });
    expect(notMerged).toHaveLength(2);
    expect(notMerged[0].ranges).toHaveLength(2);
    expect(notMerged[1].ranges).toHaveLength(1);
  });

  it("does NOT merge across a gap even when hours match", () => {
    const ranges = getOrderWindowRanges({
      sunday: { open: "09:00", close: "14:00" },
      tuesday: { open: "09:00", close: "14:00" },
    });
    expect(ranges).toHaveLength(2);
  });

  it("does NOT merge adjacent days with different hours", () => {
    const ranges = getOrderWindowRanges({
      sunday: { open: "09:00", close: "14:00" },
      monday: { open: "09:00", close: "15:00" },
    });
    expect(ranges).toHaveLength(2);
  });

  it("returns [] for an unused window", () => {
    for (const empty of [null, undefined, {}]) {
      expect(getOrderWindowRanges(empty)).toEqual([]);
    }
  });
});
