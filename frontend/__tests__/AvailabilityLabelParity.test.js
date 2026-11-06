// MEH-2602: the owner picks an availability state on the dashboard and the
// admin picks the same states on the producer form — they used to read
// differently in the two places. The admin form uses the dashboard's words.
// MEH-2759: two states left (pause-only); `accepting_orders` is the admin's
// «פתוח להזמנות» button and the dashboard switch's OFF position.
import { describe, it, expect } from "vitest";
import he from "../messages/he.json";

describe("availability labels: admin form = owner dashboard (MEH-2602)", () => {
  const dash = he.dashboard.producer.availability.options;
  const admin = he.admin.producers.form.fields;
  it.each([
    ["accepting_orders", "avail_accepting"],
    ["on_vacation", "avail_vacation"],
  ])("%s", (dashKey, adminKey) => {
    expect(admin[adminKey]).toBe(dash[dashKey]);
  });

  it("MEH-2759: the two removed states have no label left in either place", () => {
    expect(Object.keys(dash).sort()).toEqual(["accepting_orders", "on_vacation"]);
    expect(admin.avail_today).toBeUndefined();
    expect(admin.avail_full).toBeUndefined();
  });
});
