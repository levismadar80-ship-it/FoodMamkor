// MEH-3597: the pickup window line, in Israel time, from naive UTC.
import { describe, it, expect } from "vitest";
import { pickupWindowText } from "@/lib/group-buy-pickup";

describe("pickupWindowText", () => {
  it("one day: the day once, then the hours (UTC 07:00 = 09:00 in December)", () => {
    expect(pickupWindowText("2099-12-04T07:00:00", "2099-12-04T11:00:00", "he")).toBe("יום שישי, 4 בדצמבר, \u206609:00\u2060–\u206013:00\u2069");
  });
  it("across days: both dates", () => {
    const text = pickupWindowText("2099-12-04T07:00:00", "2099-12-05T11:00:00", "he");
    expect(text).toContain("4 בדצמבר, \u206609:00\u2069 – ");
    expect(text).toContain("5 בדצמבר, \u206613:00\u2069");
  });
  it("missing or broken: null", () => {
    expect(pickupWindowText(null, "2099-12-04T11:00:00", "he")).toBeNull();
    expect(pickupWindowText("x", "y", "he")).toBeNull();
  });
  it("summer clock: UTC 06:00 is 09:00 in July", () => {
    expect(pickupWindowText("2099-07-03T06:00:00", "2099-07-03T10:00:00", "he")).toContain("09:00\u2060–\u206013:00");
  });
});

// MEH-3597: what the create form sends — both halves, or neither.
import { pickupWindowPayload } from "@/components/group-buy/GroupBuyPickupWindowFields";

describe("pickupWindowPayload", () => {
  it("both empty: nulls, the group is created without a window", () => {
    expect(pickupWindowPayload("", "")).toEqual({ pickup_starts_at: null, pickup_ends_at: null });
  });
  it("one half only: the both-halves error", () => {
    expect(pickupWindowPayload("2099-12-04T09:00", "")).toEqual({ error: "pickup_window_both" });
    expect(pickupWindowPayload("", "13:00")).toEqual({ error: "pickup_window_both" });
  });
  it("end not after start: the order error", () => {
    expect(pickupWindowPayload("2099-12-04T09:00", "09:00")).toEqual({ error: "pickup_window_order" });
    expect(pickupWindowPayload("2099-12-04T09:00", "08:00")).toEqual({ error: "pickup_window_order" });
  });
  it("summer clock: 09:00 in July is 06:00Z", () => {
    expect(pickupWindowPayload("2099-07-03T09:00", "13:00")).toEqual({
      pickup_starts_at: "2099-07-03T06:00:00.000Z",
      pickup_ends_at: "2099-07-03T10:00:00.000Z",
    });
  });

  it("Israel wall clock to UTC, the end on the start's day", () => {
    expect(pickupWindowPayload("2099-12-04T09:00", "13:00")).toEqual({
      pickup_starts_at: "2099-12-04T07:00:00.000Z",
      pickup_ends_at: "2099-12-04T11:00:00.000Z",
    });
  });
});
