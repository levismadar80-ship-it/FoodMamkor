import { describe, it, expect } from "vitest";
import {
  FILTER_AXES,
  LISTING_CHIP_ORDER,
  MAP_CHIP_ORDER,
  SHARED_AXIS_KEYS,
  axisKeysFor,
  chipsForKeys,
  defaultsForKeys,
  homeParamFor,
  mapEmitsParam,
} from "@/lib/filter-taxonomy";
import {
  CHIPS_CONFIG,
  CHIPS_DEFAULT,
  PRODUCERS_CHIPS_CONFIG,
  PRODUCERS_CHIPS_DEFAULT,
  buildChipParams,
  withChipGroups,
} from "@/lib/producer-filters";
import { TOGGLE_CHIPS, chipStateToParams } from "@/lib/map-chips";
import { ATTRIBUTE_LABELS } from "@/lib/attribute-labels";

/**
 * MEH-2130 — the taxonomy is the single definition of every filter axis.
 *
 * These tests exist to make the "defined exactly once" claim FALSIFIABLE rather
 * than a comment. Each one names a way the pre-MEH-2130 arrangement drifted and
 * asserts that deriving closes it:
 *
 *   - a surface list and a param serializer disagreeing (pickup on /map only,
 *     no_added_sugar hydrated nowhere on home)
 *   - an order array silently losing an axis (which used to sort it to the
 *     FRONT via a bare indexOf → -1, the MEH-1862 sorting bug)
 *   - a group filed differently on two surfaces
 *
 * The self-checks at the bottom exercise the derivation helpers against inputs
 * whose answers are known, so a green here is not the "probe never ran" green
 * (.claude/rules/testing.md — a null that is also the reassuring answer).
 */

const ALL_KEYS = Object.keys(FILTER_AXES);
const SURFACES = ["home", "producers", "map"];
const SCOPES = ["business", "any-product", "facility"];
const EVIDENCE = ["self-declared", "admin-verified", "system"];
const GROUPS = ["diet", "quality", "service"];

