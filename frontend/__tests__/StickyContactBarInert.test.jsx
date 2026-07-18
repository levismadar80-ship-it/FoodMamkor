import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import StickyContactBar from "@/app/[locale]/producer/[id]/components/StickyContactBar";

// next-intl: identity translator — copy is irrelevant to this a11y assertion.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

// pingWhatsAppBeacon is a click-time network side effect; stub so render stays pure.
vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: vi.fn(),
}));

// A whatsapp producer with a valid IL mobile so getPrimaryContactHref yields a
// real CTA — the focusable element that must NOT stay tabbable while the bar is
// parked off-screen.
const producer = {
  id: 1,
  primary_contact_method: "whatsapp",
  phone: "0501234567",
  reviews_count: 5,
  avg_rating: 4.6,
};

function renderBar(isBarVisible) {
  return render(
    <StickyContactBar
      producer={producer}
      isVacation={false}
      isBarVisible={isBarVisible}
    />,
  );
}

beforeEach(() => {
  // getWhatsAppHref reads window.matchMedia (hover/pointer) — absent in jsdom.
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

describe("StickyContactBar — inert when hidden (MEH-1333)", () => {
  it("renders the primary CTA (the focusable guarded against aria-hidden-focus)", () => {
    renderBar(true);
    expect(screen.getByTestId("sticky-primary-cta")).toBeInTheDocument();
  });

  it("is inert (subtree non-focusable) and NOT aria-hidden when the bar is hidden", () => {
    const { container } = renderBar(false);
    const bar = container.firstChild;
    // inert removes the whole subtree from tab order AND the a11y tree, so the
    // sticky CTA is unreachable while parked off-screen. It replaces the old
    // aria-hidden, which left the CTA tabbable → axe aria-hidden-focus (serious).
    expect(bar).toHaveAttribute("inert");
    expect(bar).not.toHaveAttribute("aria-hidden");
  });

  it("is NOT inert when the bar is visible (CTA reachable)", () => {
    const { container } = renderBar(true);
    const bar = container.firstChild;
    expect(bar).not.toHaveAttribute("inert");
    expect(screen.getByTestId("sticky-primary-cta")).toBeInTheDocument();
  });
});
