/**
 * MEH-3860 — Friday mode (Thu 18:00 → Fri 14:00, Israel) is decided before
 * the first paint, so the home page does not move when it starts.
 *
 * It used to be read in an effect after the first paint: the server HTML is
 * the same for everyone, so every visitor in those hours saw home without the
 * Friday strip and with the normal hero line, then both changed (local build
 * 25/11: CLS 0.134 desktop / 0.287 phone).
 *
 * Now the inline flags script on <html> sets data-friday-mode from the same
 * clock and the same override as isFridayMode(), and CSS shows the right
 * hero line and the strip's slot from the first paint.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PREHYDRATION_FLAGS_SCRIPT } from "@/lib/prehydration-flags-inline";
import { isFridayMode } from "@/lib/friday-mode";

const html = document.documentElement;
const runScript = () => new Function(PREHYDRATION_FLAGS_SCRIPT)();

/** A UTC instant for a wall-clock time in Israel (winter, UTC+2) in 2026. */
const israelHour = (isoDate, hour, minute = 30, offset = "+02:00") =>
  new Date(`${isoDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${offset}`);

beforeEach(() => {
  localStorage.clear();
  html.removeAttribute("data-friday-mode");
});
afterEach(() => vi.useRealTimers());

describe("data-friday-mode on <html> matches isFridayMode()", () => {
  // Wed 25/11 to Sat 28/11, every hour: covers both edges of the window.
  const cases = [];
  for (const day of ["2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"]) {
    for (let h = 0; h < 24; h += 1) cases.push([day, h]);
  }
  it.each(cases)("%s %i:30 Israel", (day, h) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(israelHour(day, h));
    runScript();
    expect(html.hasAttribute("data-friday-mode")).toBe(isFridayMode());
  });

  it("the window itself: Thu 18:30 and Fri 00:30 are in, Fri 14:30 and Thu 17:30 are out", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const at = (d, h) => { vi.setSystemTime(israelHour(d, h)); return isFridayMode(); };
    expect([at("2026-11-26", 18), at("2026-11-27", 0), at("2026-11-27", 14), at("2026-11-26", 17)])
      .toEqual([true, true, false, false]);
  });

  // The edges, and a summer week (UTC+3): 2/7/2026 is a Thursday.
  it.each([
    ["2026-11-26", 17, 59, "+02:00", false],
    ["2026-11-26", 18, 0, "+02:00", true],
    ["2026-11-27", 0, 0, "+02:00", true],
    ["2026-11-27", 13, 59, "+02:00", true],
    ["2026-11-27", 14, 0, "+02:00", false],
    ["2026-07-02", 17, 59, "+03:00", false],
    ["2026-07-02", 18, 0, "+03:00", true],
    ["2026-07-03", 13, 59, "+03:00", true],
    ["2026-07-03", 14, 0, "+03:00", false],
  ])("edge %s %i:%i (%s) → %s", (day, h, m, off, want) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(israelHour(day, h, m, off));
    runScript();
    expect([isFridayMode(), html.hasAttribute("data-friday-mode")]).toEqual([want, want]);
  });

  it("the override flags it outside the window too", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(israelHour("2026-11-25", 10));
    localStorage.setItem("friday_mode_override", "1");
    runScript();
    expect(html.hasAttribute("data-friday-mode")).toBe(true);
    expect(isFridayMode()).toBe(true);
  });
});
