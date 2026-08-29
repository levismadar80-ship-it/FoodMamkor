import { describe, it, expect } from "vitest";
import {
  OPEN_NOW_CHIP_MIN,
  openNowChipVisible,
  CHIPS_CONFIG,
  PRODUCERS_CHIPS_CONFIG,
  buildChipParams,
} from "@/lib/producer-filters";
import { TOGGLE_CHIPS, chipStateToParams } from "@/lib/map-chips";
import { FILTER_AXES } from "@/lib/filter-taxonomy";
import { ATTRIBUTE_LABELS } from "@/lib/attribute-labels";
import { chipIcon } from "@/lib/chip-icons";

/**
 * MEH-2131 — the "פתוחים להזמנות עכשיו" chip: the axis reaching all three
 * surfaces, and the zero-result guard that keeps it from ever being a dead end.
 *
 * The guard cases here are built so each one FAILS against the pre-MEH-2131
 * gate (`openWindowCount >= OPEN_NOW_CHIP_MIN || active`), which had no notion
 * of "would this return anything right now". A case that the old gate would
 * also have answered correctly proves nothing about this change
 * (.claude/rules/testing.md — the construction has to discriminate).
 */

// Fixed instants, so no case depends on when the suite runs. Both are Sundays
// chosen for the Asia/Jerusalem hour they land on — the guard reads the clock
// through lib/orderWindow.js, which converts with Intl, so a UTC instant is
// unambiguous here regardless of the machine's own timezone.
const SUNDAY_MIDDAY = new Date("2026-08-16T09:00:00Z"); // 12:00 in Jerusalem
const SUNDAY_NIGHT = new Date("2026-08-16T22:30:00Z"); //  01:30 next day

const OPEN_9_TO_17 = { sunday: [{ open: "09:00", close: "17:00" }] };

/** n businesses that all declare the same window. */
const withWindow = (n, window = OPEN_9_TO_17) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, order_window: window }));

/** n businesses that have declared nothing. */
const withoutWindow = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: 100 + i, order_window: null }));

const FULLY_LOADED = { catalogFullyLoaded: true, now: SUNDAY_MIDDAY };

describe("MEH-2131 — the axis reaches all three surfaces", () => {
  it("is declared for home, /producers and /map", () => {
    expect([...FILTER_AXES.open_for_orders_now.surfaces].sort()).toEqual([
      "home",
      "map",
      "producers",
    ]);
  });

  it("appears in every surface's config, and in the cross-surface contract", () => {
    expect(CHIPS_CONFIG.map((c) => c.key)).toContain("open_for_orders_now");
    expect(PRODUCERS_CHIPS_CONFIG.map((c) => c.key)).toContain("open_for_orders_now");
    expect(TOGGLE_CHIPS.map((c) => c.key)).toContain("open_for_orders_now");
    // Membership here is the PROMISE that all three render it — the same
    // promise attributeLabels.test.js turns into a gate.
    expect(ATTRIBUTE_LABELS.open_for_orders_now).toBeDefined();
  });

  it("carries the Sapir-LOCKED plural copy, not MEH-1881's singular", () => {
    expect(FILTER_AXES.open_for_orders_now.label).toBe("פתוחים להזמנות עכשיו");
    // The exact string this replaced. Asserting its ABSENCE is what makes a
    // silent revert to the old copy fail rather than pass unnoticed.
    for (const chip of [...CHIPS_CONFIG, ...TOGGLE_CHIPS]) {
      expect(chip.label).not.toBe("פתוח להזמנות עכשיו");
    }
  });

  it("is a service-group axis with a Phosphor leading icon", () => {
    expect(FILTER_AXES.open_for_orders_now.group).toBe("service");
    expect(chipIcon("open_for_orders_now")).not.toBeNull();
  });

  it("emits ?open_for_orders_now on the listing AND on /map", () => {
    expect(buildChipParams({ open_for_orders_now: true })).toEqual({
      open_for_orders_now: true,
    });
    // NEW on /map — before this ticket the axis was not in TOGGLE_CHIPS at all,
    // so chipStateToParams could not emit it.
    expect(
      chipStateToParams({ categoryKeys: [], open_for_orders_now: true }, []),
    ).toEqual({ open_for_orders_now: true });
  });

  it("the frontend never sends a time — only the boolean", () => {
    const params = chipStateToParams(
      { categoryKeys: [], open_for_orders_now: true },
      [],
    );
    expect(Object.keys(params)).toEqual(["open_for_orders_now"]);
    expect(params.open_for_orders_now).toBe(true);
  });
});

