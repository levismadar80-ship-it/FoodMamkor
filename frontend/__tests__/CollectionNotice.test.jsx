import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * MEH-1981 — CollectionNotice, the just-in-time notice-at-collection element.
 *
 * Five surfaces collect personal data with no notice and no privacy link
 * (measured 01/09 against origin/staging): ChatWidget (free text that leaves
 * for a third party), ForgotPasswordClient (email), ExperienceForm, EventForm,
 * CategoryRequestModal. The two registration pages already carry the pattern
 * this component reuses.
 *
 * WHAT THIS FILE GUARDS, and what it deliberately does not:
 *   - It guards the MECHANISM: renders the line, links to /privacy, opens in a
 *     new tab, stays silent on an empty message, uses logical properties only.
 *   - It does NOT assert any Hebrew string. The copy is Sapir's (rule 22) and
 *     is not approved yet, so a test that pinned wording would either encode
 *     unapproved copy or go stale the moment it is approved.
 */

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: CollectionNotice } = await import("../components/CollectionNotice.jsx");

describe("CollectionNotice", () => {
  it("renders the message and a /privacy link that opens in a new tab", () => {
    render(
      <CollectionNotice message="NOTICE-LINE" linkLabel="LINK-LABEL" testId="chat-collection-notice" />,
    );

    const el = screen.getByTestId("chat-collection-notice");
    expect(el).toBeTruthy();
    expect(el.textContent).toContain("NOTICE-LINE");

    const link = screen.getByTestId("chat-collection-notice-link");
    expect(link.getAttribute("href")).toBe("/privacy");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.textContent).toBe("LINK-LABEL");
  });

  // The discriminating case. Without it the component could render a bare "·"
  // and a link next to an empty string on any surface whose key is missing,
  // which reads as a broken element rather than as an absent notice.
  it("renders NOTHING when the message is empty — not a link on its own", () => {
    const { container } = render(
      <CollectionNotice message="" linkLabel="LINK-LABEL" testId="empty-notice" />,
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByTestId("empty-notice")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  // RTL: the repo's rule is logical properties only. A physical class here
  // would place the notice on the wrong side under dir="rtl" — and it would
  // LOOK correct in an LTR test run, which is why this asserts the class list
  // rather than a rendered position.
  it("uses logical properties only — no physical left/right classes", () => {
    render(<CollectionNotice message="X" linkLabel="Y" testId="rtl-notice" />);
    const cls = screen.getByTestId("rtl-notice").className;

    expect(cls).toContain("text-start");
    for (const physical of ["text-left", "text-right", "ml-", "mr-", "pl-", "pr-"]) {
      expect(cls.includes(physical), `class list must not contain "${physical}"`).toBe(false);
    }
  });

  it("passes a caller className through without dropping its own", () => {
    render(<CollectionNotice message="X" linkLabel="Y" testId="cn" className="EXTRA-CLASS" />);
    const cls = screen.getByTestId("cn").className;
    expect(cls).toContain("EXTRA-CLASS");
    expect(cls).toContain("text-start");
  });
});
