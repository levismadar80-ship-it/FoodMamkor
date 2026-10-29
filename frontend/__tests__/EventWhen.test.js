/**
 * MEH-2548 — lib/event-when.js: the «היום / מחר / השבוע» chip and the
 * past-event switch, against a fixed Israel "today"; plus the address-built
 * navigation links for events with no map point.
 */
import { describe, it, expect } from "vitest";
import { eventWhen, addressNavLinks } from "@/lib/event-when";

const TODAY = "2026-10-29";

describe("eventWhen", () => {
  it.each([
    ["2026-10-28", "past"],
    ["2026-10-29", "today"],
    ["2026-10-30", "tomorrow"],
    ["2026-10-31", "this_week"],
    ["2026-11-04", "this_week"],
    ["2026-11-05", null],
  ])("%s → %s", (date, want) => {
    expect(eventWhen(date, TODAY)).toBe(want);
  });

  it("counts calendar days across the DST switch (25 Oct 2026), not 24h blocks", () => {
    expect(eventWhen("2026-10-26", "2026-10-25")).toBe("tomorrow");
  });

  it("a malformed date gets no chip rather than a wrong one", () => {
    expect(eventWhen("", TODAY)).toBeNull();
  });
});

describe("addressNavLinks", () => {
  it("builds Waze + Google links from the place and city", () => {
    const l = addressNavLinks("האנגר 11, נמל תל אביב", "תל אביב");
    expect(l.waze).toBe(`https://waze.com/ul?q=${encodeURIComponent("האנגר 11, נמל תל אביב, תל אביב")}&navigate=yes`);
    expect(l.google).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("האנגר 11, נמל תל אביב, תל אביב")}`,
    );
  });

  it("city alone is enough; nothing at all gives no links", () => {
    expect(addressNavLinks(null, "חיפה").waze).toContain(encodeURIComponent("חיפה"));
    expect(addressNavLinks(" ", null)).toBeNull();
  });
});
