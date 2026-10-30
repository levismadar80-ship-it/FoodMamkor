// MEH-2602: the owner picks an availability state on the dashboard and the
// admin picks the same four states on the producer form — they read
// «זמין היום / עמוס השבוע» in one place and «זמינה היום / עמוסה השבוע» in the
// other. The admin form now uses the dashboard's words.
import { describe, it, expect } from "vitest";
import he from "../messages/he.json";

describe("availability labels: admin form = owner dashboard (MEH-2602)", () => {
  const dash = he.dashboard.producer.availability.options;
  const admin = he.admin.producers.form.fields;
  it.each([
    ["accepting_orders", "avail_accepting"],
    ["available_today", "avail_today"],
    ["full_this_week", "avail_full"],
    ["on_vacation", "avail_vacation"],
  ])("%s", (dashKey, adminKey) => {
    expect(admin[adminKey]).toBe(dash[dashKey]);
  });
});
