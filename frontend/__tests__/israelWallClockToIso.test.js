// MEH-3219 B13 — the group-buy deadline field says «לפי שעון ישראל», so the
// typed wall-clock value is read in Israel whatever the device zone is.
import { describe, expect, it } from "vitest";
import { israelWallClockToIso, parseNaiveUtc } from "@/lib/dates";

describe("israelWallClockToIso", () => {
  it("winter (UTC+2): 23:59 Israel is 21:59 UTC", () => {
    expect(israelWallClockToIso("2026-12-20T23:59")).toBe("2026-12-20T21:59:00.000Z");
  });

  it("summer (UTC+3): 23:59 Israel is 20:59 UTC", () => {
    expect(israelWallClockToIso("2027-07-20T23:59")).toBe("2027-07-20T20:59:00.000Z");
  });

  it("rejects anything that is not a datetime-local value", () => {
    expect(israelWallClockToIso("")).toBeNull();
    expect(israelWallClockToIso(null)).toBeNull();
    expect(israelWallClockToIso("20/12/2026")).toBeNull();
  });

  it("round-trips with parseNaiveUtc on the server's naive serialisation", () => {
    const iso = israelWallClockToIso("2026-12-20T23:59");
    const naive = iso.replace(".000Z", "");
    expect(parseNaiveUtc(naive).toISOString()).toBe(iso);
  });
});
