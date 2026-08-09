import { describe, expect, it } from "vitest";

import { israelToday } from "@/lib/israel-date";

/**
 * MEH-1983 — the client's idea of "today" must match the server's.
 *
 * The backend rejects `vacation_until < israel_today()`
 * (backend/app/utils/clock.py, backend/app/schemas/schemas.py). So a client
 * that computes today from the UTC date will, for the first 2–3 hours of an
 * Israel day, offer a date the server refuses. These cases pin that window.
 *
 * Every case carries the UTC date alongside, because a case where the two
 * agree proves nothing — it would pass against the bug too.
 */
describe("israelToday", () => {
  it("is one day AHEAD of the UTC date just after Israeli midnight (summer, UTC+3)", () => {
    // 00:30 Israel on 10/08 is still 21:30 UTC on 09/08.
    const instant = new Date("2026-08-09T21:30:00Z");

    expect(instant.toISOString().slice(0, 10)).toBe("2026-08-09");
    expect(israelToday(instant)).toBe("2026-08-10");
  });

  it("is one day AHEAD of the UTC date just after Israeli midnight (winter, UTC+2)", () => {
    // 00:30 Israel on 16/01 is 22:30 UTC on 15/01. Pins the non-DST offset:
    // a hardcoded +3 would pass the summer case and fail here.
    const instant = new Date("2026-01-15T22:30:00Z");

    expect(instant.toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(israelToday(instant)).toBe("2026-01-16");
  });

  it("agrees with the UTC date during the rest of the day", () => {
    const instant = new Date("2026-08-09T09:00:00Z");

    expect(israelToday(instant)).toBe("2026-08-09");
    expect(israelToday(instant)).toBe(instant.toISOString().slice(0, 10));
  });

  it("returns a zero-padded YYYY-MM-DD an ISO date input can consume", () => {
    expect(israelToday(new Date("2026-03-05T12:00:00Z"))).toBe("2026-03-05");
  });

  it("rolls the month and the year at the boundary", () => {
    // 00:30 Israel on 01/01/2027 is 22:30 UTC on 31/12/2026 — the case where
    // an off-by-one is a whole year, not a day.
    const instant = new Date("2026-12-31T22:30:00Z");

    expect(instant.toISOString().slice(0, 10)).toBe("2026-12-31");
    expect(israelToday(instant)).toBe("2027-01-01");
  });
});
