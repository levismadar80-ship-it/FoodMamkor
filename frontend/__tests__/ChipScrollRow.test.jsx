import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ChipScrollRow from "@/components/ChipScrollRow";

// MEH-1340 made the edge fades DYNAMIC (a side fades only while content is
// hidden past it). MEH-1572 changed how they are DRAWN and who decides:
//   - drawn as a `mask-image` on the scroller, not two painted gradient divs,
//     so the fade is transparent and needs no per-caller `fadeBg` colour;
//   - decided by useScrollAffordance's scroll+RO math — the ONE authority
//     that also drives the arrows and the conditional end spacer. The
//     IntersectionObserver sentinels are gone.
// These suites therefore drive scroll GEOMETRY (as the arrow suite below
// already did) and assert on the mask's stop positions.

vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));

const CHIPS = [
  { key: "all", label: "כל" },
  { key: "bread", label: "לחמים ואפייה" },
  { key: "meat", label: "בשר ודגים" },
];

// MEH-1572 fade depths, mirrored from the component.
const START_FADE_PX = 12;
const END_FADE_PX = 48;

function getScroller(container) {
  return container.querySelector("div.overflow-x-auto");
}

// The mask is the single source of fade truth now. The gradient lives in
// globals.css (.chip-scroll-fade-mask); the component publishes only the two
// stop depths as custom properties. A side with nothing hidden past it
// publishes 0px (= no fade).
function fadeStops(container) {
  const { style } = getScroller(container);
  return {
    start: Number.parseInt(style.getPropertyValue("--chip-fade-start"), 10),
    end: Number.parseInt(style.getPropertyValue("--chip-fade-end"), 10),
  };
}

