/**
 * Module:   MapPaneTopSlot.test
 * Purpose:  Lock the MEH-2148 top-centre slot. The search-area pill and the
 *           pickup-layer notice were each their own absolute top-4 z-1000
 *           box, so at 375px they drew on top of each other. The fix is
 *           STRUCTURAL -- one flex column owns the slot. The notice left with
 *           the pickup-layer toggle (Sapir 13/11); the column stays so a
 *           future top-centre element is a child here, not another absolute.
 *
 * Does NOT: assert "they do not overlap" by geometry. THAT ASSERTION WOULD BE
 *           VACUOUS HERE. jsdom does no layout: every getBoundingClientRect is
 *           0x0, and two zero-size boxes never intersect, so an overlap check
 *           would pass identically against the broken two-absolutes version.
 *           That is not hypothetical -- the browser harness for this PR
 *           reported four confident PASS lines against exactly that shape
 *           before its control was tightened to require a non-zero box.
 *           Geometry is measured in a real browser instead (0px^2 intersection,
 *           8px gap, chromium + webkit); the numbers are in the PR body. What
 *           jsdom CAN answer is whether the two elements are siblings in one
 *           container, and that is the property that makes the overlap
 *           impossible rather than merely absent on one viewport.
 * Related:  frontend/app/[locale]/map/components/MapPane.jsx
 * History:  MEH-2148; 13/11 pickup-layer toggle removed.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import MapPane from "@/app/[locale]/map/components/MapPane";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

// The Leaflet canvas is irrelevant here and refuses to mount in jsdom.
vi.mock("next/dynamic", () => ({
  default: () => function MapComponentStub() {
    return <div data-testid="map-canvas-stub" />;
  },
}));

const base = {
  producers: [],
  onProducerClick: () => {},
  onProducerHover: () => {},
  onBoundsChange: () => {},
  onMapMove: () => {},
  onMapCanvasClick: () => {},
  registerApi: () => {},
  mapRef: { current: null },
  focusedProducerId: null,
  onSearchThisArea: () => {},
  visibleProducers: [{ id: 1 }],
  allProducers: [{ id: 1 }],
  gpsLoading: false,
  onGpsClick: () => {},
  legendOpen: false,
  legendRef: { current: null },
  onLegendToggle: () => {},
};

const pill = () => screen.queryByText("map.pane.search_this_area");
const stackOf = (el) => el.closest("button").parentElement.parentElement;

describe("MEH-2148 — the /map top-centre slot has ONE owner", () => {
  it("CONTROL — the pill renders when the map moved, and not before", () => {
    const moved = render(<MapPane {...base} mapMoved />);
    expect(pill()).not.toBeNull();
    moved.unmount();
    render(<MapPane {...base} mapMoved={false} />);
    expect(pill()).toBeNull();
  });

  it("the pill sits inside the single flex-column stack", () => {
    render(<MapPane {...base} mapMoved />);
    const stack = stackOf(pill());
    // Three separate cues so a partial regression names itself.
    expect(stack.className).toContain("flex-col");
    expect(stack.className).toContain("absolute");
    expect(stack.className).toContain("z-[1000]");
  });

  it("the pill's wrapper carries no absolute positioning of its own", () => {
    render(<MapPane {...base} mapMoved />);
    const wrapper = pill().closest("button").parentElement;
    expect(wrapper.className).not.toContain("absolute");
    expect(wrapper.className).not.toContain("z-[1000]");
  });

  it("the stack is ABSENT from the DOM when nothing renders in it", () => {
    const { container } = render(<MapPane {...base} mapMoved={false} />);
    const strips = [...container.querySelectorAll("div")].filter(
      (d) => d.className.includes("flex-col") && d.className.includes("z-[1000]")
    );
    expect(strips, "an empty full-width strip should not be rendered at all").toHaveLength(0);
  });

  it("the shield idiom survives — container none, child auto", () => {
    // Without this pairing the strip swallows map drags across the whole pane.
    render(<MapPane {...base} mapMoved />);
    expect(stackOf(pill()).className).toContain("pointer-events-none");
    expect(pill().closest("button").parentElement.className).toContain("pointer-events-auto");
  });
});
