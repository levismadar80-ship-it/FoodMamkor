/**
 * MEH-2142 (MEH-1938 batch B3) — `resolveStoreHours`: which store-hours string
 * a consumer surface shows.
 *
 * Store hours moved to a per-location fact. The owner edits
 * `ProducerLocation.opening_hours` in LocationsEditor; the business-level
 * editor was removed and its write path closed. `Producer.opening_hours`
 * survives as a fallback for businesses that filled it in before the switch —
 * LEGACY(2026-10-01, MEH-1938), a readers-first Parallel Change.
 *
 * Every case here fails against the pre-change code for the honest reason: the
 * function did not exist. That makes the file as a whole non-discriminating in
 * the MEH-1619 sense, which is why it carries a SELF-TEST-shaped case at the
 * bottom instead of relying on the reds: the three-way classification is fed a
 * primary-with-hours, a primary-without, and a no-locations input, and asserted
 * to sort them differently. A resolver that always returned the legacy column
 * (the plausible wrong implementation) passes cases 2 and 3 and fails case 1.
 */
import { describe, it, expect } from "vitest";

import { resolveStoreHours } from "@/lib/hours";

const PRIMARY_HOURS = "Sun-Thu 08:00-16:00";
const LEGACY_HOURS = "Sun-Thu 09:00-18:00";
const PICKUP_HOURS = "Fri 07:00-12:00";

const loc = (over = {}) => ({
  kind: "branch",
  is_primary: false,
  city: "חיפה",
  opening_hours: null,
  ...over,
});

describe("resolveStoreHours", () => {
  it("prefers the primary location's hours over the legacy column", () => {
    expect(
      resolveStoreHours({
        opening_hours: LEGACY_HOURS,
        locations: [loc({ is_primary: true, opening_hours: PRIMARY_HOURS })],
      }),
    ).toBe(PRIMARY_HOURS);
  });

  it("falls back to the legacy column when the primary has no hours", () => {
    expect(
      resolveStoreHours({
        opening_hours: LEGACY_HOURS,
        locations: [loc({ is_primary: true, opening_hours: null })],
      }),
    ).toBe(LEGACY_HOURS);
  });

  it("falls back when the business has no locations at all", () => {
    expect(resolveStoreHours({ opening_hours: LEGACY_HOURS })).toBe(LEGACY_HOURS);
    expect(
      resolveStoreHours({ opening_hours: LEGACY_HOURS, locations: [] }),
    ).toBe(LEGACY_HOURS);
  });

  it("returns null when neither side has hours", () => {
    expect(resolveStoreHours({})).toBeNull();
    expect(resolveStoreHours({ opening_hours: null, locations: [loc()] })).toBeNull();
  });

  it("treats a whitespace-only value as absent on BOTH sides", () => {
    // Same trim the completeness heuristic applies, so "has hours?" and "which
    // hours?" cannot disagree about a string of spaces.
    expect(
      resolveStoreHours({
        opening_hours: LEGACY_HOURS,
        locations: [loc({ is_primary: true, opening_hours: "   " })],
      }),
    ).toBe(LEGACY_HOURS);
    expect(
      resolveStoreHours({ opening_hours: "   ", locations: [loc()] }),
    ).toBeNull();
  });

  it("IGNORES a non-primary location's hours entirely", () => {
    // The discriminating case for `find(is_primary)` vs `locations[0]`. A
    // pickup point's own hours render in DeliveryBlock and MiniMap (MEH-1509)
    // and must never answer "when is the shop open".
    expect(
      resolveStoreHours({
        opening_hours: LEGACY_HOURS,
        locations: [
          loc({ kind: "pickup", opening_hours: PICKUP_HOURS }),
          loc({ is_primary: true, opening_hours: PRIMARY_HOURS }),
        ],
      }),
    ).toBe(PRIMARY_HOURS);
  });

  it("does not read position — the primary can be last in the array", () => {
    // `locations[0]` would return the pickup row's hours here and look correct
    // in every other test, because the fixtures above happen to list the
    // primary first.
    expect(
      resolveStoreHours({
        opening_hours: null,
        locations: [
          loc({ kind: "market_stand", opening_hours: PICKUP_HOURS }),
          loc({ is_primary: true, opening_hours: PRIMARY_HOURS }),
        ],
      }),
    ).toBe(PRIMARY_HOURS);
  });

  it("survives a malformed payload without throwing", () => {
    expect(resolveStoreHours(null)).toBeNull();
    expect(resolveStoreHours(undefined)).toBeNull();
    expect(resolveStoreHours({ locations: "not an array" })).toBeNull();
    expect(resolveStoreHours({ locations: [null, undefined] })).toBeNull();
  });

  it("SELF-TEST: the three inputs are sorted differently, not merged", () => {
    // Run this first when reading a failure. It feeds the classifier one input
    // of each shape and asserts the three answers are mutually distinct — a
    // resolver that always returned the legacy column, or always the primary's,
    // would collapse two of these onto one value.
    const fromPrimary = resolveStoreHours({
      opening_hours: LEGACY_HOURS,
      locations: [loc({ is_primary: true, opening_hours: PRIMARY_HOURS })],
    });
    const fromLegacy = resolveStoreHours({
      opening_hours: LEGACY_HOURS,
      locations: [loc({ is_primary: true })],
    });
    const fromNeither = resolveStoreHours({ locations: [loc({ is_primary: true })] });

    expect(fromPrimary).toBe(PRIMARY_HOURS);
    expect(fromLegacy).toBe(LEGACY_HOURS);
    expect(fromNeither).toBeNull();
    expect(new Set([fromPrimary, fromLegacy, fromNeither]).size).toBe(3);
  });
});
