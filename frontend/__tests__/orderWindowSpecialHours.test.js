/**
 * MEH-2264 (MEH-1889 chunk B) — `special_hours` per-date overrides in the
 * order-window readers.
 *
 * Every case pins "now" to an explicit UTC instant and reads the result in
 * Asia/Jerusalem (the MEH-1531 rule). September 2026 is IDT (UTC+3), so
 * 07:00Z == 10:00 Israel. 2026-09-06 is a SUNDAY; 2026-09-07 a MONDAY.
 *
 * The load-bearing cases are the ones where the override and the weekly map
 * DISAGREE — a weekly-open day overridden closed, a weekly-closed day
 * overridden open. Against the pre-2264 helper (third argument ignored) each
 * of those returns the weekly answer, so this file goes red there and green
 * here; the "another date" case is the control that must pass in BOTH worlds.
 */
import { describe, it, expect } from "vitest";
import { getOrderWindowStatus, getUpcomingSpecialDates } from "@/lib/orderWindow";

const SUNDAY = (hhmmZ) => new Date(`2026-09-06T${hhmmZ}:00Z`);

const SUNDAY_ONLY = { sunday: [{ open: "09:00", close: "13:00" }] };
const MONDAY_ONLY = { monday: [{ open: "09:00", close: "14:00" }] };

const CLOSED_SUNDAY = { "2026-09-06": { ranges: [], note: "יום כיפור" } };
const OPEN_SUNDAY = { "2026-09-06": { ranges: [{ open: "09:00", close: "13:00" }] } };
const CLOSED_MONDAY = { "2026-09-07": { ranges: [] } };
const OTHER_DATE = { "2026-09-21": { ranges: [] } };

describe("getOrderWindowStatus — today's override wins (MEH-2264)", () => {
  it("a closed override hides a weekly-open day, and the scan skips to next week", () => {
    // 10:00 Israel on a Sunday the weekly map says is open 09–13.
    const s = getOrderWindowStatus(SUNDAY_ONLY, SUNDAY("07:00"), CLOSED_SUNDAY);
    expect(s.state).toBe("closed");
    // Next opening is the NEXT Sunday (13/09) 09:00 Israel == 06:00Z.
    expect(s.nextChange.toISOString()).toBe("2026-09-13T06:00:00.000Z");
  });

  it("an open override opens a weekly-closed day, with the override's own cutoff", () => {
    const s = getOrderWindowStatus(MONDAY_ONLY, SUNDAY("07:00"), OPEN_SUNDAY);
    expect(s.state).toBe("open");
    // Closes 13:00 Israel == 10:00Z — read off the override, not the weekly map.
    expect(s.nextChange.toISOString()).toBe("2026-09-06T10:00:00.000Z");
  });

  it("an override for ANOTHER date changes nothing today (control)", () => {
    const withOverride = getOrderWindowStatus(SUNDAY_ONLY, SUNDAY("07:00"), OTHER_DATE);
    const without = getOrderWindowStatus(SUNDAY_ONLY, SUNDAY("07:00"));
    expect(withOverride).toEqual(without);
    expect(withOverride.state).toBe("open");
  });

  it("the forward scan honours a closed override on the day it would have reopened", () => {
    // Sunday 22:00 Israel (19:00Z), weekly opens Monday 09:00 — but Monday is
    // overridden closed, and the weekly map has no other day, so the next
    // opening is the FOLLOWING Monday (14/09) 09:00 Israel == 06:00Z.
    const s = getOrderWindowStatus(MONDAY_ONLY, SUNDAY("19:00"), CLOSED_MONDAY);
    expect(s.state).toBe("closed");
    expect(s.nextChange.toISOString()).toBe("2026-09-14T06:00:00.000Z");
  });

  it("an override-only producer (no weekly map) is a declaration, not null", () => {
    expect(getOrderWindowStatus(null, SUNDAY("07:00"), OPEN_SUNDAY).state).toBe("open");
    const closed = getOrderWindowStatus(null, SUNDAY("07:00"), CLOSED_SUNDAY);
    expect(closed.state).toBe("closed");
    // Nothing else in the coming week opens → no reopening time to state.
    expect(closed.nextChange).toBeNull();
  });

  it("an override-only producer scanning days with NO override falls through to the (null) weekly map", () => {
    // Today is overridden closed; the next 14 days carry no override and there
    // is no weekly map at all, so `dayRanges(null, …)` must answer "closed"
    // for each of them and the scan ends with no reopening time.
    const s = getOrderWindowStatus(null, SUNDAY("07:00"), CLOSED_SUNDAY);
    expect(s).toEqual({ state: "closed", nextChange: null });
    // …and an override eight days out is still found by the 14-day scan.
    const s2 = getOrderWindowStatus(null, SUNDAY("07:00"), {
      ...CLOSED_SUNDAY,
      "2026-09-14": { ranges: [{ open: "10:00", close: "12:00" }] },
    });
    expect(s2.state).toBe("closed");
    expect(s2.nextChange.toISOString()).toBe("2026-09-14T07:00:00.000Z");
  });

  it("stays null when there is neither a weekly map nor any override", () => {
    for (const empty of [null, undefined, {}]) {
      expect(getOrderWindowStatus(null, SUNDAY("07:00"), empty)).toBeNull();
    }
  });

  it("an override with only malformed ranges reads as CLOSED, not as absent", () => {
    const bad = { "2026-09-06": { ranges: [{ open: "13:00", close: "09:00" }] } };
    const s = getOrderWindowStatus(SUNDAY_ONLY, SUNDAY("07:00"), bad);
    expect(s.state).toBe("closed");
  });
});

