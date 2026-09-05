/**
 * MEH-2263 — the holiday calendar is a single source and its dates are the
 * 5787 ones. Every named entry is pinned to an exact start/end so a future
 * year-roll edits the table AND this test together, never one without the
 * other. Convention (kept from the file): `start` = the eve (erev), `end` =
 * the last festival day; both inclusive.
 *
 * Anchors, from MEH-2263: ערב ר"ה 11/09 · ר"ה 12–13/09 · ערב כיפור 20/09 ·
 * כיפור 21/09 · ערב סוכות 25/09 · סוכות 26/09 · הושענא רבא 02/10 ·
 * שמחת תורה 03/10 · חנוכה 05–12/12 · פורים 23/03/27 · ערב פסח 21/04/27 ·
 * פסח 22/04 + 28/04 · שבועות 11/06/27. Tu Bishvat is not in the card's list
 * and is derived from the same chain: 25 Kislev = 05/12 → 1 Tevet = 11/12
 * (Kislev has 30 days in 5787) → 1 Shevat = 09/01/27 → 15 Shevat = 23/01/27.
 */
import { describe, it, expect } from "vitest";
import { HOLIDAYS, getActiveHoliday, getUpcomingHoliday } from "@/lib/holidays";

const EXPECTED_5787 = {
  rosh_hashana: { start: "2026-09-11", end: "2026-09-13" },
  sukkot: { start: "2026-09-25", end: "2026-10-03" },
  chanuka: { start: "2026-12-05", end: "2026-12-12" },
  tu_bishvat: { start: "2027-01-23", end: "2027-01-23" },
  pesach: { start: "2027-04-21", end: "2027-04-28" },
  shavuot: { start: "2027-06-10", end: "2027-06-11" },
};

// Israel is UTC+3 in September (IDT) and UTC+2 in winter (IST).
const israelNoon = (isoDay) => new Date(`${isoDay}T12:00:00+03:00`);

describe("holidays.js — 5787 dates (MEH-2263)", () => {
  it("covers exactly the six entries this test pins — no silent additions", () => {
    expect(Object.keys(HOLIDAYS).sort()).toEqual(Object.keys(EXPECTED_5787).sort());
  });

  for (const [key, want] of Object.entries(EXPECTED_5787)) {
    it(`${key} runs ${want.start} → ${want.end}`, () => {
      expect({ start: HOLIDAYS[key].start, end: HOLIDAYS[key].end }).toEqual(want);
    });
  }

  it("rosh_hashana does not sit on Yom Kippur (20–22/09), and every date is ISO and ordered", () => {
    for (const [key, h] of Object.entries(HOLIDAYS)) {
      expect(h.start, key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(h.end, key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(h.start <= h.end, `${key}: start after end`).toBe(true);
    }
    expect(HOLIDAYS.rosh_hashana.start >= "2026-09-20" && HOLIDAYS.rosh_hashana.start <= "2026-09-22").toBe(false);
  });
});

describe("holiday banner — frozen clock (MEH-2263)", () => {
  it("fires for rosh_hashana on the eve, 2026-09-11", () => {
    const h = getActiveHoliday(null, israelNoon("2026-09-11"));
    expect(h?.key).toBe("rosh_hashana");
    expect(h?.upcoming).toBe(false);
  });

  it("is already announcing rosh_hashana a week ahead — on 2026-09-05 it is upcoming", () => {
    const h = getActiveHoliday(null, israelNoon("2026-09-05"));
    expect(h?.key).toBe("rosh_hashana");
    expect(h?.upcoming).toBe(true);
  });

  it("does NOT fire for rosh_hashana on 2026-09-20 (Yom Kippur eve)", () => {
    const h = getActiveHoliday(null, israelNoon("2026-09-20"));
    expect(h?.key).not.toBe("rosh_hashana");
  });

  it("the dashboard's 14-day hint counts down to the eve of rosh_hashana", () => {
    const h = getUpcomingHoliday(undefined, israelNoon("2026-09-05"));
    expect(h?.key).toBe("rosh_hashana");
    expect(h?.daysUntil).toBe(6);
  });
});
