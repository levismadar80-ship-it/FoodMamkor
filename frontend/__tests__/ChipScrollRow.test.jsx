import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ChipScrollRow from "@/components/ChipScrollRow";

// MEH-1340: the active chip was washed out under the widened (w-12) end fade
// because the fade was always rendered and the scroller had no scroll-pe. This
// suite locks the DYNAMIC-fade behaviour: each edge fade renders only while its
// sentinel is off-screen (IntersectionObserver, rooted on the scroller). A row
// that doesn't overflow (both sentinels visible) shows zero fades; at the far
// end the end fade is gone so the active chip is never covered. The IO is
// mocked so we can drive sentinel visibility deterministically.

vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));

// Controllable IntersectionObserver: capture every instance so a test can
// fire the observer callback with hand-picked { target, isIntersecting }
// entries — the component keys off entry.target === startEl/endEl.
let ioInstances = [];
class MockIntersectionObserver {
  constructor(cb, options) {
    this.cb = cb;
    this.options = options;
    this.targets = [];
    ioInstances.push(this);
  }
  observe(el) {
    this.targets.push(el);
  }
  unobserve(el) {
    this.targets = this.targets.filter((t) => t !== el);
  }
  disconnect() {
    this.targets = [];
  }
  fire(entries) {
    act(() => this.cb(entries));
  }
}

const CHIPS = [
  { key: "all", label: "כל" },
  { key: "bread", label: "לחמים ואפייה" },
  { key: "meat", label: "בשר ודגים" },
];

// The two w-px flex children are the edge sentinels (DOM order: start, end).
function getSentinels(container) {
  const [start, end] = container.querySelectorAll("div.shrink-0.w-px");
  return { start, end };
}

// Fades are the only pointer-events-none gradient overlays; start uses .start-0,
// end uses .end-0. querySelector returns null when the fade isn't rendered.
function getFades(container) {
  return {
    start: container.querySelector("div.pointer-events-none.start-0"),
    end: container.querySelector("div.pointer-events-none.end-0"),
  };
}

beforeEach(() => {
  ioInstances = [];
  global.IntersectionObserver = MockIntersectionObserver;
  // jsdom doesn't implement these scroll methods the component calls on mount.
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("ChipScrollRow — dynamic edge fades (MEH-1340)", () => {
  it("renders no fade before the observer reports (default state)", () => {
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    const { start, end } = getFades(container);
    expect(start).toBeNull();
    expect(end).toBeNull();
  });

  it("wires ONE IntersectionObserver rooted on the scroller, observing both sentinels", () => {
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    expect(ioInstances).toHaveLength(1);
    const io = ioInstances[0];
    // root is the horizontally-scrolling flex container.
    expect(io.options.root).toBe(container.querySelector("div.overflow-x-auto"));
    const { start, end } = getSentinels(container);
    expect(io.targets).toEqual([start, end]);
  });

  it("non-overflowing row (both sentinels visible) → zero fades", () => {
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    const { start, end } = getSentinels(container);
    ioInstances[0].fire([
      { target: start, isIntersecting: true },
      { target: end, isIntersecting: true },
    ]);
    expect(getFades(container).start).toBeNull();
    expect(getFades(container).end).toBeNull();
  });

  it("at the start edge (start sentinel visible, end hidden) → only the end fade", () => {
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    const { start, end } = getSentinels(container);
    ioInstances[0].fire([
      { target: start, isIntersecting: true },
      { target: end, isIntersecting: false },
    ]);
    expect(getFades(container).start).toBeNull();
    expect(getFades(container).end).not.toBeNull();
  });

  it("in the middle (neither sentinel visible) → both fades", () => {
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    const { start, end } = getSentinels(container);
    ioInstances[0].fire([
      { target: start, isIntersecting: false },
      { target: end, isIntersecting: false },
    ]);
    expect(getFades(container).start).not.toBeNull();
    expect(getFades(container).end).not.toBeNull();
  });

  it("at the far end (end sentinel visible) → end fade GONE so the active chip isn't washed", () => {
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="bread" chips={CHIPS} onChipClick={() => {}} />,
    );
    const { start, end } = getSentinels(container);
    // scrolled fully to the end: start content hidden, end reached.
    ioInstances[0].fire([
      { target: start, isIntersecting: false },
      { target: end, isIntersecting: true },
    ]);
    expect(getFades(container).end).toBeNull();
    expect(getFades(container).start).not.toBeNull();
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    const io = ioInstances[0];
    const spy = vi.spyOn(io, "disconnect");
    unmount();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("ChipScrollRow — end-fade clearance structure (MEH-1340)", () => {
  it("scroller carries scroll-pe-12 (matches the end fade width)", () => {
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    const scroller = container.querySelector("div.overflow-x-auto");
    expect(scroller.className).toContain("scroll-pe-12");
    expect(scroller.className).toContain("scroll-ps-4");
  });

  it("end spacer is w-12 (widened from w-8 so the last chip clears the fade)", () => {
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    expect(container.querySelector("div.shrink-0.w-12")).not.toBeNull();
    expect(container.querySelector("div.shrink-0.w-8")).toBeNull();
  });

  it("has exactly two w-px sentinels bracketing the chips", () => {
    const { container } = render(
      <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
    );
    expect(container.querySelectorAll("div.shrink-0.w-px")).toHaveLength(2);
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

  it("category variant → radiogroup; active chip has aria-pressed", () => {
    render(
      <ChipScrollRow variant="category" activeKey="bread" chips={CHIPS} onChipClick={() => {}} />,
    );
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
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

describe("ChipScrollRow — category glyph tint (inactive only)", () => {
  // Chips carry a leading glyph (icon) + an iconColor. The INACTIVE chip's glyph
  // span is tinted with iconColor; the ACTIVE chip's glyph inherits the button's
  // white text (no inline color); a chip without iconColor is never tinted.
  const TINT_CHIPS = [
    { key: "meat", label: "בשר", icon: <span data-testid="glyph-meat" />, iconColor: "#c04040" },
    { key: "dairy", label: "חלב", icon: <span data-testid="glyph-dairy" />, iconColor: "#3b72ad" },
    { key: "all", label: "כל", icon: <span data-testid="glyph-all" /> }, // no iconColor
  ];

  function glyphWrapper(testid) {
    return screen.getByTestId(testid).parentElement;
  }

  it("inactive chip → glyph span is tinted with iconColor", () => {
    render(
      <ChipScrollRow variant="category" activeKey="all" chips={TINT_CHIPS} onChipClick={() => {}} />,
    );
    expect(glyphWrapper("glyph-meat")).toHaveStyle({ color: "#c04040" });
    expect(glyphWrapper("glyph-dairy")).toHaveStyle({ color: "#3b72ad" });
  });

  it("active chip → glyph is NOT tinted (inherits white currentColor)", () => {
    render(
      <ChipScrollRow variant="category" activeKey="meat" chips={TINT_CHIPS} onChipClick={() => {}} />,
    );
    // Active chip: no inline color style at all.
    expect(glyphWrapper("glyph-meat").getAttribute("style")).toBeNull();
    // A different, inactive chip in the same row stays tinted.
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
