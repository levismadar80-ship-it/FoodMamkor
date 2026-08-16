/**
 * MEH-1843 — the MASTHEAD popover body, through the real ICU formatter.
 *
 * ImageGalleryMastheadSeal.test.jsx owns the seal mechanics (button, open, Esc,
 * focus return) and mocks next-intl flat, so it cannot tell a working ICU
 * `select` from a broken one. VerifiedPopoverDocType.test.jsx uses the real
 * formatter but drives BadgeRow. Between them the masthead's real-formatter path
 * was untested — and that path has something BadgeRow's does not: a PROP
 * REMAPPING (`verificationDocType` → `verification_doc_type`,
 * `verifiedAt` → `verified_at`). A typo there fails silently into the generic
 * sentence, which reads perfectly plausible and would ship.
 *
 * So this file exists for one question the other two cannot answer: does the
 * masthead render the SAME sentence BadgeRow does for the same business?
 *
 * Heavy children are mocked (they pull auth/network); next-intl is NOT.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/ShareButton", () => ({ default: () => <div /> }));
vi.mock("@/components/ImageWithFallback", () => ({ default: () => <div /> }));
vi.mock("@/components/Lightbox", () => ({ default: () => null }));
vi.mock("@/components/FavoriteButton", () => ({ default: () => <div /> }));

import ImageGallery from "@/components/ImageGallery";

function openMasthead(props) {
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {/* imageless → the Tinted Masthead branch, which owns the seal */}
      <ImageGallery images={[]} producerName="חוות הזית" verified {...props} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByTestId("masthead-verified"));
  return screen.getByTestId("badge-tooltip-verified").textContent;
}

describe("MEH-1843 — masthead popover, real ICU", () => {
  it("license → the licence sentence with the date (proves the prop remap)", () => {
    const text = openMasthead({
      verificationDocType: "license",
      verifiedAt: "2026-06-05",
    });
    // If verificationDocType were mis-mapped, this would silently be the
    // generic sentence — true, plausible, and wrong.
    expect(text).toContain("אחרי בדיקת רישיון בתוקף");
    expect(text).toContain("5.6.2026");
  });

  it("exemption → never claims a licence", () => {
    const text = openMasthead({
      verificationDocType: "exemption",
      verifiedAt: "2026-06-05",
    });
    expect(text).toContain("מסמכי פטור מרישיון");
    expect(text).not.toContain("רישיון בתוקף");
  });

  it("no doc type and no date → clean generic sentence, no stub", () => {
    const text = openMasthead({});
    expect(text).toContain("אישרנו את העסק באופן ידני");
    expect(text).not.toContain("נבדק ב");
    expect(text).not.toMatch(/\{date\}|undefined|null/);
  });

  it("the retired absolute claim is gone from this surface too", () => {
    const text = openMasthead({
      verificationDocType: "cosmetics",
      verifiedAt: "2026-06-05",
    });
    expect(text).toContain("בתחום התמרוקים");
    expect(text).not.toContain("ופועל ברישיון");
  });
});
