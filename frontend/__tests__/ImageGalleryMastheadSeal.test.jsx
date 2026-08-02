import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-1358: the imageless Tinted Masthead verified seal must open the SAME
// verification popover as the header seal (BadgeRow hero branch) — locked
// dateless copy + "איך אנחנו מאמתים?" → /about/process (MEH-1840). Real ui/Popover
// is used (BadgeRow.test precedent); next-intl mocked flat per convention.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      verified_label: "מאומת",
      aria_verified_plain: "בית עסק מאומת",
      verified_popover_title: "עסק מאומת",
      verified_popover_body: "כל עסק במהמקור עובר אישור ידני ופועל ברישיון.",
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
    // Locked v3 copy — title + body + about-link, byte-same keys as BadgeRow.
    expect(pop).toHaveTextContent("עסק מאומת");
    expect(pop).toHaveTextContent("כל עסק במהמקור עובר אישור ידני ופועל ברישיון.");
    // MEH-1840: retargeted to /about/process in lockstep with BadgeRow's popover.
    // Pinning the exact href is what keeps the two surfaces from diverging again.
    const link = screen.getByRole("link", { name: /איך אנחנו מאמתים/ });
    expect(link).toHaveAttribute("href", "/about/process");
  });

  it("popover is dateless — no doc-date line (chunk-2 CLARIFY c parity)", () => {
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
