/**
 * MEH-1854 (MEH-291 Phase 4, chunk 1) — the shared enum-first availability read.
 *
 * Four surfaces open-coded this fallback chain and THREE of them dropped the
 * legacy `"full"` rung, so a business marked full-this-week on legacy-only data
 * read as merely accepting orders. The point of the helper is that there is now
 * one chain; the point of this file is that the chain is the COMPLETE one.
 *
 * The legacy branch must keep working until chunk 2's backfill lands — a row
 * whose enum is still null has to render correctly today. That is why the
 * fallback cases below are not "legacy compatibility nice-to-haves": they are
 * the live path for every un-backfilled row.
 */

import { describe, it, expect } from "vitest";
import {
  AVAILABILITY_STATES,
  deriveAvailability,
  isAvailableToday,
  isFullThisWeek,
  isOnVacation,
} from "@/lib/availability";

describe("deriveAvailability — enum-first", () => {
  it("uses availability_state when present, ignoring the legacy columns", () => {
    // The legacy pair here says available_today; the enum says on_vacation.
    // Enum wins, or the backfill could never correct a wrong legacy row.
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

describe("deriveAvailability — legacy fallback (the un-backfilled path)", () => {
  it('maps availability_status "vacation" to on_vacation', () => {
    expect(deriveAvailability({ availability_status: "vacation" })).toBe(
      AVAILABILITY_STATES.ON_VACATION
    );
  });

  it('maps availability_status "full" to full_this_week', () => {
    // THE REGRESSION CASE. availabilityDot, ProducerDetail and ProducerHeader
    // each lacked this rung before MEH-1854; this returned accepting_orders.
    expect(deriveAvailability({ availability_status: "full" })).toBe(
      AVAILABILITY_STATES.FULL_THIS_WEEK
    );
  });

  it("maps is_available_today to available_today", () => {
    expect(deriveAvailability({ is_available_today: true })).toBe(
      AVAILABILITY_STATES.AVAILABLE_TODAY
    );
  });

  it("defaults to accepting_orders", () => {
    expect(deriveAvailability({ is_available_today: false })).toBe(
      AVAILABILITY_STATES.ACCEPTING_ORDERS
    );
  });

  it("honours vacation > full > is_available_today precedence", () => {
    // Mirrors _legacy_to_state in producer_me.py:604-615. A row can carry
    // contradictory legacy values; the order of the rungs decides the answer,
    // so it is pinned rather than left to whichever branch happens to be first.
    expect(
      deriveAvailability({ availability_status: "vacation", is_available_today: true })
    ).toBe(AVAILABILITY_STATES.ON_VACATION);
    expect(
      deriveAvailability({ availability_status: "full", is_available_today: true })
    ).toBe(AVAILABILITY_STATES.FULL_THIS_WEEK);
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
  it("isAvailableToday is true on the enum AND on the legacy flag", () => {
    // Both halves matter: the Friday pill read ONLY the legacy flag before
    // MEH-1854, so an enum-only business never got it.
    expect(isAvailableToday({ availability_state: "available_today" })).toBe(true);
    expect(isAvailableToday({ is_available_today: true })).toBe(true);
    expect(isAvailableToday({ availability_state: "on_vacation" })).toBe(false);
  });

  it("isOnVacation and isFullThisWeek read the same derived state", () => {
    expect(isOnVacation({ availability_status: "vacation" })).toBe(true);
    expect(isFullThisWeek({ availability_status: "full" })).toBe(true);
    expect(isFullThisWeek({ availability_state: "accepting_orders" })).toBe(false);
  });
});
