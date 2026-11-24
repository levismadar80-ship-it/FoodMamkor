// MEH-3780: Sentry JAVASCRIPT-NEXTJS-14 — "scrollTo is not a function" on
// /producers. An engine that gives elements no scrollTo / scrollBy must not
// crash the chip row; it falls back to scrollLeft.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import ChipScrollRow from "@/components/ChipScrollRow";

vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));

const CHIPS = [
  { key: "all", label: "כל" },
  { key: "bread", label: "לחמים ואפייה" },
];

function renderRow() {
  return render(
    <ChipScrollRow variant="category" activeKey="all" chips={CHIPS} onChipClick={() => {}} />,
  );
}

let savedMatchMedia;

beforeEach(() => {
  savedMatchMedia = window.matchMedia;
  delete Element.prototype.scrollTo;
  delete Element.prototype.scrollBy;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  window.matchMedia = savedMatchMedia;
  delete Element.prototype.scrollTo;
  delete Element.prototype.scrollBy;
});

describe("ChipScrollRow — element without scrollTo / scrollBy (MEH-3780)", () => {
  it("mount pin without scrollTo → renders, scrollLeft at the inline start", () => {
    expect(typeof Element.prototype.scrollTo).toBe("undefined");
    const { container } = renderRow();
    const scroller = container.querySelector("div.overflow-x-auto");
    expect(scroller).not.toBeNull();
    expect(scroller.scrollLeft).toBe(0);
  });

  it("mount pin with scrollTo → still calls it with left 0, instant", () => {
    Element.prototype.scrollTo = vi.fn();
    renderRow();
    expect(Element.prototype.scrollTo).toHaveBeenCalledWith({ left: 0, behavior: "instant" });
  });

  it("wheel without scrollBy → scrollLeft moves by the same RTL delta", () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === "(hover: hover) and (pointer: fine)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { container } = renderRow();
    const scroller = container.querySelector("div.overflow-x-auto");
    Object.defineProperty(scroller, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(scroller, "clientWidth", { value: 500, configurable: true });
    Object.defineProperty(scroller, "scrollLeft", {
      value: -100,
      configurable: true,
      writable: true,
    });
    fireEvent.wheel(scroller, { deltaY: 50, deltaMode: 0 });
    expect(scroller.scrollLeft).toBe(-150);
  });
});
