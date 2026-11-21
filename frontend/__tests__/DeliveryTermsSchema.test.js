// MEH-3511 — the producer schema must carry a city's delivery time and order
// cutoff, and the business-wide terms, through the parse.
import { describe, it, expect } from "vitest";
import { ProducerSchema } from "@/lib/schemas";

const producer = {
  id: "p1",
  name: "מאפיית השדה",
  delivery_min_order: 150,
  delivery_days_min: 2,
  delivery_days_max: 5,
  delivery_areas: [
    { city: "רמת גן", zone_name: "גוש דן, אקספרס", delivery_days_max: 1, order_cutoff_day: "שני", order_cutoff_time: "18:00" },
    { city: "חיפה" },
  ],
};

describe("ProducerSchema keeps the delivery terms (MEH-3511)", () => {
  it("a zone city keeps its time and cutoff", () => {
    const [row] = ProducerSchema.parse(producer).delivery_areas;
    expect(row.delivery_days_max).toBe(1);
    expect(row.order_cutoff_day).toBe("שני");
    expect(row.order_cutoff_time).toBe("18:00");
  });

  it("the business-wide terms survive at the top level", () => {
    const p = ProducerSchema.parse(producer);
    expect([p.delivery_min_order, p.delivery_days_min, p.delivery_days_max]).toEqual([150, 2, 5]);
  });

  it("a city without them still parses", () => {
    expect(ProducerSchema.parse(producer).delivery_areas[1].delivery_days_max).toBeUndefined();
  });
});
