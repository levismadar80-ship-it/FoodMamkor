/**
 * Module:   MapSheetGesture.test
 * Purpose:  Lock the MEH-2148 gesture arbiter. `sheetClaimsGesture` decides, per
 *           touch, whether the /map bottom sheet drags or the list scrolls. It
 *           is pure precisely so this decision is testable without a touch
 *           device — jsdom cannot deliver a real swipe, and the bug was never
 *           in the maths, it was in there being no decision at all.
 * Does NOT: test the listener wiring (non-passive registration, the 4px slop,
 *           preventDefault). Those are asserted from the source in the last
 *           block, and observed for real in the WebKit + Chromium harness runs
 *           linked from the PR — a synthetic TouchEvent in jsdom would prove
 *           nothing about either.
 * Related:  frontend/components/MapBottomSheet.jsx
 * History:  MEH-2148.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { sheetClaimsGesture, PEEK, HALF } from "@/components/MapBottomSheet";

const UP = 40;    // startY - clientY > 0  => finger moved UP
const DOWN = -40; // finger moved DOWN

describe("MEH-2148 — sheetClaimsGesture", () => {
  it("1. handle/header drag: a touch that did not start in the scroller always claims", () => {
    // Both directions, both snaps — there is nothing else the chrome could do.
    expect(sheetClaimsGesture({ startedInScroller: false, scrollTopAtStart: 0, dy: DOWN, snap: HALF })).toBe(true);
    expect(sheetClaimsGesture({ startedInScroller: false, scrollTopAtStart: 0, dy: UP, snap: PEEK })).toBe(true);
    // scrollTop is irrelevant here and must not leak into the decision.
    expect(sheetClaimsGesture({ startedInScroller: false, scrollTopAtStart: 900, dy: DOWN, snap: HALF })).toBe(true);
  });

  it("2. peek expand: upward inside the scroller AT PEEK claims", () => {
    expect(sheetClaimsGesture({ startedInScroller: true, scrollTopAtStart: 0, dy: UP, snap: PEEK })).toBe(true);
  });

  it("3. top collapse: downward inside the scroller with the list AT THE TOP claims", () => {
    expect(sheetClaimsGesture({ startedInScroller: true, scrollTopAtStart: 0, dy: DOWN, snap: HALF })).toBe(true);
  });

  it("4. mid-scroll: downward inside the scroller when already scrolled does NOT claim", () => {
    // THE REPORTED BUG. Pre-MEH-2148 there was no arbiter, so this gesture
    // dragged the sheet to PEEK while the user was trying to read further down.
    expect(sheetClaimsGesture({ startedInScroller: true, scrollTopAtStart: 120, dy: DOWN, snap: HALF })).toBe(false);
  });

  it("5. upward inside the scroller above PEEK does NOT claim — that is a plain scroll", () => {
    expect(sheetClaimsGesture({ startedInScroller: true, scrollTopAtStart: 0, dy: UP, snap: HALF })).toBe(false);
    expect(sheetClaimsGesture({ startedInScroller: true, scrollTopAtStart: 300, dy: UP, snap: HALF })).toBe(false);
  });

  it("CONTROL — the arbiter is not constant in either direction", () => {
    // Every `toBe(true)` above passes against `() => true`, and every
    // `toBe(false)` against `() => false`. Only holding both at once says the
    // function discriminates. Read this line first if the file goes red.
    const verdicts = [
      sheetClaimsGesture({ startedInScroller: false, scrollTopAtStart: 0, dy: UP, snap: HALF }),
      sheetClaimsGesture({ startedInScroller: true, scrollTopAtStart: 120, dy: DOWN, snap: HALF }),
    ];
    expect(verdicts).toEqual([true, false]);
  });

  it("PEEK and HALF are distinct, so case 2 is not vacuous", () => {
    // If these ever collapsed to one value, `snap === PEEK` would be true for
    // every sheet state and case 5 would silently start claiming.
    expect(PEEK).not.toBe(HALF);
  });
});

describe("MEH-2148 — the wiring the arbiter depends on", () => {
  // Source assertions, not behaviour. Each names one thing that would make the
  // pure function above correct and the component still broken -- exactly the
  // "the guard is right and its argument is wrong" shape this repo has hit.
  const SRC = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "components", "MapBottomSheet.jsx"),
    "utf8"
  );

  it("CONTROL — the source was actually read", () => {
    expect(SRC.length).toBeGreaterThan(1000);
    expect(SRC).toContain("export default function MapBottomSheet");
  });

  it("touchmove is registered NON-passive", () => {
    // preventDefault() is ignored inside a passive listener, so the arbiter
    // would decide correctly and then fail to suppress the native scroll.
    expect(SRC).toContain('el.addEventListener("touchmove", onTouchMove, { passive: false })');
  });

  it("the scroller contains the overscroll chain", () => {
    expect(SRC).toContain("overscroll-y-contain");
  });

  it("the scroller carries contentRef", () => {
    // Without the ref, `startedInScroller` is always false and EVERY touch
    // claims -- the pre-MEH-2148 behaviour, with the arbiter present and inert.
    expect(SRC).toContain("ref={contentRef}");
  });
});
