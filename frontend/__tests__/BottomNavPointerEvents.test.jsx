import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import BottomNav from "@/components/BottomNav";

// MEH-1253: the full-width fixed BottomNav wrapper was a click-SHIELD — the
// transparent band (side gutters + the safe-area/16px paddingBottom below the
// pill) swallowed clicks/scroll on page content under it. Fix mirrors the
// Header shield (MEH-1251 Chunk B, PR #1805): pointer-events-none on the
// wrapper, pointer-events-auto on the <nav> pill so the pill (and everything
// interactive inside it) still works. These tests assert the class contract;
// live tap pass-through is a mobile QA item.

const userRef = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: userRef.current, logout: vi.fn() }),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/about",
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    let out = key;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  },
}));

vi.mock("@/lib/use-onboarding", () => ({
  useOnboarding: () => ({ step: 0, advance: vi.fn(), dismiss: vi.fn() }),
}));

vi.mock("framer-motion", () => ({
  // Strip animation-only props so they don't hit the DOM as attributes.
  motion: { div: ({ initial, animate, transition, ...props }) => <div {...props} /> },
}));

vi.mock("@phosphor-icons/react", () => ({
  Compass: (props) => <span data-testid="icon-compass" {...props} />,
  MapTrifold: (props) => <span data-testid="icon-map" {...props} />,
  Flower: (props) => <span data-testid="icon-flower" {...props} />,
  User: (props) => <span data-testid="icon-user" {...props} />,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/OnboardingTip", () => ({ default: () => null }));
vi.mock("@/components/AccountSheet", () => ({ default: () => null }));

describe("BottomNav pointer-events shield (MEH-1253)", () => {
  beforeEach(() => {
    userRef.current = null;
  });

  it("sets pointer-events-none on the full-width fixed wrapper (the click shield)", () => {
    const { container } = render(<BottomNav />);
    const wrapper = container.querySelector("div.fixed");
    expect(wrapper).not.toBeNull();
    expect(wrapper.className).toMatch(/\bpointer-events-none\b/);
    // Guardrail: pointer-events only — the fixed / z tokens are untouched.
    expect(wrapper.className).toMatch(/\bfixed\b/);
    expect(wrapper.className).toMatch(/z-\[1000\]/);
  });

  it("re-enables events on the <nav> pill with pointer-events-auto", () => {
    const { container } = render(<BottomNav />);
    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
    expect(nav.className).toMatch(/\bpointer-events-auto\b/);
    // The nav element itself is not accidentally also -none.
    expect(nav.className).not.toMatch(/\bpointer-events-none\b/);
  });

  it("keeps interactive tabs inside the pointer-events-auto <nav> subtree", () => {
    const { container } = render(<BottomNav />);
    const nav = container.querySelector("nav");
    // The 3 route links + the account-toggle button live inside <nav>, so
    // nothing interactive is stranded in the pointer-events-none band.
    expect(nav.querySelectorAll("a[href]").length).toBeGreaterThanOrEqual(3);
    expect(nav.querySelector('button[aria-haspopup="dialog"]')).not.toBeNull();
  });
});
