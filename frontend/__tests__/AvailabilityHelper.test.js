/**
 * MEH-1854 chunk 1 (#2918) created the shared enum-first availability read.
 * MEH-2271 (chunk 3a) removed its legacy fallback, and this file moved with it.
 *
 * What the fallback bought, and why it is gone. Four surfaces open-coded the
 * chain and THREE dropped the legacy `"full"` rung, so a business marked
 * full-this-week on legacy-only data read as merely accepting orders. Chunk 1
 * fixed that by giving them one chain. Chunk 3a fixes it a second time and
 * permanently, by making `availability_state` the only column anything writes:
 * the server now derives `availability_status` / `is_available_today` FROM the
 * enum at serialization time, so a fallback onto them would read a value
 * computed from the enum one step earlier.
 *
 * The suite therefore inverts. It used to prove the fallback ran; it now proves
 * the fallback CANNOT run — a producer carrying legacy values that contradict
 * its state must be read by the state alone.
 */

import { describe, it, expect } from "vitest";
import {
  AVAILABILITY_STATES,
  deriveAvailability,
  isAvailableToday,
  isFullThisWeek,
  isOnVacation,
} from "@/lib/availability";

describe("deriveAvailability — enum-only", () => {
  it("uses availability_state when present, ignoring the legacy columns", () => {
    // The legacy pair here says available_today; the enum says on_vacation.
    expect(
      deriveAvailability({
        availability_state: "on_vacation",
        availability_status: "available",
        is_available_today: true,
      })
    ).toBe(AVAILABILITY_STATES.ON_VACATION);
  });

  it.each([
    "accepting_orders",
    "available_today",
    "full_this_week",
    "on_vacation",
  ])("passes through the %s enum value unchanged", (state) => {
    expect(deriveAvailability({ availability_state: state })).toBe(state);
  });
});

describe("deriveAvailability — the legacy columns are inert (MEH-2271)", () => {
  // Every case below returned something OTHER than accepting_orders under the
  // chunk-1 helper. That is what makes this a discriminating suite rather than
  // a restatement of the default: run it against the pre-MEH-2271
  // implementation and all four fail.
  it.each([
    ["vacation", AVAILABILITY_STATES.ON_VACATION],
    ["full", AVAILABILITY_STATES.FULL_THIS_WEEK],
  ])(
    'availability_status "%s" alone no longer derives %s',
    (status) => {
      expect(deriveAvailability({ availability_status: status })).toBe(
        AVAILABILITY_STATES.ACCEPTING_ORDERS
      );
    }
  );

  it("is_available_today alone no longer derives available_today", () => {
    expect(deriveAvailability({ is_available_today: true })).toBe(
      AVAILABILITY_STATES.ACCEPTING_ORDERS
    );
  });

  it("a contradictory legacy pair cannot override the state", () => {
    // The shape MEH-2271 leaves in the DB: the two columns frozen at whatever
    // they held when the dual-write stopped, while the state moved on. The
    // chunk-1 helper would still have preferred the enum here — this case is
    // pinned because it is the production shape, not because it discriminates.
    expect(
      deriveAvailability({
        availability_state: "accepting_orders",
        availability_status: "vacation",
        is_available_today: true,
      })
    ).toBe(AVAILABILITY_STATES.ACCEPTING_ORDERS);
  });
});

describe("deriveAvailability — defensive", () => {
  it.each([null, undefined, {}])(
    "returns accepting_orders for %s rather than throwing",
    (input) => {
      expect(deriveAvailability(input)).toBe(AVAILABILITY_STATES.ACCEPTING_ORDERS);
    }
  );
});

describe("predicates", () => {
  it("isAvailableToday reads the enum, and only the enum", () => {
    expect(isAvailableToday({ availability_state: "available_today" })).toBe(true);
    // The Friday pill read ONLY this flag before chunk 1. It reads only the
    // enum now, and the server sets the enum — so the pill still lights for
    // every business it used to, via availability_state.
    expect(isAvailableToday({ is_available_today: true })).toBe(false);
    expect(isAvailableToday({ availability_state: "on_vacation" })).toBe(false);
  });

  it("isOnVacation and isFullThisWeek read the same derived state", () => {
    expect(isOnVacation({ availability_state: "on_vacation" })).toBe(true);
    expect(isFullThisWeek({ availability_state: "full_this_week" })).toBe(true);
    expect(isFullThisWeek({ availability_state: "accepting_orders" })).toBe(false);
    expect(isOnVacation({ availability_status: "vacation" })).toBe(false);
  });
});
