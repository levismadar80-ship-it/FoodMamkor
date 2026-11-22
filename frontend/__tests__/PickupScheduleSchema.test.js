// MEH-3512 — the producer schema must carry a pickup point's days and cutoff
// through the parse. z.object strips undeclared nested keys, so without the
// declaration the business page never sees them (the MEH-2142 shape).
import { describe, it, expect } from "vitest";
import { ProducerSchema } from "@/lib/schemas";

const producer = {
  id: "p1",
  name: "המטבח של סנדרה",
  locations: [
    { kind: "pickup", city: "כפר יונה", pickup_days: ["שלישי"], order_cutoff_day: "שני", order_cutoff_time: "15:00" },
    { kind: "pickup", city: "חיפה" },
  ],
};

describe("ProducerSchema keeps the pickup schedule (MEH-3512)", () => {
  it("a point with days and a cutoff keeps all three after the parse", () => {
    const [loc] = ProducerSchema.parse(producer).locations;
    expect(loc.pickup_days).toEqual(["שלישי"]);
    expect(loc.order_cutoff_day).toBe("שני");
    expect(loc.order_cutoff_time).toBe("15:00");
  });

  it("a point without them still parses (renders as today)", () => {
    const loc = ProducerSchema.parse(producer).locations[1];
    expect(loc.pickup_days).toBeUndefined();
    expect(loc.order_cutoff_day).toBeUndefined();
  });
});