describe("MEH-2130 — axis declarations are complete and well-formed", () => {
  it("every axis declares label, scope, evidence, group and surfaces", () => {
    expect(ALL_KEYS.length).toBeGreaterThan(0);
    for (const key of ALL_KEYS) {
      const axis = FILTER_AXES[key];
      expect(typeof axis.label, `${key}.label`).toBe("string");
      expect(axis.label.length, `${key}.label empty`).toBeGreaterThan(0);
      expect(SCOPES, `${key}.scope`).toContain(axis.scope);
      expect(EVIDENCE, `${key}.evidence`).toContain(axis.evidence);
      expect(GROUPS, `${key}.group`).toContain(axis.group);
      expect(Array.isArray(axis.surfaces), `${key}.surfaces`).toBe(true);
      expect(axis.surfaces.length, `${key} offered on no surface`).toBeGreaterThan(0);
      for (const s of axis.surfaces) expect(SURFACES, `${key}.surfaces`).toContain(s);
      // subtext is either null (FilterSheet falls back to a BADGE_CONFIG
      // tooltip) or a non-empty string — never undefined, never "".
      expect(
        axis.subtext === null || (typeof axis.subtext === "string" && axis.subtext.length > 0),
        `${key}.subtext must be null or a non-empty string`,
      ).toBe(true);
    }
  });

  it("labels stay text-only — no emoji, no glyphs (Emoji-LOCK v2, MEH-657)", () => {
    for (const key of ALL_KEYS) {
      expect(FILTER_AXES[key].label, key).toMatch(/^[֐-׿ ]+$/);
    }
  });

  it("no axis label is a duplicate of another", () => {
    const labels = ALL_KEYS.map((k) => FILTER_AXES[k].label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("MEH-2130 — order arrays are exact permutations of their membership", () => {
  // This is the guard that makes `axisKeysFor`'s "unranked sorts last" branch
  // unreachable in production. Without it, adding an axis and forgetting the
  // order entry lands it at the end of the row with no failure anywhere —
  // exactly the silent placement MEH-1862 hit from the opposite direction.
  it("MAP_CHIP_ORDER covers exactly the /map axes", () => {
    const members = ALL_KEYS.filter((k) => FILTER_AXES[k].surfaces.includes("map"));
    expect([...MAP_CHIP_ORDER].sort()).toEqual([...members].sort());
  });

  it("LISTING_CHIP_ORDER covers exactly the listing axes (home ∪ producers)", () => {
    const members = ALL_KEYS.filter(
      (k) =>
        FILTER_AXES[k].surfaces.includes("home") ||
        FILTER_AXES[k].surfaces.includes("producers"),
    );
    expect([...LISTING_CHIP_ORDER].sort()).toEqual([...members].sort());
  });
});

describe("MEH-2130 — surfaces decide membership, and nothing else does", () => {
  it("CHIPS_CONFIG is exactly the home axes, in LISTING order", () => {
    const expected = LISTING_CHIP_ORDER.filter((k) =>
      FILTER_AXES[k].surfaces.includes("home"),
    );
    expect(CHIPS_CONFIG.map((c) => c.key)).toEqual(expected);
  });

  it("PRODUCERS_CHIPS_CONFIG is exactly the /producers axes, in LISTING order", () => {
    const expected = LISTING_CHIP_ORDER.filter((k) =>
      FILTER_AXES[k].surfaces.includes("producers"),
    );
    expect(PRODUCERS_CHIPS_CONFIG.map((c) => c.key)).toEqual(expected);
  });

  it("TOGGLE_CHIPS is exactly the /map axes, in MAP order", () => {
    const expected = MAP_CHIP_ORDER.filter((k) => FILTER_AXES[k].surfaces.includes("map"));
    expect(TOGGLE_CHIPS.map((c) => c.key)).toEqual(expected);
  });

  it("ATTRIBUTE_LABELS is exactly the cross-surface axes", () => {
    expect(Object.keys(ATTRIBUTE_LABELS).sort()).toEqual([...SHARED_AXIS_KEYS].sort());
    // The two surface-local axes are excluded BY THEIR OWN declaration —
    // there is no second exclusion list to maintain.
    expect(ATTRIBUTE_LABELS.grass_fed).toBeUndefined();
    expect(FILTER_AXES.grass_fed.surfaces).toEqual(["map"]);
    // MEH-2131 widened `open_for_orders_now` from ["producers"] to all three,
    // so it is now cross-surface BY ITS OWN DECLARATION and correctly appears
    // in ATTRIBUTE_LABELS. This case previously asserted the opposite; the
    // invariant it was really protecting — that membership follows `surfaces`
    // and nothing else — is what the first assertion in this test states, and
    // that one is unchanged. `grass_fed` remains the surface-local example.
    expect(ATTRIBUTE_LABELS.open_for_orders_now).toBeDefined();
    expect([...FILTER_AXES.open_for_orders_now.surfaces].sort()).toEqual([
      "home",
      "map",
      "producers",
    ]);
  });

  it("defaults cover exactly their config, all false", () => {
    expect(Object.keys(CHIPS_DEFAULT).sort()).toEqual(CHIPS_CONFIG.map((c) => c.key).sort());
    expect(Object.keys(PRODUCERS_CHIPS_DEFAULT).sort()).toEqual(
      PRODUCERS_CHIPS_CONFIG.map((c) => c.key).sort(),
    );
    for (const v of Object.values(PRODUCERS_CHIPS_DEFAULT)) expect(v).toBe(false);
  });
});

describe("MEH-2130 — the משלוח + איסוף עצמי pair reaches all three surfaces", () => {
  // The substance of the ticket. Before it, "איסוף עצמי" existed on /map only
  // (MEH-2046), although `?pickup_points=true` has been a public, global
  // backend filter the whole time.
  it.each(["has_delivery", "pickup_points"])(
    "%s is offered on home, /producers and /map",
    (key) => {
      expect([...FILTER_AXES[key].surfaces].sort()).toEqual(["home", "map", "producers"]);
      expect(CHIPS_CONFIG.map((c) => c.key)).toContain(key);
      expect(PRODUCERS_CHIPS_CONFIG.map((c) => c.key)).toContain(key);
      expect(TOGGLE_CHIPS.map((c) => c.key)).toContain(key);
    },
  );

  it("they render adjacently on the listing surfaces, delivery first (RTL)", () => {
    const keys = CHIPS_CONFIG.map((c) => c.key);
    expect(keys.indexOf("pickup_points")).toBe(keys.indexOf("has_delivery") + 1);
  });

  it("the pair carries the locked labels, identical on every surface", () => {
    expect(FILTER_AXES.has_delivery.label).toBe("משלוח");
    expect(FILTER_AXES.pickup_points.label).toBe("איסוף עצמי"); // MEH-1461
    for (const key of ["has_delivery", "pickup_points"]) {
      const label = FILTER_AXES[key].label;
      expect(CHIPS_CONFIG.find((c) => c.key === key).label).toBe(label);
      expect(TOGGLE_CHIPS.find((c) => c.key === key).label).toBe(label);
    }
  });

  it("/producers emits ?pickup_points=true — the SAME param /map uses", () => {
    expect(buildChipParams({ pickup_points: true })).toEqual({ pickup_points: true });
    expect(chipStateToParams({ categoryKeys: [], pickup_points: true }, [])).toEqual({
      pickup_points: true,
    });
  });
});

describe("MEH-2130 — param names are declared once per surface", () => {
  it("home uses the axis key for every axis except the legacy delivery short name", () => {
    const overrides = Object.keys(FILTER_AXES).filter((k) => homeParamFor(k) !== k);
    expect(overrides).toEqual(["has_delivery"]);
    expect(homeParamFor("has_delivery")).toBe("delivery");
    expect(homeParamFor("pickup_points")).toBe("pickup_points");
  });

  it("buildChipParams emits every /producers axis and nothing else", () => {
    const allOn = Object.fromEntries(PRODUCERS_CHIPS_CONFIG.map((c) => [c.key, true]));
    expect(Object.keys(buildChipParams(allOn)).sort()).toEqual(
      PRODUCERS_CHIPS_CONFIG.map((c) => c.key).sort(),
    );
  });

  it("an unset axis emits no param (home passes a smaller state object)", () => {
    expect(buildChipParams({})).toEqual({});
    expect(buildChipParams({ vegan: false })).toEqual({});
  });

  // This case was PIN SITE 3 of 3 under MEH-2130, asserting the defect. It is
  // FLIPPED to assert the correct behaviour, not deleted: a removed test is a
  // removed guarantee, and this axis is the one that demonstrably lacked one.
  // (The pin's ticket identifier is intentionally not repeated anywhere in
  // source — its grep was the pin-finding mechanism, and leaving hits behind
  // would make a live pin indistinguishable from a note about one.)
  //
  // The defect: /map listed `no_added_sugar` in TOGGLE_CHIPS and FilterSheet
  // rendered it, while chipStateToParams emitted nothing — so toggling the chip
  // returned the UNFILTERED set, silently. Every assertion below is the exact
  // inverse of what it asserted while pinned.
  it("/map emits no_added_sugar, the same as /producers (was pin 3 of 3)", () => {
    expect(mapEmitsParam("no_added_sugar")).toBe(true);
    expect(TOGGLE_CHIPS.map((c) => c.key)).toContain("no_added_sugar");
    expect(chipStateToParams({ categoryKeys: [], no_added_sugar: true }, [])).toEqual({
      no_added_sugar: true,
    });
    // The EXCLUSION witness, and the reason this is not just a shape check: a
    // chipStateToParams that returned `{ no_added_sugar: true }` for every input
    // would satisfy the line above. Turning the chip OFF must emit nothing, and
    // a sibling axis must be unaffected either way.
    expect(chipStateToParams({ categoryKeys: [], no_added_sugar: false }, [])).toEqual({});
    expect(chipStateToParams({ categoryKeys: [], vegan: true }, [])).toEqual({ vegan: true });
    expect(buildChipParams({ no_added_sugar: true })).toEqual({ no_added_sugar: true });
  });

  // The regression assert for the OTHER half of the original card. The home
  // deep-link (`?no_added_sugar=1`) was already fixed by PR #3020 and is
  // asserted here so the round-trip cannot silently regress alongside the /map
  // change. This is explicitly NOT a claim that this PR fixed it.
  it("the home deep-link param round-trips (already correct before this change)", () => {
    expect(homeParamFor("no_added_sugar")).toBe("no_added_sugar");
    expect(buildChipParams({ no_added_sugar: true })).toEqual({ no_added_sugar: true });
  });

  // The absence assertion, in the suite rather than only in a grep.
  // The fix IS the removal of a flag, so the thing worth guarding is that no
  // axis quietly reacquires it. A grep in a PR body cannot fail next month.
  it("no /map axis suppresses its param any more", () => {
    const suppressed = TOGGLE_CHIPS.map((c) => c.key).filter((k) => !mapEmitsParam(k));
    expect(suppressed, `axes still suppressed on /map: ${suppressed.join(", ")}`).toEqual([]);
    // Control: mapEmitsParam must be reading something real. If TOGGLE_CHIPS
    // were empty the filter above would be trivially satisfied.
    expect(TOGGLE_CHIPS.length).toBeGreaterThan(5);
  });

  it("every OTHER /map axis emits its param", () => {
    for (const key of TOGGLE_CHIPS.map((c) => c.key).filter(mapEmitsParam)) {
      expect(chipStateToParams({ categoryKeys: [], [key]: true }, []), key).toEqual({
        [key]: true,
      });
    }
  });
});

describe("MEH-2130 — groups come from one declaration", () => {
  it("a shared axis is filed under the same group on both surfaces", () => {
    for (const key of SHARED_AXIS_KEYS) {
      const onMap = TOGGLE_CHIPS.find((c) => c.key === key);
      const onListing = withChipGroups(PRODUCERS_CHIPS_CONFIG).find((c) => c.key === key);
      expect(onListing.group, `group mismatch for ${key}`).toBe(onMap.group);
      expect(onListing.group).toBe(FILTER_AXES[key].group);
    }
  });

  it("withChipGroups leaves a declared group alone and defaults an undeclared one", () => {
    expect(withChipGroups([{ key: "x", group: "diet" }])[0].group).toBe("diet");
    expect(withChipGroups([{ key: "x" }])[0].group).toBe("service");
  });
});

describe("MEH-2130 — helper self-tests (known inputs, known answers)", () => {
  // Run these before trusting anything above: if the derivation helpers cannot
  // tell a correct input from a broken one, nothing they produced is evidence.
  it("axisKeysFor filters by surface and sorts by the given order", () => {
    // MEH-2131: `open_for_orders_now` is on every surface now, so `grass_fed`
    // (still /map-only) carries the "filters by surface" half of this
    // self-test — asserted in BOTH directions so it proves the filter selects
    // rather than merely returning everything.
    expect(axisKeysFor("map", MAP_CHIP_ORDER)).toContain("grass_fed");
    expect(axisKeysFor("producers", LISTING_CHIP_ORDER)).not.toContain("grass_fed");
    expect(axisKeysFor("home", LISTING_CHIP_ORDER)).not.toContain("grass_fed");
    // Order is honoured: reversing the order array reverses the result.
    const forward = axisKeysFor("map", MAP_CHIP_ORDER);
    const backward = axisKeysFor("map", [...MAP_CHIP_ORDER].reverse());
    expect(backward).toEqual([...forward].reverse());
  });

  it("an unranked key sorts LAST, never first (the indexOf → -1 trap)", () => {
    // MEH-1862 shipped this bug in FilterSheet: a bare indexOf returns -1 for an
    // unknown key, and -1 sorts BEFORE 0, so the untracked chip jumped to the
    // front of its group. Asserted directly on a partial order array.
    const partial = ["verified"]; // every other /map axis is unranked
    expect(axisKeysFor("map", partial)[0]).toBe("verified");
  });

  it("chipsForKeys returns the chip shape and nothing more", () => {
    const [chip] = chipsForKeys(["vegan"]);
    expect(Object.keys(chip).sort()).toEqual(
      ["evidence", "group", "key", "label", "scope", "subtext"].sort(),
    );
    // Wiring stays off the chip — a renderer receives presentation, not routing.
    expect(chip.surfaces).toBeUndefined();
    expect(chip.homeParam).toBeUndefined();
    expect(chip.mapParam).toBeUndefined();
    expect(typeof chip.label).toBe("string"); // MEH-1507: never an object
  });

  it("defaultsForKeys returns false for each key and nothing else", () => {
    expect(defaultsForKeys(["a", "b"])).toEqual({ a: false, b: false });
    expect(defaultsForKeys([])).toEqual({});
  });
});
