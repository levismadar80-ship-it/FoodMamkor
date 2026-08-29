import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TOGGLE_CHIPS, chipStateToParams } from "@/lib/map-chips";
import { defaultsForKeys } from "@/lib/filter-taxonomy";

/**
 * MEH-2131 follow-up — /map's two clear controls must cover EVERY toggle.
 *
 * The CI reviewer caught `clearSheetFilters` omitting `open_for_orders_now`
 * from its hand-written key list, so "ניקוי הכל" in /map's FilterSheet cleared
 * every toggle except the one that ticket had just added. Grepping for the
 * third site — a finding is a sample, not an inventory — found the same defect
 * in `resetAllFilters`, where it is worse: that function REPLACES chipState
 * instead of spreading it, so an omitted key becomes `undefined` rather than
 * merely surviving. Both had also been silently missing `vegetarian`
 * (MEH-1438) and `no_added_sugar` (MEH-1934) since those axes landed, and both
 * still cleared `organic`, removed in MEH-1259.
 *
 * Both are derived now, so the property holds by construction. This suite
 * exists so that reverting either one to a literal fails loudly instead of
 * shipping a control that silently stops covering the newest axis — which is
 * exactly how the defect arrived three times.
 *
 * WHY A SOURCE-TEXT ASSERTION AND NOT A BEHAVIOURAL ONE. Driving these through
 * the real hook needs a rendered /map with its fetch layer, which is a large
 * amount of mocking for a question that is really "does this list enumerate
 * keys by hand". The behaviour that MATTERS — that a cleared state emits no
 * params — is asserted directly below against the real `chipStateToParams`.
 * The source assertion covers the mechanism; the behavioural one covers the
 * outcome. Neither alone would be enough, and the limits of the first are
 * stated rather than left for a reader to discover.
 */

const SRC = readFileSync(
  resolve(process.cwd(), "app/[locale]/map/state/useMapFilters.js"),
  "utf8",
);

const TOGGLE_KEYS = TOGGLE_CHIPS.map((c) => c.key);

describe("MEH-2131 follow-up — /map clear controls cover every toggle", () => {
  it("SELF-TEST: the source file was actually read", () => {
    // Run this first. Every assertion below is a claim about SRC, and a probe
    // that silently read an empty string would report a clean bill of health
    // for all of them (.claude/rules/testing.md — a null that is also the
    // reassuring answer).
    expect(SRC.length).toBeGreaterThan(1000);
    expect(SRC).toContain("clearSheetFilters");
    expect(SRC).toContain("resetAllFilters");
  });

  it("neither clear control enumerates attribute keys by hand", () => {
    // The literal form the three drifting lists shared. Its absence is what
    // makes "covers every toggle" true by construction rather than by someone
    // remembering to append.
    for (const key of TOGGLE_KEYS) {
      expect(SRC, `${key} is enumerated as a literal — derive instead`).not.toContain(
        `${key}: false`,
      );
    }
  });

  it("the long-removed `organic` key is gone from the CODE", () => {
    // Both controls cleared it long after MEH-1259 deleted the chip and its
    // backend filter. Dead weight is the same drift wearing the opposite sign,
    // and a derived list cannot carry it.
    //
    // Asserted against the CODE form, not the word. The first version of this
    // case tested `not.toContain("organic")` and failed — on the comments in
    // this very file explaining the removal. That is the same defect as the
    // `Env drift` gate tripping on a variable name spelled inside the comment
    // that documented removing it: a text scan cannot tell an explanation from
    // a use, so the assertion has to name the shape it actually forbids.
    expect(SRC).not.toContain("organic: false");
    expect(SRC).not.toContain("state.organic");
    expect(SRC).not.toContain("chipState.organic");
  });

  it("all THREE attribute-key sites in this file derive from the taxonomy", () => {
    expect(SRC).toContain("defaultsForKeys(TOGGLE_CHIPS.map((c) => c.key))");
    // THREE, not two: the `chipState` useState default (MEH-2131) plus the two
    // clear controls (this follow-up). The first version of this case asserted
    // 2 and failed — I had counted the sites the reviewer named rather than the
    // sites that exist, which is the same "a finding is a sample, not an
    // inventory" error that made the reviewer's one finding into three.
    //
    // Derived from the string rather than stated as a magic number would be
    // better still, but there is nothing to derive it FROM here — so if a
    // fourth site is ever added, update this number deliberately and say why.
    const occurrences =
      SRC.split("defaultsForKeys(TOGGLE_CHIPS.map((c) => c.key))").length - 1;
    expect(occurrences).toBe(3);
  });

  it("BEHAVIOUR: a fully-cleared state emits no attribute params", () => {
    // The outcome the whole thing is for, asserted against the real builder.
    const cleared = { categoryKeys: [], ...defaultsForKeys(TOGGLE_KEYS) };
    expect(chipStateToParams(cleared, [])).toEqual({});
  });

  it("BEHAVIOUR CONTROL: the same state with one toggle ON does emit", () => {
    // Without this, the assertion above is satisfied by a chipStateToParams
    // that returns {} for everything.
    const cleared = { categoryKeys: [], ...defaultsForKeys(TOGGLE_KEYS) };
    expect(chipStateToParams({ ...cleared, open_for_orders_now: true }, [])).toEqual({
      open_for_orders_now: true,
    });
    expect(chipStateToParams({ ...cleared, vegetarian: true }, [])).toEqual({
      vegetarian: true,
    });
  });

  it("the cleared state covers every toggle key, with none left undefined", () => {
    // resetAllFilters REPLACES chipState, so a missing key becomes `undefined`
    // — the `!undefined` toggling state MEH-1075 wrote those literals to kill.
    const cleared = defaultsForKeys(TOGGLE_KEYS);
    for (const key of TOGGLE_KEYS) {
      expect(cleared[key], `${key} missing from the cleared state`).toBe(false);
    }
    expect(Object.keys(cleared).sort()).toEqual([...TOGGLE_KEYS].sort());
  });
});