describe("MEH-2131 — zero-result guard, the three required scenarios", () => {
  it("SCENARIO 1 — hidden when nothing is open right now", () => {
    // Coverage passes (10 ≥ 5), so the PRE-MEH-2131 gate would have shown the
    // chip here. It is the zero-result half that hides it.
    const producers = withWindow(10);
    expect(producers.length).toBeGreaterThanOrEqual(OPEN_NOW_CHIP_MIN);
    expect(
      openNowChipVisible({
        producers,
        catalogFullyLoaded: true,
        now: SUNDAY_NIGHT, // 01:30 — outside every 09:00-17:00 window
      }),
    ).toBe(false);
  });

  it("SCENARIO 2 — a URL-active filter keeps its chip even when hidden", () => {
    // Without this, a deep-linked ?open_for_orders_now=1 strands the visitor
    // with a filter she can see the effect of and cannot switch off.
    expect(
      openNowChipVisible({
        producers: withWindow(10),
        active: true,
        catalogFullyLoaded: true,
        now: SUNDAY_NIGHT,
      }),
    ).toBe(true);
    // ...and it survives the coverage gate too, on an empty catalog.
    expect(
      openNowChipVisible({ producers: [], active: true, ...FULLY_LOADED }),
    ).toBe(true);
  });

  it("SCENARIO 3 — the zero-result half does not run while pages are unfetched", () => {
    // A match may sit on a page nobody has loaded. Hiding on a partial catalog
    // would remove a working filter on the strength of a sample.
    expect(
      openNowChipVisible({
        producers: withWindow(10),
        catalogFullyLoaded: false,
        now: SUNDAY_NIGHT,
      }),
    ).toBe(true);
  });
});

describe("MEH-2131 — the guard's other edges", () => {
  it("shows the chip when at least one business is open", () => {
    expect(openNowChipVisible({ producers: withWindow(10), ...FULLY_LOADED })).toBe(true);
  });

  it("ONE open business is enough — the filter returns a non-empty list", () => {
    const producers = [...withWindow(1), ...withWindow(9, { monday: [{ open: "09:00", close: "17:00" }] })];
    expect(openNowChipVisible({ producers, ...FULLY_LOADED })).toBe(true);
  });

  it("keeps the MEH-1881 coverage gate — below the threshold, still hidden", () => {
    // Every one of these IS open right now, so only the coverage half can be
    // what hides the chip. This is the case that fails if a future edit
    // "simplifies" the guard down to the zero-result condition alone.
    const producers = withWindow(OPEN_NOW_CHIP_MIN - 1);
    expect(openNowChipVisible({ producers, ...FULLY_LOADED })).toBe(false);
  });

  it("counts declared windows, not rows — undeclared businesses do not pay in", () => {
    expect(
      openNowChipVisible({
        producers: [...withWindow(4), ...withoutWindow(50)],
        ...FULLY_LOADED,
      }),
    ).toBe(false);
  });

  it("closing_soon counts as open — the last hour is when it matters most", () => {
    // 16:30 Jerusalem, window closes 17:00 → inside CLOSING_SOON_MINUTES.
    expect(
      openNowChipVisible({
        producers: withWindow(10),
        catalogFullyLoaded: true,
        now: new Date("2026-08-16T13:30:00Z"),
      }),
    ).toBe(true);
  });

  it("with no clock yet, falls back to EXACTLY the pre-MEH-2131 answer", () => {
    // This is the hydration contract: the SSR pass and the first client render
    // both go through `now: null`, so the chip's presence cannot differ between
    // them. Asserted in both directions so it is a real equivalence and not a
    // one-sided "returns true".
    expect(
      openNowChipVisible({ producers: withWindow(10), catalogFullyLoaded: true, now: null }),
    ).toBe(true);
    expect(
      openNowChipVisible({ producers: withWindow(4), catalogFullyLoaded: true, now: null }),
    ).toBe(false);
  });

  it("tolerates junk rows rather than throwing", () => {
    expect(
      openNowChipVisible({
        producers: [null, undefined, {}, { order_window: {} }, ...withWindow(10)],
        ...FULLY_LOADED,
      }),
    ).toBe(true);
    expect(openNowChipVisible()).toBe(false);
  });
});

describe("MEH-2131 — self-test: the fixtures mean what the cases assume", () => {
  // Run this reading first. Every scenario above rests on SUNDAY_MIDDAY being
  // inside the fixture window and SUNDAY_NIGHT being outside it. If those two
  // instants ever stopped discriminating, every case above would still pass —
  // some by accident — and the suite would report a guard it never exercised.
  it("SUNDAY_MIDDAY is inside the fixture window and SUNDAY_NIGHT is outside", () => {
    const producers = withWindow(OPEN_NOW_CHIP_MIN);
    expect(
      openNowChipVisible({ producers, catalogFullyLoaded: true, now: SUNDAY_MIDDAY }),
      "SUNDAY_MIDDAY must fall INSIDE 09:00-17:00 Jerusalem",
    ).toBe(true);
    expect(
      openNowChipVisible({ producers, catalogFullyLoaded: true, now: SUNDAY_NIGHT }),
      "SUNDAY_NIGHT must fall OUTSIDE 09:00-17:00 Jerusalem",
    ).toBe(false);
  });
});
