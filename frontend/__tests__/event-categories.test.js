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
    expect(EVENT_CATEGORIES).toHaveLength(6);
    expect(EXPERIENCE_CATEGORIES).toHaveLength(7);
    expect(EVENT_CATEGORIES.every((c) => c.key !== "")).toBe(true);
    expect(EXPERIENCE_CATEGORIES.every((c) => c.key !== "")).toBe(true);
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
