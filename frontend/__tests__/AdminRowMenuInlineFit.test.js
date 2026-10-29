/**
 * MEH-2587 — the admin row kebab must not open past the side of the screen.
 *
 * Pure-function tests for the same reason as AdminRowMenuViewportFit.test.js:
 * jsdom reports every rect as zeros, so a component test would pass against the
 * broken and the fixed menu alike.
 *
 * The phone case is read off Sapir's iPhone screenshot (29/10, /admin/users,
 * stacked cards, RTL, 440 CSS px wide): the kebab sits mid-card, and the old
 * code set `inset-inline-end` (= `left` in RTL) to the trigger's left edge, so
 * the 160px panel started at ~327 and ended at ~487, 47px past the edge — only
 * «…לאדמין» was visible. The 375 numbers below are the same geometry.
 *
 * DISCRIMINATION (MEH-1619): against the pre-fix behaviour (return `preferred`
 * unchanged) 3 of 4 go red; only the desktop case stays green,
 * because the old code was right there.
 */

import { describe, it, expect } from "vitest";
import { computeMenuInlineEnd, MENU_PAD_PX } from "@/lib/panel-position";

const VW = 375;
const PANEL = 160; // min-w-[10rem]

describe("computeMenuInlineEnd — inline viewport fit", () => {
  it("keeps the trigger-aligned position when the panel fits (desktop table)", () => {
    // Actions column at the far end: trigger left = 40 in RTL.
    expect(computeMenuInlineEnd(40, PANEL, 1440)).toBe(40);
  });

  it("pulls a mid-card phone panel back inside the screen (RTL, the screenshot case)", () => {
    const end = computeMenuInlineEnd(327, PANEL, 440);
    expect(end + PANEL).toBeLessThanOrEqual(440 - MENU_PAD_PX);
    expect(end).toBe(440 - PANEL - MENU_PAD_PX);
  });

  it("never lets any on-screen trigger produce an off-screen panel", () => {
    for (let preferred = -20; preferred <= VW + 20; preferred += 1) {
      const end = computeMenuInlineEnd(preferred, PANEL, VW);
      expect(end).toBeGreaterThanOrEqual(MENU_PAD_PX);
      expect(end + PANEL).toBeLessThanOrEqual(VW - MENU_PAD_PX);
    }
  });

  it("pins a panel wider than the screen to the near edge instead of inverting", () => {
    expect(computeMenuInlineEnd(100, 400, VW)).toBe(MENU_PAD_PX);
  });
});
