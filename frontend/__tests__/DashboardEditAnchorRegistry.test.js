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
      .filter(
        ([, key]) => !KEY_TO_GROUP[OPEN_KEY_FOR(key)] && !KEY_TO_GROUP[key],
      )
      .map(([anchor, key]) => `#${anchor} -> ${key} (no KEY_TO_GROUP entry)`);

    expect(
      orphans,
      orphans.length === 0
        ? ""
        : `These deep links resolve a card key with no accordion group, so the\n` +
            `resolver returns early and the hub stays on screen:\n  ${orphans.join("\n  ")}`,
    ).toEqual([]);
  });

  // The third direction, and the one the first version of this file missed:
  // the two checks above cover anchor→group and scroll-target→anchor, so a key
  // that has an anchor entry and a group but NO scroll target slips between
  // them. That is exactly what ownerStory was — the deep link opened the card
  // and then scrolled nowhere, because getElementById(undefined) returns null
  // and the optional chain swallowed it.
  it("every anchor's card key also has a scroll target", () => {
    const noTarget = Object.entries(ANCHOR_TO_KEY)
      .filter(
        ([, key]) => !KEY_TO_ANCHOR[key] && !KEY_TO_ANCHOR[OPEN_KEY_FOR(key)],
      )
      .map(([anchor, key]) => `#${anchor} -> ${key} (no KEY_TO_ANCHOR entry)`);

    expect(
      noTarget,
      noTarget.length === 0
        ? ""
        : `These deep links open their card and then scroll nowhere —\n` +
            `getElementById(undefined) is null and the optional chain hides it:\n  ` +
            noTarget.join("\n  "),
    ).toEqual([]);
  });

  it("every card with a scroll target is reachable by anchor", () => {
    const reachable = new Set(Object.values(ANCHOR_TO_KEY));
    const unreachable = Object.keys(KEY_TO_ANCHOR)
      .filter((key) => !reachable.has(key))
      .map(
        (key) =>
          `${key} (anchor "${KEY_TO_ANCHOR[key]}" is not in ANCHOR_TO_KEY)`,
      );

    expect(
      unreachable,
      unreachable.length === 0
        ? ""
        : `These cards declare a scroll target but no deep link reaches them:\n  ${unreachable.join("\n  ")}`,
    ).toEqual([]);
  });

  // The four cards this ticket fixed, asserted by name. The checks above are
  // the general invariant; these pin the specific regressions so a future
  // refactor that drops one is unambiguous in the failure output.
  it.each([
    ["business-name", "businessName", "profile"],
    ["offer", "offer", "location"],
    ["special-hours", "specialHours", "location"],
    // The fourth belongs here for the same reason as the other three: the
    // general invariants above already cover it, and the point of naming a
    // card is that a future refactor which drops it says WHICH card in the
    // failure output.
    ["owner-story", "ownerStory", "profile"],
  ])("#%s opens %s in the %s group", (anchor, key, group) => {
    expect(ANCHOR_TO_KEY[anchor]).toBe(key);
    expect(KEY_TO_GROUP[key]).toBe(group);
    expect(KEY_TO_ANCHOR[key]).toBe(anchor);
  });

  // NOTHING REPLACES THE TEST THAT USED TO SIT HERE, and that is the point.
  // It read
  //   expect(Object.keys(X).length).toBe(new Set(Object.keys(X)).size)
  // which is true for every object in the language — a duplicate key
  // overwrites silently and never appears twice in Object.keys — so it could
  // not fail. Deleted rather than reworded, per .claude/rules/testing.md
  // ("delete it rather than reformulate it, because the reformulation tends
  // to be entailed too").
  //
  // The obvious reformulation was tried and is WRONG: asserting that no two
  // anchors resolve to the same card key goes red on the live registry,
  // because the MEH-1106 alias anchors (#profile-contact, #profile-categories,
  // #profile-images, #profile-products) deliberately share a card with their
  // canonical anchors. Distinctness is not an invariant here; the two
  // reachability directions above are.
});
