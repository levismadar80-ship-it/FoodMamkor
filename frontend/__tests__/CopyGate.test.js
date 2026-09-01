/**
 * Self-test for e2e/visual/copy-gate.ts (MEH-1765).
 *
 * Exercises the REAL resolver, never a copy of it — a second copy is free to
 * drift from the one that matters (.claude/rules/testing.md).
 *
 * RUN THIS FIRST, mentally: if the resolver cannot tell a correct key from a
 * broken one, nothing parity.spec.ts reports afterwards is worth reading. The
 * synthetic cases below cover the edges; the LAST block anchors to the real
 * frontend/messages/he.json, because synthetic fixtures only prove the probe
 * works on shapes I invented (MEH-1909 — an ast probe passed four synthetic
 * cases and returned None for all 14 real files, because the repo uses a shape
 * no fixture had).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { resolveCopy, isFormattedMessage, copyTarget } from "../e2e/visual/copy-gate";

const TREE = {
  home: {
    hero: {
      title: "אוכל מקומי, במקום אחד",
      chips_prefix: "פופולרי עכשיו:",
      empty: "   ",
      count: 3,
      list: ["a", "b"],
    },
  },
  group_buys: {
    delivery: {
      show_all_cities:
        "{count, plural, one {הצג עיר נוספת} other {הצג עוד {count} ערים}}",
    },
  },
};

describe("resolveCopy — the four outcomes are distinguishable", () => {
  it("resolves a present string", () => {
    expect(resolveCopy(TREE, "home.hero.title")).toEqual({
      ok: true,
      value: "אוכל מקומי, במקום אחד",
    });
  });

  it("reports an absent key, naming the segment that failed", () => {
    const r = resolveCopy(TREE, "home.hero.subtitle");
    expect(r.ok).toBe(false);
    // The message must name the path, not just say "missing" — a red run that
    // does not say WHICH key is a red run someone re-derives by hand.
    expect(r.reason).toContain("home.hero.subtitle");
    expect(r.reason).toContain("absent");
  });

  it("reports a key whose parent is not an object", () => {
    const r = resolveCopy(TREE, "home.hero.title.deeper");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("not an object");
  });

  it("reports a non-string leaf, and says which type", () => {
    expect(resolveCopy(TREE, "home.hero.count").reason).toContain("number");
    expect(resolveCopy(TREE, "home.hero.list").reason).toContain("an array");
  });

  it("reports a whitespace-only string as empty, not as a hit", () => {
    // This is the one that would otherwise pass silently: a blank string
    // resolves fine and then asserts nothing about the page.
    const r = resolveCopy(TREE, "home.hero.empty");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("empty string");
  });

  it("refuses an empty key", () => {
    expect(resolveCopy(TREE, "").ok).toBe(false);
  });
});

describe("isFormattedMessage — ICU messages are not literal assertion targets", () => {
  it("flags a plural message", () => {
    expect(
      isFormattedMessage(TREE.group_buys.delivery.show_all_cities),
    ).toBe(true);
  });

  it("does not flag ordinary copy, including copy containing braces-free punctuation", () => {
    expect(isFormattedMessage("פופולרי עכשיו:")).toBe(false);
    expect(isFormattedMessage("אוכל מקומי, במקום אחד")).toBe(false);
  });

  it("does not flag a simple interpolation — {name} renders literally enough to match", () => {
    expect(isFormattedMessage("שלום {name}")).toBe(false);
  });
});

describe("copyTarget — the decision parity.spec.ts actually consumes", () => {
  it("passes a static string through", () => {
    expect(copyTarget(TREE, "home.hero.chips_prefix")).toEqual({
      ok: true,
      value: "פופולרי עכשיו:",
    });
  });

  it("REFUSES an ICU plural even though the key resolves", () => {
    // The discriminating case for this module. resolveCopy says ok:true here;
    // copyTarget must still say no, because the raw value never appears on
    // screen and a literal assertion on it would be red-for-the-wrong-reason
    // (or, if softened to a substring, green-for-the-wrong-reason).
    expect(resolveCopy(TREE, "group_buys.delivery.show_all_cities").ok).toBe(true);
    const r = copyTarget(TREE, "group_buys.delivery.show_all_cities");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("ICU formatted message");
  });
});

describe("anchored to the real he.json — the shape the repo actually uses", () => {
  const he = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "messages", "he.json"),
      "utf-8",
    ),
  );

  // Every key parity.spec.ts asserts. If one is renamed or deleted, THIS test
  // reds — before the VRT spec does, and with a clearer message.
  const LIVE_KEYS = [
    "home.hero.title",
    "home.hero.chips_prefix",
    "about.consumer.hero.heading",
    "about.consumer.hero.subheading",
    "producer.detail.tabs.about",
  ];

  it.each(LIVE_KEYS)("resolves %s from the committed he.json", (key) => {
    const r = copyTarget(he, key);
    // Print the reason on failure rather than a bare `false`.
    expect(r.ok ? "" : r.reason).toBe("");
    expect(r.ok && r.value.length).toBeGreaterThan(0);
  });

  it("counts the live keys rather than restating a number", () => {
    // Derived, not stated: adding a key above moves this on its own.
    // A literal `expect(5)` would go stale the moment the list changes.
    const resolved = LIVE_KEYS.filter((k) => copyTarget(he, k).ok);
    expect(resolved).toHaveLength(LIVE_KEYS.length);
  });

  it("still refuses the real ICU plurals in he.json", () => {
    // MEH-1908's three show_all_* keys are real, live, and NOT usable as
    // literal targets. Anchored here so the refusal is proven against the
    // repo's own data and not only against my fixture.
    for (const key of [
      "group_buys.delivery.show_all_cities",
      "group_buys.delivery.show_all_pickup",
      "group_buys.delivery.show_all_areas",
    ]) {
      expect(resolveCopy(he, key).ok).toBe(true);
      expect(copyTarget(he, key).ok).toBe(false);
    }
  });
});
