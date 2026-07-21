import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// MEH-1410 — ChatWidget is desktop-only (>= 768px). It gates its entire
// render on the `isDesktop` matchMedia state and returns null on mobile.
//  A) mobile (matchMedia "(min-width: 768px)" → false): renders nothing
//  B) desktop (matchMedia → true): renders the launcher FAB
// The widget imports `@/lib/api`; stub it so these render-only tests stay
// offline and deterministic (no /chat POST is triggered here anyway).
vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

import ChatWidget from "@/components/ChatWidget";

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => cleanup());

describe("ChatWidget desktop-only (MEH-1410)", () => {
  it("renders nothing on mobile (< 768px)", () => {
    mockMatchMedia(false);
    const { container } = render(<ChatWidget />);
    expect(container).toBeEmptyDOMElement();
    // The launcher aria-label must not exist anywhere on mobile.
    expect(screen.queryByLabelText("שאלו אותנו")).not.toBeInTheDocument();
  });

  it("renders the launcher FAB on desktop (>= 768px)", () => {
    mockMatchMedia(true);
    render(<ChatWidget />);
    // The effect flips isDesktop → true (flushed inside render's act()), so the
    // launcher button (aria-label "שאלו אותנו" while closed) is present.
    expect(screen.getByLabelText("שאלו אותנו")).toBeInTheDocument();
  });
});
