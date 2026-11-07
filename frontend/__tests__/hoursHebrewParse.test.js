/**
 * MEH-2803 AC 7 + guard 12 — parseHours reads the hours owners type in Hebrew.
 *
 * The location form invites free Hebrew text (MEH-2604) and the demo business
 * stores «א'-ה' 07:00-14:00, ו' 06:30-13:00»; parseHours read only
 * «Sun-Thu 09:00-18:00», so those hours rendered as typed, in a second format
 * beside the order window («07:00» next to «7:00», «א'-ה'» next to
 * «ראשון–חמישי»). The output map shape is the English one, unchanged.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { parseHours, sameWeeklyHours } from "@/lib/hours";

const r = (open, close) => [{ open, close }];

describe("parseHours — Hebrew day letters (MEH-2803)", () => {
  it("the demo seed string: Sun–Thu one range, Friday its own", () => {
    expect(parseHours("א'-ה' 07:00-14:00, ו' 06:30-13:00")).toEqual({
      0: r("07:00", "14:00"),
      1: r("07:00", "14:00"),
      2: r("07:00", "14:00"),
      3: r("07:00", "14:00"),
      4: r("07:00", "14:00"),
      5: r("06:30", "13:00"),
    });
  });

  it.each([
    ["geresh ׳", "א׳-ה׳ 09:00-17:00"],
    ["apostrophe '", "א'-ה' 09:00-17:00"],
    ["no mark", "א-ה 09:00-17:00"],
    ["en-dash span and range", "א׳–ה׳ 09:00–17:00"],
    ["H:MM times", "א׳-ה׳ 9:00-17:00"],
    ["spaces around the dashes", "א׳ - ה׳ 9:00 - 17:00"],
    ["typographic ’ from a phone keyboard", "א’-ה’ 09:00-17:00"],
  ])("%s → the same map as the English «Sun-Thu 09:00-17:00»", (_name, raw) => {
    expect(parseHours(raw)).toEqual(parseHours("Sun-Thu 09:00-17:00"));
  });

  it("every letter maps to its day: א=Sun … ש=Sat", () => {
    const map = parseHours("א' 01:00-02:00, ב' 01:00-02:00, ג' 01:00-02:00, ד' 01:00-02:00, ה' 01:00-02:00, ו' 01:00-02:00, ש' 01:00-02:00");
    expect(Object.keys(map).map(Number)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("24:00 is a valid close («until midnight»)", () => {
    expect(parseHours("ו' 20:00-24:00")).toEqual({ 5: r("20:00", "24:00") });
  });

  it("H:MM is zero-padded so the map is byte-identical to the English shape", () => {
    expect(parseHours("ו' 7:00-13:00")).toEqual({ 5: r("07:00", "13:00") });
  });

  it("several ranges in one day, space-separated, as in the English grammar (MEH-1870)", () => {
    expect(parseHours("ו' 06:30-10:00 11:00-13:00")).toEqual({
      5: [
        { open: "06:30", close: "10:00" },
        { open: "11:00", close: "13:00" },
      ],
    });
  });

  it.each([
    ["free text", "בתיאום מראש"],
    ["a day word, not a letter", "ראשון-חמישי 09:00-17:00"],
    ["no time", "א'-ה'"],
    ["one readable group + one unreadable → the WHOLE string is unreadable", "א'-ה' 09:00-17:00, ו' בתיאום"],
    ["a malformed time", "א' 9-17"],
    ["past the end of the day", "א' 09:00-24:30"],
    ["minutes out of range", "א' 09:60-17:00"],
    ["a reversed day span (wraps the week)", "ו'-א' 09:00-17:00"],
    ["closing before opening (overnight)", "ו' 22:00-02:00"],
  ])("%s → null (the raw text stays on the page)", (_name, raw) => {
    expect(parseHours(raw)).toBeNull();
  });

  it("the English grammar is unchanged, including its per-entry skip", () => {
    expect(parseHours("Mon 09:00-18:00, garbage")).toEqual({ 1: r("09:00", "18:00") });
    expect(parseHours("Sun-Thu 09:00-18:00, Fri 09:00-13:00 16:00-19:00")[5]).toHaveLength(2);
  });
});

describe("sameWeeklyHours (MEH-2803 AC 4)", () => {
  const orders = parseHours("Sun-Thu 07:00-14:00");
  it("equal day by day → true, whatever language each side was typed in", () => {
    expect(sameWeeklyHours(orders, parseHours("א'-ה' 7:00-14:00"))).toBe(true);
  });
  it("a day missing on one side, or a different range → false", () => {
    expect(sameWeeklyHours(orders, parseHours("א'-ו' 07:00-14:00"))).toBe(false);
    expect(sameWeeklyHours(orders, parseHours("א'-ה' 07:00-13:00"))).toBe(false);
  });
  it("range order inside a day does not matter", () => {
    expect(sameWeeklyHours(parseHours("Fri 11:00-13:00 06:30-10:00"), parseHours("ו' 06:30-10:00 11:00-13:00"))).toBe(true);
  });
  it("either side unparseable (null) → false, never merged", () => {
    expect(sameWeeklyHours(orders, null)).toBe(false);
    expect(sameWeeklyHours(null, orders)).toBe(false);
    expect(sameWeeklyHours(null, null)).toBe(false);
  });
});

// Guard 12: the demo business is the source of the /join screenshots
// (MEH-2794). If its stored hours drift into a format parseHours cannot read,
// the page falls back to raw text in a second format — red here first.
describe("demo seed hours stay readable (MEH-2803 guard 12)", () => {
  const SEED = path.resolve(__dirname, "../../backend/scripts/seed_demo_business.py");
  const source = readFileSync(SEED, "utf8");
  const match = source.match(/"opening_hours":\s*"([^"]+)"/);

  it("the seed file still declares an opening_hours string", () => {
    expect(match, `"opening_hours": "…" in ${SEED}`).not.toBeNull();
  });

  it("parseHours reads it", () => {
    expect(parseHours(match[1])).not.toBeNull();
  });
});
