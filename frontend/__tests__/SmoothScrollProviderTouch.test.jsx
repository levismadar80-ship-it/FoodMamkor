import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

/**
 * MEH-1831 — Lenis must not initialise on touch pointers.
 *
 * Lenis's only smoothing input in this app is `smoothWheel`, and a touch
 * device never emits a wheel event. So on a phone the provider used to start a
 * `requestAnimationFrame` loop that ran every frame, for the lifetime of every
 * page, to smooth an event that could not arrive.
 *
 * What makes this a guard rather than decoration (.claude/rules/testing.md,
 * MEH-1619): the two cases below differ ONLY in what `(pointer: coarse)`
 * reports, and they assert opposite outcomes. Against the pre-MEH-1831
 * component — which consulted only `prefers-reduced-motion` — the coarse case
 * FAILS (Lenis is constructed, rAF is scheduled) while the fine case passes
 * unchanged. The fine case is the control: it would stay green if the guard
 * were written too broadly and killed smooth scroll on desktop too, which is
 * the failure this change could plausibly introduce.
 *
 * Demonstrated fail→pass run is pasted in the PR body.
 */

const lenisInstances = [];

vi.mock("lenis", () => ({
  default: vi.fn().mockImplementation(function MockLenis(options) {
    lenisInstances.push(options);
    this.raf = vi.fn();
    this.destroy = vi.fn();
  }),
}));

import SmoothScrollProvider from "@/components/SmoothScrollProvider";

/**
 * Answer each media query independently — a single boolean for every query
 * cannot express "not reduced-motion AND coarse pointer", which is exactly the
 * state under test.
 */
function mockMatchMedia({ reducedMotion = false, coarsePointer = false }) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes("prefers-reduced-motion") ? reducedMotion : coarsePointer,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  lenisInstances.length = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SmoothScrollProvider — touch skip (MEH-1831)", () => {
  it("does NOT init Lenis on a coarse pointer, and starts no rAF loop", () => {
    mockMatchMedia({ coarsePointer: true });

    render(
      <SmoothScrollProvider>
        <p>content</p>
      </SmoothScrollProvider>,
    );

    expect(lenisInstances).toHaveLength(0);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("still inits Lenis on a fine pointer (desktop unchanged)", () => {
    mockMatchMedia({ coarsePointer: false });

    render(
      <SmoothScrollProvider>
        <p>content</p>
      </SmoothScrollProvider>,
    );

    expect(lenisInstances).toHaveLength(1);
    // The desktop config is untouched by this ticket — assert it, so a future
    // edit to the guard cannot quietly change what desktop gets.
    expect(lenisInstances[0]).toMatchObject({ duration: 1.2, smoothWheel: true });
    expect(window.requestAnimationFrame).toHaveBeenCalled();
  });

  it("still skips on reduced-motion with a fine pointer (pre-existing guard)", () => {
    mockMatchMedia({ reducedMotion: true, coarsePointer: false });

    render(
      <SmoothScrollProvider>
        <p>content</p>
      </SmoothScrollProvider>,
    );

    expect(lenisInstances).toHaveLength(0);
  });

  it("renders its children in every case", () => {
    mockMatchMedia({ coarsePointer: true });

    const { getByText } = render(
      <SmoothScrollProvider>
        <p>content</p>
      </SmoothScrollProvider>,
    );

    expect(getByText("content")).toBeInTheDocument();
  });
});
