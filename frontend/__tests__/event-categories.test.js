import { describe, it, expect } from "vitest";
import {
  EVENT_CATEGORIES,
  EXPERIENCE_CATEGORIES,
  withAll,
} from "@/lib/event-categories";

// MEH-869: withAll() is the single shared utility gating all 3 filter chip
// rows (events + experiences). A regression here silently breaks every filter.
describe("event-categories", () => {
  it("ships the expected base set sizes (no 'all')", () => {
    // MEH-1657: events went 6 → 4 when סדנה/סיור moved to the experiences side
    // of the locked axis. Experiences stayed at 7 — they ARE workshops/tours.
    expect(EVENT_CATEGORIES).toHaveLength(4);
    expect(EXPERIENCE_CATEGORIES).toHaveLength(7);
    expect(EVENT_CATEGORIES.every((c) => c.key !== "")).toBe(true);
    expect(EXPERIENCE_CATEGORIES.every((c) => c.key !== "")).toBe(true);
  });

  // MEH-1657: the axis, asserted in both directions. Dropping the words from
  // the event set is the fix; keeping them in the experience set is the scope
  // guard — a later global sweep that removed both would break the axis the
  // other way and nothing else here would catch it.
  it("keeps workshop/tour out of events and in experiences", () => {
    const eventKeys = EVENT_CATEGORIES.map((c) => c.key);
    expect(eventKeys).not.toContain("סדנה");
    expect(eventKeys).not.toContain("סיור");
    expect(eventKeys).toEqual(["שוק", "קטיף", "טעימות", "אחר"]);

    const experienceKeys = EXPERIENCE_CATEGORIES.map((c) => c.key);
    expect(experienceKeys).toContain("סדנה");
    expect(experienceKeys).toContain("סיור אוכל");
  });

  it("mirrors the backend event enum exactly", () => {
    // backend/app/routers/events.py VALID_CATEGORIES — a wire-format contract.
    // Drift here means the form offers a category the API rejects with 400.
    expect(new Set(EVENT_CATEGORIES.map((c) => c.key))).toEqual(
      new Set(["שוק", "קטיף", "טעימות", "אחר"]),
    );
  });

  it("withAll() prepends exactly one empty-key 'all' entry", () => {
    const out = withAll(EVENT_CATEGORIES);
    expect(out).toHaveLength(EVENT_CATEGORIES.length + 1);
    expect(out[0]).toEqual({ key: "", labelKey: "all" });
  });

  it("withAll() preserves base order after the 'all' entry", () => {
    const out = withAll(EXPERIENCE_CATEGORIES);
    expect(out.slice(1)).toEqual(EXPERIENCE_CATEGORIES);
  });

  it("withAll() does not mutate the base array", () => {
    const before = EVENT_CATEGORIES.length;
    withAll(EVENT_CATEGORIES);
    expect(EVENT_CATEGORIES).toHaveLength(before);
  });
});
