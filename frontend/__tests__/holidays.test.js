/**
 * MEH-2263 → MEH-3017 — the holiday calendar is a single source, and since
 * MEH-3017 its dates are COMPUTED from the Hebrew calendar. The expected dates
 * below are typed by hand from outside the code (5787 from the MEH-2263
 * anchors, 5788 from the published 2027–28 calendar), so they check the
 * computation instead of repeating it. Convention: `start` = the eve (erev),
 * `end` = the last festival day; both inclusive.
 *
 * Anchors, from MEH-2263: ערב ר"ה 11/09 · ר"ה 12–13/09 · ערב כיפור 20/09 ·
 * כיפור 21/09 · ערב סוכות 25/09 · סוכות 26/09 · הושענא רבא 02/10 ·
 * שמחת תורה 03/10 · חנוכה 05–12/12 · פורים 23/03/27 · ערב פסח 21/04/27 ·
 * פסח 22/04 + 28/04 · שבועות 11/06/27. Tu Bishvat is not in the card's list
 * and is derived from the same chain: 25 Kislev = 05/12 → 1 Tevet = 11/12
 * (Kislev has 30 days in 5787) → 1 Shevat = 09/01/27 → 15 Shevat = 23/01/27.
 */
import { describe, it, expect } from "vitest";
import { HOLIDAYS, holidaysOn, getActiveHoliday, getUpcomingHoliday } from "@/lib/holidays";

const EXPECTED_5787 = {
  rosh_hashana: { start: "2026-09-11", end: "2026-09-13" },
  sukkot: { start: "2026-09-25", end: "2026-10-03" },
  chanuka: { start: "2026-12-05", end: "2026-12-12" },
  tu_bishvat: { start: "2027-01-23", end: "2027-01-23" },
  pesach: { start: "2027-04-21", end: "2027-04-28" },
  shavuot: { start: "2027-06-10", end: "2027-06-11" },
};

// 5788, typed from the published calendar: ר"ה 02–03/10/27 · סוכות 16/10 ·
// שמחת תורה 23/10 · חנוכה 25/12/27–01/01/28 · ט"ו בשבט 22/01/28 ·
// פסח 11/04/28 + 17/04 · שבועות 31/05/28.
const EXPECTED_5788 = {
  rosh_hashana: { start: "2027-10-01", end: "2027-10-03" },
  sukkot: { start: "2027-10-15", end: "2027-10-23" },
  chanuka: { start: "2027-12-25", end: "2028-01-01" },
  tu_bishvat: { start: "2028-02-12", end: "2028-02-12" },
  pesach: { start: "2028-04-10", end: "2028-04-17" },
  shavuot: { start: "2028-05-30", end: "2028-05-31" },
};

const datesOf = (table) =>
  Object.fromEntries(Object.entries(table).map(([k, h]) => [k, { start: h.start, end: h.end }]));

// IDT (+03:00) — Israel summer time, correct for the September dates below.
// Do NOT reuse for winter dates (Chanuka, Tu Bishvat): those are IST (+02:00).
const israelNoon = (isoDay) => new Date(`${isoDay}T12:00:00+03:00`);

describe("holidays.js — computed dates (MEH-2263, MEH-3017)", () => {
  it("covers exactly the six entries this test pins — no silent additions", () => {
    expect(Object.keys(HOLIDAYS).sort()).toEqual(Object.keys(EXPECTED_5787).sort());
  });

  it("in November 2026 the table is 5787, matching the hand-typed dates", () => {
    expect(datesOf(holidaysOn("2026-11-14"))).toEqual(EXPECTED_5787);
  });

  it("after Shavuot 5787 the table is 5788, matching the published calendar", () => {
    expect(datesOf(holidaysOn("2027-06-12"))).toEqual(EXPECTED_5788);
  });

  it("the year turns over the day after Shavuot ends, not before", () => {
    expect(holidaysOn("2027-06-11").shavuot.end).toBe("2027-06-11");
    expect(holidaysOn("2027-06-12").shavuot.end).toBe("2028-05-31");
  });

  it("every icon, colour and search term survives the computation", () => {
    const t = holidaysOn("2026-11-14");
    expect(t.pesach).toMatchObject({ icon: "Sparkle", searchParams: { q: "כשר לפסח" } });
    expect(t.chanuka).toMatchObject({ icon: "Flame", color: "#1D4ED8" });
  });

  it("rosh_hashana does not sit on Yom Kippur (20–22/09), and every date is ISO and ordered", () => {
    for (const [key, h] of Object.entries(holidaysOn("2026-09-01"))) {
      expect(h.start, key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(h.end, key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(h.start <= h.end, `${key}: start after end`).toBe(true);
    }
    const rh = holidaysOn("2026-09-01").rosh_hashana.start;
    expect(rh >= "2026-09-20" && rh <= "2026-09-22").toBe(false);
  });
});

describe("holiday banner — frozen clock (MEH-2263)", () => {
  it("fires for rosh_hashana on the eve, 2026-09-11", () => {
    const h = getActiveHoliday(null, israelNoon("2026-09-11"));
    expect(h?.key).toBe("rosh_hashana");
    expect(h?.upcoming).toBe(false);
  });

  it("is already announcing rosh_hashana six days ahead — on 2026-09-05 it is upcoming", () => {
    const h = getActiveHoliday(null, israelNoon("2026-09-05"));
    expect(h?.key).toBe("rosh_hashana");
    expect(h?.upcoming).toBe(true);
  });

  it("does NOT fire for rosh_hashana on 2026-09-20 (Yom Kippur eve)", () => {
    const h = getActiveHoliday(null, israelNoon("2026-09-20"));
    expect(h?.key).not.toBe("rosh_hashana");
  });

  it("fires for 5788 Pesach on its eve, with no one having typed 5788", () => {
    const h = getActiveHoliday(null, new Date("2028-04-10T12:00:00+03:00"));
    expect(h?.key).toBe("pesach");
    expect(h?.upcoming).toBe(false);
  });

  it("the dashboard's 14-day hint counts down to the eve of rosh_hashana", () => {
    const h = getUpcomingHoliday(undefined, israelNoon("2026-09-05"));
    expect(h?.key).toBe("rosh_hashana");
    expect(h?.daysUntil).toBe(6);
  });
});
