/**
 * MEH-2469 — the end time reaches Google: buildEventJsonLd emits endDate only
 * when there are both a start and an end time (same day).
 */
import { describe, it, expect } from "vitest";
import { buildEventJsonLd } from "@/lib/seo";

const BASE = {
  id: 7,
  title: "שוק גלם",
  event_date: "2026-11-07",
  price: 0,
  producer_name: "שוק גלם",
  producer_id: "p-1",
};
const node = (ld) => ld["@graph"].find((n) => n["@type"] === "Event");

describe("buildEventJsonLd — endDate (MEH-2469)", () => {
  it("start + end → startDate and endDate on the same day", () => {
    const ev = node(buildEventJsonLd({ ...BASE, event_time: "09:30:00", end_time: "15:00:00" }));
    expect(ev.startDate).toBe("2026-11-07T09:30");
    expect(ev.endDate).toBe("2026-11-07T15:00");
  });

  it("start only → no endDate", () => {
    const ev = node(buildEventJsonLd({ ...BASE, event_time: "09:30:00", end_time: null }));
    expect(ev.endDate).toBeUndefined();
  });

  it("no start time → no endDate even if an end is present", () => {
    const ev = node(buildEventJsonLd({ ...BASE, event_time: null, end_time: "15:00:00" }));
    expect(ev.endDate).toBeUndefined();
  });
});
