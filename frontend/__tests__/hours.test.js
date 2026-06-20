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
  it("expands a day range into each day index", () => {
    expect(parseHours("Sun-Thu 09:00-18:00")).toEqual({
      0: { open: "09:00", close: "18:00" },
      1: { open: "09:00", close: "18:00" },
      2: { open: "09:00", close: "18:00" },
      3: { open: "09:00", close: "18:00" },
      4: { open: "09:00", close: "18:00" },
    });
  });

  it("parses a single day + multiple comma-separated entries", () => {
    expect(parseHours("Fri 09:00-14:00")).toEqual({ 5: { open: "09:00", close: "14:00" } });
    const m = parseHours("Sun-Thu 09:00-18:00, Fri 09:00-14:00");
    expect(m[4]).toEqual({ open: "09:00", close: "18:00" });
    expect(m[5]).toEqual({ open: "09:00", close: "14:00" });
  });

  it("returns null for empty/nullish and ignores malformed entries", () => {
    expect(parseHours("")).toBeNull();
    expect(parseHours(null)).toBeNull();
    expect(parseHours("garbage")).toBeNull();
    expect(parseHours("Mon 09:00-18:00, garbage")).toEqual({ 1: { open: "09:00", close: "18:00" } });
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
