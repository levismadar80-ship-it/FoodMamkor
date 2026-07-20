import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import useScrollAffordance, { ScrollArrows } from "@/hooks/useScrollAffordance";

// MEH-1391 — shared desktop scroll-affordance hook, extracted from the
// MEH-1383 ChipScrollRow arrows and reused by FridayDeliveryStrip +
// HomeRecentlyViewed. The suite drives a minimal probe component: the
// hook needs a real element for scrollRef, which renderHook can't attach.

function Probe() {
  const affordance = useScrollAffordance();
  return (
    <div className="relative">
      <ScrollArrows affordance={affordance} />
      <div ref={affordance.scrollRef} data-testid="scroller" />
    </div>
  );
}

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

function getArrows(container) {
  return {
    start: container.querySelector("button.start-1"),
    end: container.querySelector("button.end-1"),
  };
}

function setScroll(scroller, { scrollWidth, clientWidth, scrollLeft }) {
  Object.defineProperty(scroller, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(scroller, "clientWidth", { value: clientWidth, configurable: true });
  Object.defineProperty(scroller, "scrollLeft", {
    value: scrollLeft,
    configurable: true,
    writable: true,
  });
  fireEvent.scroll(scroller);
}

beforeEach(() => {
  mqChangeListeners = [];
  savedMatchMedia = window.matchMedia;
});

afterEach(() => {
  window.matchMedia = savedMatchMedia;
});

describe("useScrollAffordance (MEH-1391)", () => {
  it("touch pointer → showArrows false, zero arrow DOM even with overflow", () => {
    mockMatchMedia(false);
    const { container, getByTestId } = render(<Probe />);
    setScroll(getByTestId("scroller"), { scrollWidth: 1000, clientWidth: 400, scrollLeft: -50 });
    expect(getArrows(container).start).toBeNull();
    expect(getArrows(container).end).toBeNull();
  });

  it("fine pointer + mid-scroll overflow → both directions available", () => {
    mockMatchMedia(true);
    const { container, getByTestId } = render(<Probe />);
    setScroll(getByTestId("scroller"), { scrollWidth: 1000, clientWidth: 400, scrollLeft: -300 });
    expect(getArrows(container).start).not.toBeNull();
    expect(getArrows(container).end).not.toBeNull();
  });

  it("per-direction exhaustion at the edges (RTL negative scrollLeft)", () => {
    mockMatchMedia(true);
    const { container, getByTestId } = render(<Probe />);
    const scroller = getByTestId("scroller");
    // At inline-start rest (scrollLeft 0): only end available.
    setScroll(scroller, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 0 });
    expect(getArrows(container).start).toBeNull();
    expect(getArrows(container).end).not.toBeNull();
    // At the far end (-max): only start available.
    setScroll(scroller, { scrollWidth: 1000, clientWidth: 400, scrollLeft: -600 });
    expect(getArrows(container).start).not.toBeNull();
    expect(getArrows(container).end).toBeNull();
  });

  it("Math.abs tolerates legacy positive-RTL scrollLeft values", () => {
    mockMatchMedia(true);
    const { container, getByTestId } = render(<Probe />);
    setScroll(getByTestId("scroller"), { scrollWidth: 1000, clientWidth: 400, scrollLeft: 300 });
    expect(getArrows(container).start).not.toBeNull();
    expect(getArrows(container).end).not.toBeNull();
  });

  it("no overflow → both false regardless of pointer", () => {
    mockMatchMedia(true);
    const { container, getByTestId } = render(<Probe />);
    setScroll(getByTestId("scroller"), { scrollWidth: 400, clientWidth: 400, scrollLeft: 0 });
    expect(getArrows(container).start).toBeNull();
    expect(getArrows(container).end).toBeNull();
  });

  it("scrollByAmount pages ~80% of clientWidth, smooth, RTL sign", () => {
    mockMatchMedia(true);
    const { container, getByTestId } = render(<Probe />);
    const scroller = getByTestId("scroller");
    setScroll(scroller, { scrollWidth: 1000, clientWidth: 400, scrollLeft: -100 });
    scroller.scrollBy = vi.fn();
    fireEvent.click(getArrows(container).end); // toward inline-end
    expect(scroller.scrollBy).toHaveBeenCalledWith({ left: -320, behavior: "smooth" });
    fireEvent.click(getArrows(container).start); // back toward start
    expect(scroller.scrollBy).toHaveBeenCalledWith({ left: 320, behavior: "smooth" });
  });

  it("matchMedia change flips showArrows live", () => {
    mockMatchMedia(true);
    const { container, getByTestId } = render(<Probe />);
    setScroll(getByTestId("scroller"), { scrollWidth: 1000, clientWidth: 400, scrollLeft: -300 });
    expect(getArrows(container).end).not.toBeNull();
    act(() => mqChangeListeners.forEach((cb) => cb({ matches: false })));
    expect(getArrows(container).start).toBeNull();
    expect(getArrows(container).end).toBeNull();
  });
});
