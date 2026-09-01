/**
 * MEH-2230 — the admin row kebab must not open below the fold.
 *
 * WHY THESE ARE PURE-FUNCTION TESTS AND NOT A COMPONENT TEST: jsdom has no
 * layout engine, so every `getBoundingClientRect()` it returns is all-zeros.
 * A render-and-assert test of AdminRowMenu would therefore pass identically
 * against the broken and the fixed component — the exact "green with two
 * possible causes" shape `.claude/rules/testing.md` warns about. The geometry
 * was extracted to `lib/panel-position.js` so it can be tested for real.
 *
 * The numbers below are MEASURED, not invented: Chromium at 375x812 driving
 * the real /he/admin/producers page (harness:
 * e2e/qa-meh2230-admin-kebab-viewport.mjs).
 *
 *   viewport 812 · panel height 154 · gap 4
 *   first row : trigger top=705 bottom=731 -> old top 735, bottom 889 (+77 over)
 *   last row  : trigger top=2085 bottom=2111 -> old top 2115 (+1457 over)
 *
 * DISCRIMINATION (MEH-1619): run against the pre-fix formula
 * (`return triggerRect.bottom + gap`) these go red — 2 failed / 5 passed, and
 * the two that fail are exactly the viewport-fit ones. Against the shipped
 * implementation, 7 pass. Both runs are pasted in the PR body.
 */

import { describe, it, expect } from "vitest";
import { clamp, computeMenuTop, MENU_GAP_PX, MENU_PAD_PX } from "@/lib/panel-position";

const VH = 812;
const PANEL = 154;

describe("computeMenuTop — viewport fit", () => {
  it("keeps the panel below the trigger when there is room", () => {
    // A trigger high on the page: 100 + 4 + 154 = 258, well inside 812.
    const top = computeMenuTop({ top: 74, bottom: 100 }, PANEL, VH);
    expect(top).toBe(100 + MENU_GAP_PX);
  });

  it("flips above the trigger when the panel would cross the bottom edge", () => {
    // The MEASURED first-row case. Old behaviour returned 735 (bottom 889).
    const top = computeMenuTop({ top: 705, bottom: 731 }, PANEL, VH);
    expect(top).toBe(705 - MENU_GAP_PX - PANEL); // 547
    expect(top + PANEL).toBeLessThanOrEqual(VH - MENU_PAD_PX);
  });

  it("never lets an on-screen trigger produce an off-screen panel", () => {
    // The property, swept across every trigger position in the viewport —
    // one case cannot be satisfied by a special-case branch.
    for (let bottom = 26; bottom <= VH; bottom += 1) {
      const top = computeMenuTop({ top: bottom - 26, bottom }, PANEL, VH);
      expect(top).toBeGreaterThanOrEqual(MENU_PAD_PX);
      expect(top + PANEL).toBeLessThanOrEqual(VH - MENU_PAD_PX);
    }
  });

  it("pins inside the viewport when the panel fits on neither side", () => {
    // Panel taller than the space above AND below — degrade to pinned, not
    // to an inverted clamp.
    const tall = VH - 20;
    const top = computeMenuTop({ top: 400, bottom: 426 }, tall, VH);
    expect(top).toBeGreaterThanOrEqual(MENU_PAD_PX);
    expect(top).toBeLessThanOrEqual(VH);
  });

  it("respects a caller-supplied gap and pad", () => {
    const top = computeMenuTop({ top: 74, bottom: 100 }, PANEL, VH, 12, 20);
    expect(top).toBe(112);
  });
});

describe("clamp — the shared primitive Popover already owned", () => {
  it("clamps into range", () => {
    expect(clamp(0, 5, 10)).toBe(5);
    expect(clamp(0, -5, 10)).toBe(0);
    expect(clamp(0, 50, 10)).toBe(10);
  });

  it("floors max at min so an oversized panel pins instead of inverting", () => {
    // max < min — without the floor this would return the smaller of the two
    // and place the panel ABOVE the top edge.
    expect(clamp(8, 100, -50)).toBe(8);
  });
});
