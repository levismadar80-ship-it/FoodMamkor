import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import BackToTop from "@/components/BackToTop";

// Phosphor ArrowUp → identifiable span.
vi.mock("@phosphor-icons/react", () => ({
  ArrowUp: (props) => <span data-testid="icon-arrow-up" {...props} />,
}));

const LABEL = "חזרה לראש העמוד";

function setViewport(innerHeight, scrollY) {
  window.innerHeight = innerHeight;
  window.scrollY = scrollY;
}

beforeEach(() => {
  // matchMedia: desktop=false, reduced-motion=false by default.
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  window.scrollTo = vi.fn();
  // Flush the rAF throttle synchronously so scroll → state update is testable.
  window.requestAnimationFrame = (cb) => {
    cb();
    return 0;
  };
  setViewport(667, 0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BackToTop", () => {
  it("is hidden on load (scrollY = 0)", () => {
    render(<BackToTop />);
    expect(screen.queryByLabelText(LABEL)).not.toBeInTheDocument();
  });

  it("appears only after scrolling past two viewport heights", () => {
    render(<BackToTop />);
    // Just under 2 viewports — still hidden.
    setViewport(667, 667 * 2 - 1);
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(screen.queryByLabelText(LABEL)).not.toBeInTheDocument();

    // Past 2 viewports — now visible.
    setViewport(667, 667 * 2 + 10);
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(screen.getByLabelText(LABEL)).toBeInTheDocument();
  });

  it("smooth-scrolls to the top on click (default motion)", () => {
    setViewport(667, 5000);
    render(<BackToTop />);
    act(() => window.dispatchEvent(new Event("scroll")));
    fireEvent.click(screen.getByLabelText(LABEL));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("jumps instantly (behavior:auto) when prefers-reduced-motion is set", () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes("reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    setViewport(667, 5000);
    render(<BackToTop />);
    act(() => window.dispatchEvent(new Event("scroll")));
    fireEvent.click(screen.getByLabelText(LABEL));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("uses a logical end-corner position (no physical left/right classes)", () => {
    setViewport(667, 5000);
    render(<BackToTop />);
    act(() => window.dispatchEvent(new Event("scroll")));
    const btn = screen.getByLabelText(LABEL);
    expect(btn.className).toContain("end-4");
    expect(btn.className).not.toMatch(/(^|\s)(left-|right-)/);
  });
});
