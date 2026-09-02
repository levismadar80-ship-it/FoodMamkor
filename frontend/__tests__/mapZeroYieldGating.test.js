// MEH-2170 — the five diet toggles on /map are gated from the ONE-TIME mount
// snapshot, never from the reloaded feed. Pure-function tests on the real
// lib/map-chips.js; the two "stability" cases are the unit-level shape of
// the spec's two assertions (same set after a toggle, same set after a
// geo-search), because both of those change what the FEED holds and neither
// changes the snapshot.
import { describe, it, expect } from "vitest";
import {
  DIET_GATED_KEYS,
  TOGGLE_CHIPS,
  visibleMapToggleChips,
} from "@/lib/map-chips";
import { DIET_CHIP_MIN } from "@/lib/producer-filters";

const keys = (chips) => chips.map((c) => c.key);
const nonDiet = keys(TOGGLE_CHIPS).filter((k) => !DIET_GATED_KEYS.includes(k));

function producers({ vegan = 0, vegetarian = 0, gluten_free = 0, lactose_free = 0, no_added_sugar = 0 } = {}) {
  const out = [];
  const push = (field, n) => {
    for (let i = 0; i < n; i += 1) out.push({ id: `${field}-${i}`, [field]: true });
  };
  push("has_vegan_products", vegan);
  push("has_vegetarian_products", vegetarian);
  push("has_gluten_free_products", gluten_free);
  push("has_lactose_free_products", lactose_free);
  push("has_no_added_sugar_products", no_added_sugar);
  return out;
}

describe("MEH-2170 — visibleMapToggleChips", () => {
  it("gates exactly the five diet axes and nothing else", () => {
    expect(DIET_GATED_KEYS).toEqual([
      "vegan",
      "vegetarian",
      "gluten_free",
      "lactose_free",
      "no_added_sugar",
    ]);
    // Every gated key is a real /map chip — a typo here would gate nothing.
    for (const k of DIET_GATED_KEYS) expect(keys(TOGGLE_CHIPS)).toContain(k);
  });

  it("no snapshot yet → every chip renders (unknown is not zero)", () => {
    expect(keys(visibleMapToggleChips({ catalogSnapshot: null }))).toEqual(keys(TOGGLE_CHIPS));
    expect(keys(visibleMapToggleChips({ catalogSnapshot: undefined }))).toEqual(keys(TOGGLE_CHIPS));
  });

  it("an empty catalog hides all five diet chips and keeps every other chip", () => {
    const visible = keys(visibleMapToggleChips({ catalogSnapshot: [] }));
    for (const k of DIET_GATED_KEYS) expect(visible).not.toContain(k);
    expect(visible).toEqual(nonDiet);
  });

  it("the threshold is DIET_CHIP_MIN, inclusive — one below hides, at it shows", () => {
    const below = keys(visibleMapToggleChips({ catalogSnapshot: producers({ vegan: DIET_CHIP_MIN - 1 }) }));
    expect(below).not.toContain("vegan");
    const at = keys(visibleMapToggleChips({ catalogSnapshot: producers({ vegan: DIET_CHIP_MIN }) }));
    expect(at).toContain("vegan");
    // and the other four stay hidden — the count is per axis, not pooled
    for (const k of DIET_GATED_KEYS.filter((x) => x !== "vegan")) expect(at).not.toContain(k);
  });

  it("the staging catalog of 02/09 (0·0·1·0·0) hides all five", () => {
    const visible = keys(visibleMapToggleChips({ catalogSnapshot: producers({ gluten_free: 1 }) }));
    for (const k of DIET_GATED_KEYS) expect(visible).not.toContain(k);
  });

  it("an active diet axis is never hidden — the deep-link carve-out", () => {
    const visible = keys(
      visibleMapToggleChips({ catalogSnapshot: [], chipState: { no_added_sugar: true } }),
    );
    expect(visible).toContain("no_added_sugar");
    expect(visible).not.toContain("vegan");
  });

  it("STABILITY after a toggle: same snapshot, a non-diet chip flips → same diet set", () => {
    const snap = producers({ vegan: DIET_CHIP_MIN, vegetarian: 2 });
    const before = keys(visibleMapToggleChips({ catalogSnapshot: snap, chipState: {} }));
    const after = keys(visibleMapToggleChips({ catalogSnapshot: snap, chipState: { kosher: true } }));
    expect(after).toEqual(before);
  });

  it("geo-search cannot corrupt the offered set — pure-function control (the React-state half lives in e2e/flows/05)", () => {
    // This file only sees the pure gate: it cannot observe whether
    // useProducersFeed keeps `catalogSnapshot` untouched across a viewport
    // refetch — that is what the E2E toggle step in 05-map-navigation proves.
    // What THIS case pins is the discriminating half: the gate's answer is a
    // function of the snapshot alone, and a viewport-sized feed fed to it in
    // the snapshot's place would drop vegan. If the gate ever grows a second
    // input (a feed, a count from elsewhere), the control below stops holding.
    const snap = producers({ vegan: DIET_CHIP_MIN });
    const viewportFeed = snap.slice(0, 1); // what «חפשי באזור זה» would leave in allProducers
    expect(keys(visibleMapToggleChips({ catalogSnapshot: snap }))).toContain("vegan");
    // Control: had the gate read the FEED, vegan would vanish here.
    expect(keys(visibleMapToggleChips({ catalogSnapshot: viewportFeed }))).not.toContain("vegan");
  });

  it("returns the same chip objects (identity), so FilterSheet's group/label wiring is untouched", () => {
    const visible = visibleMapToggleChips({ catalogSnapshot: producers({ vegan: DIET_CHIP_MIN }) });
    for (const chip of visible) expect(TOGGLE_CHIPS).toContain(chip);
  });
});
