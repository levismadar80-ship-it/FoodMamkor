import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import StickyContactBar from "@/app/[locale]/producer/[id]/components/StickyContactBar";

// MEH-3027: the sticky CTA is a floating pill with the BottomNav shell's
// geometry, not a full-width strip. The strip's 6px-radius button sat ~15pt
// from the bottom of an iPhone (env(safe-area-inset-bottom) is 0 without
// viewport-fit=cover) and the display's rounded corner clipped it.

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
}));
vi.mock("@/lib/contact-tracking", () => ({ trackPrimaryCtaClick: vi.fn() }));

const producer = {
  id: 1,
  name: "בית עסק",
  primary_contact_method: "whatsapp",
  phone: "0501234567",
  reviews_count: 5,
  avg_rating: 4.6,
};

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

function renderBar() {
  return render(<StickyContactBar producer={producer} isVacation={false} isBarVisible />);
}

describe("StickyContactBar — floating pill (MEH-3027)", () => {
  it("the CTA is a fully rounded pill, not a small-radius rectangle", () => {
    renderBar();
    const cta = screen.getByTestId("sticky-primary-cta");
    expect(cta.className).toMatch(/\brounded-full\b/);
    expect(cta.className).not.toMatch(/\brounded-md\b/);
    // 48px = the BottomNav pill's compact height; 56 read too heavy (Sapir, 13/11).
    expect(cta.className).toMatch(/\bh-12\b/);
  });

  it("keeps a 16px bottom gutter on top of the safe-area inset (the inset is 0 on iOS here)", () => {
    renderBar();
    const bar = screen.getByTestId("sticky-contact-bar");
    // jsdom normalises calc() order, so match either side of the +.
    expect(bar.style.paddingBottom).toMatch(/16px/);
    expect(bar.style.paddingBottom).toMatch(/safe-area-inset-bottom/);
  });

  it("has no full-width white strip — the shell is transparent and passes taps through", () => {
    renderBar();
    const bar = screen.getByTestId("sticky-contact-bar");
    expect(bar.className).not.toMatch(/\bbg-surface\b/);
    expect(bar.className).not.toMatch(/\bborder-t\b/);
    expect(bar.className).toMatch(/\bpointer-events-none\b/);
    expect(screen.getByTestId("sticky-primary-cta").className).toMatch(/\bpointer-events-auto\b/);
  });

  it("carries no rating beside the CTA, even with ≥3 reviews (Sapir, 13/11)", () => {
    renderBar();
    const bar = screen.getByTestId("sticky-contact-bar");
    expect(bar.textContent).not.toContain("4.6");
    expect(bar.textContent).not.toContain("review_count");
  });
});

describe("StickyContactBar — pill states (MEH-3027 review)", () => {
  it("drops the lift shadow while parked, so no haze shows at the viewport edge", () => {
    const { rerender } = render(<StickyContactBar producer={producer} isVacation={false} isBarVisible={false} />);
    expect(screen.getByTestId("sticky-primary-cta").className).not.toMatch(/\bshadow-lg\b/);
    rerender(<StickyContactBar producer={producer} isVacation={false} isBarVisible />);
    expect(screen.getByTestId("sticky-primary-cta").className).toMatch(/\bshadow-lg\b/);
  });

  it("keeps the vacation dim on the shell", () => {
    render(<StickyContactBar producer={producer} isVacation isBarVisible />);
    expect(screen.getByTestId("sticky-contact-bar").style.opacity).toBe("0.85");
  });
});
