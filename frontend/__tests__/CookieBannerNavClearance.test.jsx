/**
 * MEH-1950 — cookie banner ↔ BottomNav clearance: one source, no magic twin.
 *
 * The banner's mobile bottom offset was a hardcoded 80px living next to a nav
 * whose real clearance is 72px — an 8px gap that existed only by coincidence
 * of two numbers in two files. Guarded here:
 *   1. CookieBanner derives its offset from `--bottom-nav-clearance` (with the
 *      static expanded-geometry fallback) and carries no `80px` literal.
 *   2. BottomNav publishes the var from its measured rect and removes it on
 *      unmount (consumers then fall back, never overlap).
 * Failing-by-construction runs for both assertions are in the PR body.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import CookieBanner from "@/components/CookieBanner";
import BottomNav from "@/components/BottomNav";

const pathnameRef = { current: "/" };
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}));
vi.mock("next-intl", () => {
  const makeT = () => {
    const t = (key) => key;
    t.rich = (key) => key;
    return t;
  };
  return { useTranslations: () => makeT() };
});
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@phosphor-icons/react", () => ({
  Compass: (props) => <span {...props} />,
  MapTrifold: (props) => <span {...props} />,
  Flower: (props) => <span {...props} />,
  User: (props) => <span {...props} />,
}));
vi.mock("@/components/AccountSheet", () => ({ default: () => null }));
vi.mock("@/components/OnboardingTip", () => ({ default: () => null }));
vi.mock("@/lib/use-onboarding", () => ({
  useOnboarding: () => ({ step: 0, advance: vi.fn(), dismiss: vi.fn() }),
}));

// jsdom has no ResizeObserver; CookieBanner's MEH-850 publish effect news one
// unconditionally. Inert stub — geometry is fed via getBoundingClientRect mocks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("MEH-1950 — cookie banner offset derives from --bottom-nav-clearance", () => {
  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverStub;
    localStorage.clear();
    document.documentElement.style.removeProperty("--bottom-nav-clearance");
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("banner bottom offset reads the var with the static fallback — no hardcoded 80px twin", () => {
    const { container } = render(<CookieBanner />);
    const banner = container.querySelector(".cookie-banner");
    expect(banner).not.toBeNull();
    const cls = banner.className;
    // Derived: the var, with the expanded-geometry fallback (safe-area + 72px
    // pill clearance) + the 8px design gap.
    expect(cls).toContain(
      "bottom-[calc(var(--bottom-nav-clearance,calc(env(safe-area-inset-bottom)+72px))+8px)]"
    );
    // The magic-number twin must not come back in any spelling.
    expect(cls).not.toMatch(/80px/);
  });

  it("BottomNav publishes the measured clearance and removes it on unmount", () => {
    // jsdom has no layout: feed the pill a real-shaped rect (390×844 viewport,
    // pill top at 772 → clearance 72) and a viewport height to subtract from.
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(844);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 772,
      height: 56,
      left: 14,
      width: 362,
      bottom: 828,
      right: 376,
      x: 14,
      y: 772,
      toJSON: () => ({}),
    });

    const { unmount } = render(<BottomNav />);
    expect(
      document.documentElement.style.getPropertyValue("--bottom-nav-clearance")
    ).toBe("72px");

    unmount();
    expect(
      document.documentElement.style.getPropertyValue("--bottom-nav-clearance")
    ).toBe("");
  });

  it("a zero-height pill (hidden) removes the var instead of publishing a lie", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(844);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 0,
      height: 0,
      left: 0,
      width: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    render(<BottomNav />);
    expect(
      document.documentElement.style.getPropertyValue("--bottom-nav-clearance")
    ).toBe("");
  });
});