// Give the scroller real geometry (jsdom defaults everything to 0) and fire a
// scroll event so the hook recomputes. RTL: scrollLeft is 0 at the inline
// start and grows NEGATIVE toward the inline end.
function setScrollGeometry(container, { scrollWidth, clientWidth, scrollLeft }) {
  const scroller = getScroller(container);
  Object.defineProperty(scroller, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(scroller, "clientWidth", { value: clientWidth, configurable: true });
  Object.defineProperty(scroller, "scrollLeft", {
    value: scrollLeft,
    configurable: true,
    writable: true,
  });
  fireEvent.scroll(scroller);
  return scroller;
}

function renderRow(props = {}) {
  return render(
    <ChipScrollRow
      variant="category"
      activeKey="all"
      chips={CHIPS}
      onChipClick={() => {}}
      {...props}
    />,
  );
}

beforeEach(() => {
  // jsdom doesn't implement these scroll methods the component calls on mount.
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("ChipScrollRow — mask-image edge fades (MEH-1572)", () => {
  it("fades are a mask on the scroller — no painted gradient overlay survives", () => {
    const { container } = renderRow();
    setScrollGeometry(container, { scrollWidth: 1000, clientWidth: 500, scrollLeft: -100 });
    // The MEH-1340 overlays were the only pointer-events-none edge divs.
    expect(container.querySelector("div.pointer-events-none.start-0")).toBeNull();
    expect(container.querySelector("div.pointer-events-none.end-0")).toBeNull();
    // The scroller opts into the shared mask utility...
    expect(getScroller(container).className).toContain("chip-scroll-fade-mask");
    // ...and carries no colour of its own: a mask is colourless, so no caller
    // background can leak into it (this is what killed the fadeBg prop).
    const inlineStyle = getScroller(container).getAttribute("style") || "";
    expect(inlineStyle).not.toMatch(/#F5F0E8|#ffffff/i);
  });

  it("non-overflowing row → both stops 0px (fully opaque, no fade)", () => {
    const { container } = renderRow();
    setScrollGeometry(container, { scrollWidth: 500, clientWidth: 500, scrollLeft: 0 });
    expect(fadeStops(container)).toEqual({ start: 0, end: 0 });
  });

  it("at the start edge → only the end fade", () => {
    const { container } = renderRow();
    setScrollGeometry(container, { scrollWidth: 1000, clientWidth: 500, scrollLeft: 0 });
    expect(fadeStops(container)).toEqual({ start: 0, end: END_FADE_PX });
  });

  it("in the middle → both fades", () => {
    const { container } = renderRow();
    setScrollGeometry(container, { scrollWidth: 1000, clientWidth: 500, scrollLeft: -250 });
    expect(fadeStops(container)).toEqual({ start: START_FADE_PX, end: END_FADE_PX });
  });

  it("at the far end → end fade GONE so the active chip isn't washed out", () => {
    const { container } = renderRow({ activeKey: "bread" });
    setScrollGeometry(container, { scrollWidth: 1000, clientWidth: 500, scrollLeft: -500 });
    expect(fadeStops(container)).toEqual({ start: START_FADE_PX, end: 0 });
  });

  it("publishes both stop depths on every render so the mask is never partial", () => {
    const { container } = renderRow();
    setScrollGeometry(container, { scrollWidth: 1000, clientWidth: 500, scrollLeft: -100 });
    const { style } = getScroller(container);
    // Both vars must always be present — a missing one would fall back to the
    // stylesheet default and silently pin that edge open.
    expect(style.getPropertyValue("--chip-fade-start")).toMatch(/^\d+px$/);
    expect(style.getPropertyValue("--chip-fade-end")).toMatch(/^\d+px$/);
  });
});

describe("ChipScrollRow — conditional end spacer + shared gutter (MEH-1572)", () => {
  it("non-overflowing row renders NO end spacer (zero trailing dead space)", () => {
    const { container } = renderRow();
    setScrollGeometry(container, { scrollWidth: 500, clientWidth: 500, scrollLeft: 0 });
    expect(container.querySelector("div.shrink-0.w-12")).toBeNull();
  });

  it("overflowing row still reserves the w-12 spacer", () => {
    const { container } = renderRow();
    setScrollGeometry(container, { scrollWidth: 1000, clientWidth: 500, scrollLeft: -100 });
    expect(container.querySelector("div.shrink-0.w-12")).not.toBeNull();
  });

  it("the IO sentinels are gone — the hook is the only affordance authority", () => {
    const { container } = renderRow();
    expect(container.querySelectorAll("div.shrink-0.w-px")).toHaveLength(0);
  });

  it("scroller sits at the shared inline-start inset (0) and keeps scroll-pe-12", () => {
    const { container } = renderRow();
    const cls = getScroller(container).className;
    expect(cls).toContain("ps-0");
    expect(cls).toContain("scroll-ps-0");
    expect(cls).not.toContain("ps-4");
    // scroll-pe-12 remains the scrollIntoView clearance mechanism.
    expect(cls).toContain("scroll-pe-12");
  });
});

describe("ChipScrollRow — public API unchanged (MEH-1340)", () => {
  it("renders every chip label and fires onChipClick with the chip key", () => {
    const onChipClick = vi.fn();
    render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={onChipClick} />,
    );
    expect(screen.getByText("לחמים ואפייה")).toBeInTheDocument();
    fireEvent.click(screen.getByText("לחמים ואפייה"));
    expect(onChipClick).toHaveBeenCalledWith("bread");
  });

  it("category variant → toolbar (MEH-1465 multi-select); active chip has aria-pressed", () => {
    render(
      <ChipScrollRow variant="category" activeKey="bread" chips={CHIPS} onChipClick={() => {}} />,
    );
    // MEH-1465: category rows are multi-select now → role="toolbar", not the
    // single-choice "radiogroup".
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByText("לחמים ואפייה").closest("button")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("toggle variant → toolbar with activeKeys driving aria-pressed", () => {
    render(
      <ChipScrollRow
        variant="toggle"
        activeKeys={{ meat: true }}
        chips={CHIPS}
        onChipClick={() => {}}
      />,
    );
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(screen.getByText("בשר ודגים").closest("button")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("ChipScrollRow — category glyph tint (MEH-1465 Direction A)", () => {
  // Chips carry a leading glyph (icon) + an iconColor. An INACTIVE category chip
  // tints its glyph with iconColor. Under MEH-1181-A "Direction A", a SELECTED
  // category chip ALSO keeps the tint (the ring/glyph carry the colour, the
  // label stays neutral) — only a solid white-fill state (toggle-active, "כל"
  // baseline) drops the tint so the glyph inherits white. A chip without
  // iconColor is never tinted.
  const TINT_CHIPS = [
    { key: "meat", label: "בשר", icon: <span data-testid="glyph-meat" />, iconColor: "#c04040" },
    { key: "dairy", label: "חלב", icon: <span data-testid="glyph-dairy" />, iconColor: "#3b72ad" },
    { key: "all", label: "כל", icon: <span data-testid="glyph-all" /> }, // no iconColor
  ];

  function glyphWrapper(testid) {
    return screen.getByTestId(testid).parentElement;
  }

  it("inactive category chip → glyph span is tinted with iconColor", () => {
    render(
      <ChipScrollRow variant="category" activeKey="all" chips={TINT_CHIPS} onChipClick={() => {}} />,
    );
    expect(glyphWrapper("glyph-meat")).toHaveStyle({ color: "#c04040" });
    expect(glyphWrapper("glyph-dairy")).toHaveStyle({ color: "#3b72ad" });
  });

  it("SELECTED category chip → glyph STAYS tinted (Direction A: glyph carries the colour)", () => {
    render(
      <ChipScrollRow variant="category" activeKey="meat" chips={TINT_CHIPS} onChipClick={() => {}} />,
    );
    // Direction A: the selected chip is NOT a solid white fill, so the glyph keeps
    // the category tint (unlike the old radio-fill behaviour where it went white).
    expect(glyphWrapper("glyph-meat")).toHaveStyle({ color: "#c04040" });
    // A different, inactive chip in the same row also stays tinted.
    expect(glyphWrapper("glyph-dairy")).toHaveStyle({ color: "#3b72ad" });
  });

  it("toggle-active chip → glyph is NOT tinted (solid fill → inherits white)", () => {
    render(
      <ChipScrollRow
        variant="toggle"
        activeKeys={{ meat: true }}
        chips={TINT_CHIPS}
        onChipClick={() => {}}
      />,
    );
    // A solid state-selected fill (toggle-active) drops the tint so the glyph
    // inherits the button's white currentColor.
    expect(glyphWrapper("glyph-meat").getAttribute("style")).toBeNull();
    // The still-inactive chip keeps its tint.
    expect(glyphWrapper("glyph-dairy")).toHaveStyle({ color: "#3b72ad" });
  });

  it("chip without iconColor → glyph never tinted, active or not", () => {
    const { rerender } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={TINT_CHIPS} onChipClick={() => {}} />,
    );
    expect(glyphWrapper("glyph-all").getAttribute("style")).toBeNull();
    rerender(
      <ChipScrollRow variant="category" activeKey="meat" chips={TINT_CHIPS} onChipClick={() => {}} />,
    );
    expect(glyphWrapper("glyph-all").getAttribute("style")).toBeNull();
  });
});

describe("ChipScrollRow — desktop edge scroll arrows (MEH-1383/MEH-1391)", () => {
  // The arrows are gated on (hover: hover) and (pointer: fine); each
  // matchMedia mock records its change listeners so a test can flip the
  // pointer capability live (hybrid devices).
  // MEH-1391: visibility moved from the IO sentinels to the shared
  // useScrollAffordance hook (scroll listener + RO math), so these tests
  // drive scroll geometry + scroll events instead of firing the IO mock.
  let mqChangeListeners;
  let savedMatchMedia;

  function mockMatchMedia(matchesDesktop) {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: matchesDesktop && query === "(hover: hover) and (pointer: fine)",
      media: query,
      addEventListener: (evt, cb) => {
        if (evt === "change") mqChangeListeners.push(cb);
      },
      removeEventListener: vi.fn(),
    }));
  }

  // Arrows are the only absolutely-positioned buttons at the edges.
  function getArrows(container) {
    return {
      start: container.querySelector("button.start-1"),
      end: container.querySelector("button.end-1"),
    };
  }

  // Give the scroller real geometry (jsdom defaults everything to 0)
  // and fire a scroll event so the hook recomputes.
  function setScroll(container, { scrollWidth, clientWidth, scrollLeft }) {
    const scroller = container.querySelector("div.overflow-x-auto");
    Object.defineProperty(scroller, "scrollWidth", { value: scrollWidth, configurable: true });
    Object.defineProperty(scroller, "clientWidth", { value: clientWidth, configurable: true });
    Object.defineProperty(scroller, "scrollLeft", {
      value: scrollLeft,
      configurable: true,
      writable: true,
    });
    fireEvent.scroll(scroller);
    return scroller;
  }

  // Overflowing row scrolled to the middle (RTL: scrollLeft negative).
  function setOverflowMid(container) {
    return setScroll(container, { scrollWidth: 1000, clientWidth: 500, scrollLeft: -100 });
  }

  beforeEach(() => {
    mqChangeListeners = [];
    savedMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = savedMatchMedia;
  });

  it("touch pointer → zero arrows even when the row overflows", () => {
    mockMatchMedia(false);
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    setOverflowMid(container);
    expect(getArrows(container).start).toBeNull();
    expect(getArrows(container).end).toBeNull();
  });

  it("fine pointer + overflow on both sides → both arrows, above the fades, out of the a11y tree", () => {
    mockMatchMedia(true);
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    setOverflowMid(container);
    const { start, end } = getArrows(container);
    expect(start).not.toBeNull();
    expect(end).not.toBeNull();
    for (const arrow of [start, end]) {
      expect(arrow.className).toContain("z-20"); // fades are z-10
      expect(arrow.className).toContain("rounded-full");
      expect(arrow).toHaveAttribute("tabindex", "-1");
      expect(arrow).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("fine pointer but no overflow → zero arrows", () => {
    mockMatchMedia(true);
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    setScroll(container, { scrollWidth: 500, clientWidth: 500, scrollLeft: 0 });
    expect(getArrows(container).start).toBeNull();
    expect(getArrows(container).end).toBeNull();
  });

  it("an arrow disappears when scroll in its direction is exhausted", () => {
    mockMatchMedia(true);
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    // At the start edge: can only scroll toward the end.
    setScroll(container, { scrollWidth: 1000, clientWidth: 500, scrollLeft: 0 });
    expect(getArrows(container).start).toBeNull();
    expect(getArrows(container).end).not.toBeNull();
    // At the far end (RTL: scrollLeft at -max): only back toward the start.
    setScroll(container, { scrollWidth: 1000, clientWidth: 500, scrollLeft: -500 });
    expect(getArrows(container).start).not.toBeNull();
    expect(getArrows(container).end).toBeNull();
  });

  it("click pages ~80% of the container width, smooth, RTL-correct sign", () => {
    mockMatchMedia(true);
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    const scroller = setOverflowMid(container);
    scroller.scrollBy = vi.fn();
    // dir="rtl": toward inline-end = NEGATIVE left delta.
    fireEvent.click(getArrows(container).end);
    expect(scroller.scrollBy).toHaveBeenCalledWith({ left: -400, behavior: "smooth" });
    fireEvent.click(getArrows(container).start);
    expect(scroller.scrollBy).toHaveBeenCalledWith({ left: 400, behavior: "smooth" });
  });

  it("vertical wheel → horizontal scroll with RTL sign; Firefox line-mode deltas normalized to px", () => {
    mockMatchMedia(true);
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    const scroller = container.querySelector("div.overflow-x-auto");
    // Overflowing row scrolled to the middle (RTL: scrollLeft negative).
    Object.defineProperty(scroller, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(scroller, "clientWidth", { value: 500, configurable: true });
    Object.defineProperty(scroller, "scrollLeft", { value: -100, configurable: true });
    scroller.scrollBy = vi.fn();

    // Pixel-mode wheel (deltaMode 0): toward inline-end = negated deltaY.
    fireEvent.wheel(scroller, { deltaY: 50, deltaMode: 0 });
    expect(scroller.scrollBy).toHaveBeenCalledWith({ left: -50 });

    // Line-mode wheel (Firefox, deltaMode 1): 3 lines × 16px, same sign rule.
    fireEvent.wheel(scroller, { deltaY: 3, deltaMode: 1 });
    expect(scroller.scrollBy).toHaveBeenCalledWith({ left: -48 });

    // Horizontal-dominant wheel passes through untouched.
    scroller.scrollBy.mockClear();
    fireEvent.wheel(scroller, { deltaY: 5, deltaX: 40, deltaMode: 0 });
    expect(scroller.scrollBy).not.toHaveBeenCalled();
  });

  it("matchMedia change → arrows unmount live (hybrid device loses its mouse)", () => {
    mockMatchMedia(true);
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    setOverflowMid(container);
    expect(getArrows(container).end).not.toBeNull();
    expect(mqChangeListeners.length).toBeGreaterThan(0);
    act(() => mqChangeListeners.forEach((cb) => cb({ matches: false })));
    expect(getArrows(container).start).toBeNull();
    expect(getArrows(container).end).toBeNull();
  });
});

describe("ChipScrollRow — category multi-select + Direction A (MEH-1465 / MEH-1181-A)", () => {
  // Category chips carry `iconColor` = the registry tint (textColor ?? color),
  // which ChipScrollRow reuses as --cat-ring for the Direction A selected state.
  const CAT_CHIPS = [
    { key: "all", label: "כל" }, // reset sentinel — no iconColor
    { key: "meat", label: "בשר ודגים", iconColor: "#c04040" },
    { key: "dairy", label: "חלב וגבינות", iconColor: "#3b72ad" },
    { key: "bread", label: "לחמים ואפייה", iconColor: "#896714" },
  ];

  function btn(label) {
    return screen.getByText(label).closest("button");
  }

  it("legacy single-key activeKey selects one chip with the Direction A ring + wash", () => {
    render(
      <ChipScrollRow variant="category" activeKey="meat" chips={CAT_CHIPS} onChipClick={() => {}} />,
    );
    const style = btn("בשר ודגים").getAttribute("style");
    // ring (1.5px, cat colour) + 12% wash + fw600, neutral label (no white fill).
    // jsdom serialises the hex to rgb() in the style attribute (#c04040 →
    // rgb(192, 64, 64)).
    expect(style).toContain("border: 1.5px solid rgb(192, 64, 64)");
    expect(style).toContain("color-mix(in srgb, rgb(192, 64, 64) 12%");
    expect(style).toContain("font-weight: 600");
    expect(btn("בשר ודגים").className).toContain("text-text");
    expect(btn("בשר ודגים").className).not.toContain("bg-state-selected");
    expect(btn("בשר ודגים")).toHaveAttribute("aria-pressed", "true");
  });

  it("activeKeys Set selects MULTIPLE chips (each gets its own ring colour)", () => {
    render(
      <ChipScrollRow
        variant="category"
        activeKeys={new Set(["meat", "dairy"])}
        chips={CAT_CHIPS}
        onChipClick={() => {}}
      />,
    );
    expect(btn("בשר ודגים").getAttribute("style")).toContain("1.5px solid rgb(192, 64, 64)");
    expect(btn("חלב וגבינות").getAttribute("style")).toContain("1.5px solid rgb(59, 114, 173)");
    expect(btn("בשר ודגים")).toHaveAttribute("aria-pressed", "true");
    expect(btn("חלב וגבינות")).toHaveAttribute("aria-pressed", "true");
    // an unselected category chip stays the plain inactive style (no inline style)
    expect(btn("לחמים ואפייה").getAttribute("style")).toBeNull();
    expect(btn("לחמים ואפייה")).toHaveAttribute("aria-pressed", "false");
  });

  it('"כל" is a solid primary fill at baseline (nothing selected) and pressed', () => {
    render(
      <ChipScrollRow
        variant="category"
        activeKeys={new Set()}
        chips={CAT_CHIPS}
        onChipClick={() => {}}
      />,
    );
    expect(btn("כל").className).toContain("bg-state-selected");
    expect(btn("כל").className).toContain("text-white");
    expect(btn("כל")).toHaveAttribute("aria-pressed", "true");
  });

  it('"כל" drops to a ghost (bg-white + muted, not pressed) once ≥1 category is selected', () => {
    render(
      <ChipScrollRow
        variant="category"
        activeKeys={new Set(["meat"])}
        chips={CAT_CHIPS}
        onChipClick={() => {}}
      />,
    );
    expect(btn("כל").className).toContain("bg-white");
    expect(btn("כל").className).toContain("text-muted");
    expect(btn("כל").className).not.toContain("bg-state-selected");
    expect(btn("כל")).toHaveAttribute("aria-pressed", "false");
  });

  it("fires onChipClick with the chip key (toggle semantics live in the caller this chunk)", () => {
    const onChipClick = vi.fn();
    render(
      <ChipScrollRow
        variant="category"
        activeKeys={new Set(["meat"])}
        chips={CAT_CHIPS}
        onChipClick={onChipClick}
      />,
    );
    fireEvent.click(btn("חלב וגבינות"));
    expect(onChipClick).toHaveBeenCalledWith("dairy");
  });
});
