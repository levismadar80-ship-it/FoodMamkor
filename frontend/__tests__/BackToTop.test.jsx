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

  // MEH-2417: hidden while the page footer is in view, so it never covers the
  // footer's utility links. The observer is driven by hand (jsdom has none).
  it("hides while the footer is in view and returns when it leaves", () => {
    let cb;
    window.IntersectionObserver = class {
      constructor(fn) { cb = fn; }
      observe() {}
      disconnect() {}
    };
    // An in-page <footer> FIRST in DOM order — the observer must skip it.
    const articleFooter = document.createElement("footer");
    document.body.appendChild(articleFooter);
    const footer = document.createElement("footer");
    footer.setAttribute("data-site-footer", "");
    document.body.appendChild(footer);
    let observed = null;
    const Base = window.IntersectionObserver;
    window.IntersectionObserver = class extends Base {
      observe(el) { observed = el; }
    };
    // finally, not trailing lines: a failed assertion must not leak the
    // stubbed observer or the footer node into the tests after this one.
    try {
      setViewport(667, 5000);
      render(<BackToTop />);
      act(() => window.dispatchEvent(new Event("scroll")));
      expect(screen.getByLabelText(LABEL)).toBeInTheDocument();
      expect(observed).toBe(footer);
      act(() => cb([{ isIntersecting: true }]));
      expect(screen.queryByLabelText(LABEL)).not.toBeInTheDocument();
      act(() => cb([{ isIntersecting: false }]));
      expect(screen.getByLabelText(LABEL)).toBeInTheDocument();
    } finally {
      articleFooter.remove();
      footer.remove();
      delete window.IntersectionObserver;
    }
  });

  it("no site footer on the page: the button still shows", () => {
    window.IntersectionObserver = class {
      observe() {}
      disconnect() {}
    };
    try {
      setViewport(667, 5000);
      render(<BackToTop />);
      act(() => window.dispatchEvent(new Event("scroll")));
      expect(screen.getByLabelText(LABEL)).toBeInTheDocument();
    } finally {
      delete window.IntersectionObserver;
    }
  });
});
