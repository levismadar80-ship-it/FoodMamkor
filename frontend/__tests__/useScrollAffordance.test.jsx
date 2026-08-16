import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import useScrollAffordance, { ScrollArrows } from "@/hooks/useScrollAffordance";

// MEH-1391 — shared desktop scroll-affordance hook, extracted from the
// MEH-1383 ChipScrollRow arrows and reused by FridayDeliveryStrip +
// HomeRecentlyViewed. The suite drives a minimal probe component: the
// hook needs a real element for scrollRef, which renderHook can't attach.

function Probe({ trailingFillerPx }) {
  const affordance = useScrollAffordance(
    trailingFillerPx === undefined ? undefined : { trailingFillerPx },
  );
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

  it("LTR context (e.g. /en, layout dir=ltr) → mirrored scroll sign", () => {
    mockMatchMedia(true);
    // dir attr on a wrapper mirrors <html dir="ltr"> — isRtlContext walks
    // closest("[dir]").
    const { container, getByTestId } = render(
      <div dir="ltr">
        <Probe />
      </div>,
    );
    const scroller = getByTestId("scroller");
    // LTR: scrollLeft is POSITIVE, 0 at start.
    setScroll(scroller, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 300 });
    scroller.scrollBy = vi.fn();
    fireEvent.click(getArrows(container).end); // toward end = POSITIVE in LTR
    expect(scroller.scrollBy).toHaveBeenCalledWith({ left: 320, behavior: "smooth" });
    fireEvent.click(getArrows(container).start);
    expect(scroller.scrollBy).toHaveBeenCalledWith({ left: -320, behavior: "smooth" });
  });

  // MEH-1545 — ChipScrollRow's w-12 end spacer + w-px sentinel (+gaps, 65px)
  // inflate scrollWidth. At viewport widths where every chip fits, the old
  // math (maxScroll > 0 + 16px epsilon) still grew a lone arrow over the
  // empty end of the row; clicking it revealed blank spacer (Sapir QA 26/07).
  it("filler-only overflow → no phantom arrow (MEH-1545)", () => {
    mockMatchMedia(true);
    const { container, getByTestId } = render(<Probe trailingFillerPx={65} />);
    // maxScroll = 50: entirely inside the declared 65px trailing filler —
    // the exact live geometry measured on /producers at 900px viewport.
    setScroll(getByTestId("scroller"), { scrollWidth: 918, clientWidth: 868, scrollLeft: 0 });
    expect(getArrows(container).start).toBeNull();
    expect(getArrows(container).end).toBeNull();
  });

  it("real chip overflow past the filler → arrows still render (MEH-1545)", () => {
    mockMatchMedia(true);
    const { container, getByTestId } = render(<Probe trailingFillerPx={65} />);
    // maxScroll = 136 > 65 + 16: genuine hidden chips (toggle row @900px).
    const scroller = getByTestId("scroller");
    setScroll(scroller, { scrollWidth: 1004, clientWidth: 868, scrollLeft: 0 });
    expect(getArrows(container).start).toBeNull();
    expect(getArrows(container).end).not.toBeNull();
    // Mid-scroll: both directions, same as the default-filler behavior.
    setScroll(scroller, { scrollWidth: 1004, clientWidth: 868, scrollLeft: -60 });
    expect(getArrows(container).start).not.toBeNull();
    expect(getArrows(container).end).not.toBeNull();
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
