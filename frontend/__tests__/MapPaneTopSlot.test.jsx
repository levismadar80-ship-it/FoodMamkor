/**
 * Module:   MapPaneTopSlot.test
 * Purpose:  Lock the MEH-2148 top-centre slot. The search-area pill and the
 *           pickup-layer notice were each their own `absolute top-4 z-[1000]`,
 *           so at 375px they shared a y and drew on top of each other. The fix
 *           is STRUCTURAL -- one flex column owns the slot -- and this asserts
 *           that structure holds in the state where the collision happened:
 *           `mapMoved` AND `secondaryHidden` both true.
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
 * History:  MEH-2148.
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
  visitedIds: new Set(),
  showSecondaryLayer: false,
  onToggleSecondaryLayer: () => {},
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

const NOTICE = "pickup-layer-hidden-notice";
const pill = () => screen.queryByText("map.pane.search_this_area");

describe("MEH-2148 — the /map top-centre slot has ONE owner", () => {
  it("CONTROL — each overlay renders on its own, so the pair test is not vacuous", () => {
    const only = render(<MapPane {...base} mapMoved secondaryHidden={false} />);
    expect(pill()).not.toBeNull();
    expect(screen.queryByTestId(NOTICE)).toBeNull();
    only.unmount();

    render(<MapPane {...base} mapMoved={false} secondaryHidden />);
    expect(screen.queryByTestId(NOTICE)).not.toBeNull();
    expect(pill()).toBeNull();
  });

  it("THE COLLISION STATE — both render, as siblings inside ONE container", () => {
    render(<MapPane {...base} mapMoved secondaryHidden />);

    const notice = screen.getByTestId(NOTICE);
    const pillButton = pill().closest("button");
    expect(pillButton).not.toBeNull();

    // The pill sits in a `pointer-events-auto` wrapper; the notice IS that
    // wrapper. Their common ancestor must be the single stack, which is what
    // replaced the two independent `absolute` boxes.
    const stack = notice.parentElement;
    expect(pillButton.closest("div").parentElement).toBe(stack);

    // And that container is the flex column. Asserted as three separate cues
    // rather than one string match, so a partial regression names itself.
    expect(stack.className).toContain("flex-col");
    expect(stack.className).toContain("absolute");
    expect(stack.className).toContain("z-[1000]");
  });

  it("neither child carries its own absolute positioning any more", () => {
    // This is the assertion that fails against the pre-MEH-2148 component:
    // there, each child WAS `absolute top-4 z-[1000]` and owned its own anchor.
    render(<MapPane {...base} mapMoved secondaryHidden />);
    const notice = screen.getByTestId(NOTICE);
    const pillWrapper = pill().closest("button").parentElement;

    for (const [name, el] of [["notice", notice], ["pill wrapper", pillWrapper]]) {
      expect(el.className, `${name} must not re-acquire its own anchor`).not.toContain("absolute");
      expect(el.className, `${name} must not re-acquire its own z-index`).not.toContain("z-[1000]");
    }
  });

  it("the stack is ABSENT from the DOM when neither child renders", () => {
    const { container } = render(<MapPane {...base} mapMoved={false} secondaryHidden={false} />);
    const strips = [...container.querySelectorAll("div")].filter(
      (d) => d.className.includes("flex-col") && d.className.includes("z-[1000]")
    );
    expect(strips, "an empty full-width strip should not be rendered at all").toHaveLength(0);
  });

  it("the shield idiom survives — container none, children auto", () => {
    // Without this pairing the strip swallows map drags across the whole pane,
    // which would be a worse bug than the overlap it replaced.
    render(<MapPane {...base} mapMoved secondaryHidden />);
    const notice = screen.getByTestId(NOTICE);
    const stack = notice.parentElement;
    expect(stack.className).toContain("pointer-events-none");
    expect(notice.className).toContain("pointer-events-auto");
    expect(pill().closest("button").parentElement.className).toContain("pointer-events-auto");
  });
});