describe("getUpcomingSpecialDates (MEH-2264)", () => {
  const NOW = new Date("2026-09-05T07:00:00Z"); // Saturday 05/09, 10:00 Israel

  it("drops past dates, keeps today and later, sorted ascending", () => {
    const out = getUpcomingSpecialDates(
      {
        "2026-09-21": { ranges: [] },
        "2026-08-01": { ranges: [] },
        "2026-09-05": { ranges: [{ open: "09:00", close: "11:00" }] },
        "2026-09-11": { ranges: [{ open: "09:00", close: "13:00" }], note: "  ערב ראש השנה " },
      },
      NOW,
    );
    expect(out.map((d) => d.date)).toEqual(["2026-09-05", "2026-09-11", "2026-09-21"]);
    expect(out[0]).toEqual({
      date: "2026-09-05",
      ranges: [{ open: "09:00", close: "11:00" }],
      closed: false,
    });
    expect(out[1].note).toBe("ערב ראש השנה");
    expect(out[2]).toEqual({ date: "2026-09-21", ranges: [], closed: true });
  });

  it("reads the ISRAEL date: 21:30Z on the 5th is already the 6th in Israel", () => {
    // 21:30Z == 00:30 Israel on 06/09, so the 5th is now a PAST date.
    const out = getUpcomingSpecialDates(
      { "2026-09-05": { ranges: [] }, "2026-09-06": { ranges: [] } },
      new Date("2026-09-05T21:30:00Z"),
    );
    expect(out.map((d) => d.date)).toEqual(["2026-09-06"]);
  });

  it("returns [] for null / {} / a non-object", () => {
    for (const empty of [null, undefined, {}, "x"]) {
      expect(getUpcomingSpecialDates(empty, NOW)).toEqual([]);
    }
  });

  it("a malformed entry is skipped, an all-malformed range list reads as closed", () => {
    const out = getUpcomingSpecialDates(
      {
        "2026-09-10": null,
        "2026-09-12": { ranges: [{ open: "x", close: "y" }] },
      },
      NOW,
    );
    expect(out).toEqual([{ date: "2026-09-12", ranges: [], closed: true }]);
  });
});
