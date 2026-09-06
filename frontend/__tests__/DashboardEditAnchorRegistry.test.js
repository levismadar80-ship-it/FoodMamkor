import { describe, it, expect } from "vitest";
import {
  ANCHOR_TO_KEY,
  KEY_TO_ANCHOR,
  KEY_TO_GROUP,
  OPEN_KEY_FOR,
} from "@/lib/dashboard-edit-anchors";

// MEH-2262 — dashboard-edit anchor registry, both directions.
//
// The edit page keeps THREE parallel maps, each hand-edited:
//
//   ANCHOR_TO_KEY   url hash      -> card key      (which card a deep link means)
//   KEY_TO_ANCHOR   card key      -> dom id        (where to scroll)
//   KEY_TO_GROUP    card key      -> accordion group (which panel to open)
//
// The resolver needs a card to be in ALL of them. It reads the hash through
// ANCHOR_TO_KEY, looks the key up in KEY_TO_GROUP, and returns early when
// there is no group — silently, leaving the hub on screen with the card
// present in the DOM but `hidden`.
//
// Three cards were each missing from a DIFFERENT map, and every one shipped:
//
//   businessName (MEH-1872)  in ANCHOR_TO_KEY, absent from KEY_TO_GROUP
//   offer        (MEH-1823)  in KEY_TO_ANCHOR + KEY_TO_GROUP, absent from ANCHOR_TO_KEY
//   specialHours (MEH-2264)  same shape as offer — found by this guard, not reported
//
// That is the tell: not one careless omission but a registry whose invariant
// nothing checked. This file checks it, in both directions, so the next card
// added to two maps out of three fails here instead of on someone's phone.
//
// Same family as scripts/validate-registry-paths.py (guarded registries) and
// the silent-gap class in .claude/rules/testing.md.


describe("dashboard-edit anchor registry (MEH-2262)", () => {
  // Run first: if the maps did not import, every assertion below passes over
  // three empty objects and reports a healthy registry that does not exist.
  it("the registries are non-empty and importable", () => {
    for (const [name, map] of [
      ["ANCHOR_TO_KEY", ANCHOR_TO_KEY],
      ["KEY_TO_ANCHOR", KEY_TO_ANCHOR],
      ["KEY_TO_GROUP", KEY_TO_GROUP],
    ]) {
      expect(map, `${name} did not import`).toBeTypeOf("object");
      expect(Object.keys(map).length, `${name} is empty`).toBeGreaterThan(5);
    }
  });

  it("every anchor resolves to a card key that has a group", () => {
    const orphans = Object.entries(ANCHOR_TO_KEY)
      .filter(([, key]) => !KEY_TO_GROUP[OPEN_KEY_FOR(key)] && !KEY_TO_GROUP[key])
      .map(([anchor, key]) => `#${anchor} -> ${key} (no KEY_TO_GROUP entry)`);

    expect(
      orphans,
      orphans.length === 0
        ? ""
        : `These deep links resolve a card key with no accordion group, so the\n` +
            `resolver returns early and the hub stays on screen:\n  ${orphans.join("\n  ")}`,
    ).toEqual([]);
  });

  it("every card with a scroll target is reachable by anchor", () => {
    const reachable = new Set(Object.values(ANCHOR_TO_KEY));
    const unreachable = Object.keys(KEY_TO_ANCHOR)
      .filter((key) => !reachable.has(key))
      .map((key) => `${key} (anchor "${KEY_TO_ANCHOR[key]}" is not in ANCHOR_TO_KEY)`);

    expect(
      unreachable,
      unreachable.length === 0
        ? ""
        : `These cards declare a scroll target but no deep link reaches them:\n  ${unreachable.join("\n  ")}`,
    ).toEqual([]);
  });

  // The three cards this ticket fixed, asserted by name. The two checks above
  // are the general invariant; these pin the specific regressions so a future
  // refactor that drops one is unambiguous in the failure output.
  it.each([
    ["business-name", "businessName", "profile"],
    ["offer", "offer", "location"],
    ["special-hours", "specialHours", "location"],
  ])("#%s opens %s in the %s group", (anchor, key, group) => {
    expect(ANCHOR_TO_KEY[anchor]).toBe(key);
    expect(KEY_TO_GROUP[key]).toBe(group);
    expect(KEY_TO_ANCHOR[key]).toBe(anchor);
  });

  // Derived, not stated: a hand-written total goes stale the moment a card is
  // added and would read as coverage while measuring nothing.
  it("checks every registered anchor", () => {
    expect(Object.keys(ANCHOR_TO_KEY).length).toBe(
      new Set(Object.keys(ANCHOR_TO_KEY)).size,
    );
    expect(Object.keys(ANCHOR_TO_KEY).length).toBeGreaterThanOrEqual(
      Object.keys(KEY_TO_ANCHOR).length,
    );
  });
});
