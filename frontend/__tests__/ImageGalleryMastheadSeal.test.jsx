import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-1358: the imageless Tinted Masthead verified seal must open the SAME
// verification popover as the header seal (BadgeRow hero branch) — same copy
// keys + "איך אנחנו מאמתים?" → /about/process (MEH-1840). Real ui/Popover
// is used (BadgeRow.test precedent); next-intl mocked flat per convention.
//
// MEH-1843: the body key is now per-doc-type. This harness passes no doc type
// and no date, so it exercises the generic fallback — which is the call-site
// path worth pinning here. The mock is FLAT and does not implement ICU, so it
// cannot verify the date clause; that is deliberately not this file's job.
// Real-formatter coverage lives in VerifiedPopoverDocType.test.jsx, which
// renders under the real NextIntlClientProvider + he.json. This file stays on
// the seal MECHANICS (button, open, Esc, focus, href).
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      verified_label: "מאומת",
      aria_verified_plain: "בית עסק מאומת",
      verified_popover_title: "עסק מאומת",
      verified_popover_body_generic: "אישרנו את העסק באופן ידני.",
      verified_popover_body_license: "אישרנו את העסק באופן ידני אחרי בדיקת רישיון בתוקף.",
      verified_popover_body_exemption: "אישרנו את העסק באופן ידני אחרי בדיקת מסמכי פטור מרישיון.",
      verified_popover_body_cosmetics:
        "אישרנו את העסק באופן ידני אחרי בדיקת מסמכי פעילות בתחום התמרוקים.",
      verified_popover_link: "איך אנחנו מאמתים?",
    };
    return flat[key] ?? key;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ShareButton", () => ({
  default: () => <div data-testid="share-overlay" />,
}));
vi.mock("@/components/ImageWithFallback", () => ({
  default: () => <div data-testid="image" />,
}));
vi.mock("@/components/Lightbox", () => ({
  default: () => null,
}));
vi.mock("@phosphor-icons/react", () => ({
  SealCheck: (props) => <span data-testid="seal-icon" {...props} />,
  CaretLeft: (props) => <span data-testid="caret-icon" {...props} />,
  Images: (props) => <span data-testid="images-icon" {...props} />,
}));

import ImageGallery from "@/components/ImageGallery";

const renderVerified = () =>
  render(<ImageGallery images={[]} producerName="בית הבד זיתון" verified />);

describe("ImageGallery masthead verified seal → verification popover (MEH-1358)", () => {
  it("renders the seal as a button and opens the verification popover on click", () => {
    renderVerified();
    const seal = screen.getByTestId("masthead-verified");
    expect(seal.tagName).toBe("BUTTON");
    expect(screen.queryByTestId("badge-tooltip-verified")).not.toBeInTheDocument();

    fireEvent.click(seal);
    const pop = screen.getByTestId("badge-tooltip-verified");
    expect(pop).toBeInTheDocument();
    // Title + body + about-link, byte-same keys as BadgeRow.
    expect(pop).toHaveTextContent("עסק מאומת");
    // MEH-1843: the retired absolute sentence claimed every business "operates
    // under licence", which was false for exemption/cosmetics. With no doc type
    // supplied this masthead falls back to the generic claim, which is true.
    expect(pop).toHaveTextContent("אישרנו את העסק באופן ידני.");
    expect(pop).not.toHaveTextContent("ופועל ברישיון");
    // MEH-1840: retargeted to /about/process in lockstep with BadgeRow's popover.
    // Pinning the exact href is what keeps the two surfaces from diverging again.
    const link = screen.getByRole("link", { name: /איך אנחנו מאמתים/ });
    expect(link).toHaveAttribute("href", "/about/process");
  });

  // MEH-1843 superseded MEH-1334 chunk-2's blanket "dateless" rule: the body
  // now carries the check date WHEN there is one. This case passes none, so the
  // sentence must still come out clean — no dangling clause, no placeholder.
  // The old card-surface tooltip phrasing ("הוגש ונבדק") must never leak here.
  it("no date supplied → body carries no date clause and no stub", () => {
    renderVerified();
    fireEvent.click(screen.getByTestId("masthead-verified"));
    expect(screen.getByTestId("badge-tooltip-verified")).not.toHaveTextContent("הוגש ונבדק");
  });

  it("Escape closes the popover", () => {
    renderVerified();
    fireEvent.click(screen.getByTestId("masthead-verified"));
    expect(screen.getByTestId("badge-tooltip-verified")).toBeInTheDocument();
    fireEvent.keyDown(globalThis, { key: "Escape" });
    expect(screen.queryByTestId("badge-tooltip-verified")).not.toBeInTheDocument();
  });

  it("non-verified (declared-tier) imageless producer: no seal, no popover", () => {
    // ProducerDetail passes verified={verification_tier === "verified"}, so a
    // declared producer reaches the masthead with verified=false (badges.js:140
    // semantics) — mirror of the MEH-1334 no-false-claim regression test.
    render(<ImageGallery images={[]} producerName="סבון עז נעמה" verified={false} />);
    expect(screen.queryByTestId("masthead-verified")).not.toBeInTheDocument();
    expect(screen.queryByTestId("badge-tooltip-verified")).not.toBeInTheDocument();
  });
});
