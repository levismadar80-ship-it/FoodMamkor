import { describe, it, expect } from "vitest";
import { groupDeliveryAreas } from "@/lib/deliveryGroups";

// MEH-1305 A — dispatch-day pivot. Every branch of groupDeliveryAreas.

describe("groupDeliveryAreas", () => {
  it("no areas → flat with empty rows", () => {
    expect(groupDeliveryAreas([])).toEqual({ mode: "flat", rows: [] });
    expect(groupDeliveryAreas()).toEqual({ mode: "flat", rows: [] });
  });

  it("no row carries a day → flat", () => {
    const res = groupDeliveryAreas([
      { id: 1, city: "חיפה", min_order: 100 },
      { id: 2, city: "עכו", min_order: 80, delivery_day: "" },
    ]);
    expect(res.mode).toBe("flat");
    expect(res.rows.map((r) => r.city)).toEqual(["חיפה", "עכו"]);
    expect(res.rows[1].delivery_day).toBeNull();
  });

  it("all rows share one day → hoist", () => {
    const res = groupDeliveryAreas([
      { id: 1, city: "חיפה", min_order: 100, delivery_day: "שישי" },
      { id: 2, city: "עכו", min_order: 80, delivery_day: "שישי" },
    ]);
    expect(res).toEqual({
      mode: "hoist",
      day: "שישי",
      rows: [
        { id: 1, city: "חיפה", min_order: 100, delivery_day: "שישי" },
        { id: 2, city: "עכו", min_order: 80, delivery_day: "שישי" },
      ],
    });
  });

  it("2+ distinct days → group, one group per day in first-appearance order", () => {
    const res = groupDeliveryAreas([
      { id: 1, city: "חיפה", min_order: 100, delivery_day: "שישי" },
      { id: 2, city: "עכו", min_order: 80, delivery_day: "שלישי" },
      { id: 3, city: "כרמיאל", min_order: 90, delivery_day: "שישי" },
    ]);
    expect(res.mode).toBe("group");
    expect(res.groups.map((g) => g.day)).toEqual(["שישי", "שלישי"]);
    expect(res.groups[0].rows.map((r) => r.city)).toEqual(["חיפה", "כרמיאל"]);
    expect(res.groups[1].rows.map((r) => r.city)).toEqual(["עכו"]);
    expect(res.arranged).toEqual([]);
  });

  it("one day + some dayless rows → group with an arranged bucket at the end", () => {
    const res = groupDeliveryAreas([
      { id: 1, city: "חיפה", min_order: 100, delivery_day: "שישי" },
      { id: 2, city: "עכו", min_order: 80 },
    ]);
    expect(res.mode).toBe("group");
    expect(res.groups.map((g) => g.day)).toEqual(["שישי"]);
    expect(res.groups[0].rows.map((r) => r.city)).toEqual(["חיפה"]);
    expect(res.arranged.map((r) => r.city)).toEqual(["עכו"]);
  });
});
