import { describe, it, expect, beforeEach, vi } from "vitest";
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
