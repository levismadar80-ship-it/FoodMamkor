/**
 * MEH-2653 — an older experience row stores the English category key
 * («workshop»); the list row must show the Hebrew value, never the raw key.
 */
import { describe, it, expect } from "vitest";
import { toEventEntry } from "@/lib/event-entry";
import { findExperienceCategory } from "@/lib/event-categories";

const t = (k) => k;
const row = (category) => ({ id: "x", title: "x", event_date: "2026-11-13", category });

describe("MEH-2653 — experience category in list rows", () => {
  it.each([
    ["workshop", "סדנה"],
    ["סדנה", "סדנה"],
    ["food_tour", "סיור אוכל"],
  ])("experience %s → %s", (raw, shown) => {
    expect(toEventEntry(row(raw), "experiences", t).category).toBe(shown);
  });

  it("an unknown value passes through untouched", () => {
    expect(toEventEntry(row("משהו"), "experiences", t).category).toBe("משהו");
  });

  it("events are never remapped", () => {
    expect(toEventEntry(row("workshop"), "events", t).category).toBe("workshop");
  });

  it("findExperienceCategory: empty → null", () => {
    expect(findExperienceCategory("")).toBeNull();
    expect(findExperienceCategory(null)).toBeNull();
  });
});
