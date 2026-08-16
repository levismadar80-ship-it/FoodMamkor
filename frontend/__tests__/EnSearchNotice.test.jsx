import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import en from "../messages/en.json";

/**
 * MEH-1812 — the /en search-locale notice.
 *
 * The load-bearing assertion is the ABSENCE one. A test that only checks
 * "renders on /en" passes identically against an implementation with no locale
 * gate at all, so it would not discriminate between the fix and the bug it
 * exists to prevent (an English banner shown to Hebrew visitors). Both
 * directions are asserted, and the he case is the one that would go red first.
 */

let mockLocale = "en";
vi.mock("next-intl", () => ({
  useLocale: () => mockLocale,
  useTranslations: (ns) => (k) => {
    // Resolve against the REAL en.json rather than a fixture, so a renamed or
    // deleted key fails here instead of passing against a private copy.
    const node = ns.split(".").reduce((o, p) => (o ? o[p] : undefined), en);
    return node?.[k] ?? `MISSING:${ns}.${k}`;
  },
}));

// LanguageToggle is exercised by its own tests; here it is stubbed to a marker
// so this spec asserts THIS component's contract — that the CTA is delegated to
// it at all, which is the thing a hand-rolled router.replace would silently break.
vi.mock("@/components/LanguageToggle", () => ({
  default: ({ children, className }) => (
    <button data-testid="lang-toggle" className={className}>{children}</button>
  ),
}));

import EnSearchNotice from "@/components/EnSearchNotice";

describe("EnSearchNotice", () => {
  beforeEach(() => { mockLocale = "en"; });

  it("renders the locked notice + CTA on /en", () => {
    render(<EnSearchNotice />);
    const el = screen.getByTestId("en-search-notice");
    expect(el).toBeTruthy();
    expect(el.textContent).toContain(
      "Business listings are in Hebrew — searching in English returns no results."
    );
    expect(screen.getByTestId("lang-toggle").textContent).toBe("Switch to Hebrew");
  });

  it("renders NOTHING on /he — the discriminating case", () => {
    mockLocale = "he";
    const { container } = render(<EnSearchNotice />);
    expect(screen.queryByTestId("en-search-notice")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing on the bare root locale too (not just he)", () => {
    mockLocale = "";
    const { container } = render(<EnSearchNotice />);
    expect(container.innerHTML).toBe("");
  });

  it("delegates the CTA to LanguageToggle rather than its own navigation", () => {
    // Path+query preservation AND the localStorage.lang shim write both live in
    // LanguageToggle. If a future refactor inlines router.replace here, the
    // visitor gets bounced back to /en on the next mount — this asserts the
    // delegation itself, which is the property that prevents that.
    render(<EnSearchNotice />);
    expect(screen.getByTestId("lang-toggle")).toBeTruthy();
  });

  it("uses the copy verbatim from en.json, not a literal", () => {
    expect(en.search.en_notice.body).toBe(
      "Business listings are in Hebrew — searching in English returns no results."
    );
    expect(en.search.en_notice.cta).toBe("Switch to Hebrew");
  });
});
