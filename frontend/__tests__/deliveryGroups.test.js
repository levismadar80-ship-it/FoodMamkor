import { describe, it, expect } from "vitest";
import { groupDeliveryAreas } from "@/lib/deliveryGroups";

// MEH-1305 A — dispatch-day pivot. Every branch of groupDeliveryAreas.

// MEH-1794: the delivery_areas fields the UI consumes downstream. This list is
// the CHECKLIST a delivery_areas column has to join — groupDeliveryAreas
// forwards rows through an explicit whitelist, so anything missing from that
// whitelist is dropped in silence between the API and DeliveryBlock.
const AREA_FIELDS = ["id", "city", "min_order", "delivery_day", "delivery_fee"];

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
        // MEH-1794: delivery_fee joins the forwarded shape (null = inherit).
        { id: 1, city: "חיפה", min_order: 100, delivery_day: "שישי", delivery_fee: null },
        { id: 2, city: "עכו", min_order: 80, delivery_day: "שישי", delivery_fee: null },
      ],
    });
  });

  // MEH-1794 — the guard. Asserts the SHAPE, not the presence of one field:
  // the forwarded row's key set must equal AREA_FIELDS exactly. Dropping any
  // field from the whitelist reds this, and so does forwarding a field the
  // list does not declare — the failure names the offending keys either way.
  //
  // Why an exact key set and not `toHaveProperty("delivery_fee")`: a
  // single-field assertion only ever protects the field someone remembered to
  // write it for, which is precisely the failure being fixed here — the column
  // shipped in the DB and the serializer and still reached no UI.
  it("forwards the whole delivery_areas shape — a dropped field reds this", () => {
    const input = {
      id: 1,
      city: "חיפה",
      min_order: 100,
      delivery_day: "שישי",
      delivery_fee: 20,
    };
    // The fixture must itself cover the checklist, or the assertion below is
    // measuring a subset and would pass while a real column goes missing.
    expect(Object.keys(input).sort()).toEqual([...AREA_FIELDS].sort());

    const [row] = groupDeliveryAreas([input]).rows;
    expect(Object.keys(row).sort()).toEqual([...AREA_FIELDS].sort());
  });

  // MEH-1794: 0 is a real fee ("משלוח חינם" to this city) and must survive the
  // forward as 0. `|| null` would turn it into "no override, inherit" — the
  // whole point of the column, lost silently one layer before render.
  it("forwards delivery_fee keeping 0 distinct from absent", () => {
    const res = groupDeliveryAreas([
      { id: 1, city: "תל אביב", delivery_day: "שישי", delivery_fee: 20 },
      { id: 2, city: "חיפה", delivery_day: "שישי", delivery_fee: 0 },
      { id: 3, city: "עכו", delivery_day: "שישי" },
    ]);
    expect(res.rows.map((r) => r.delivery_fee)).toEqual([20, 0, null]);
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
