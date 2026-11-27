/**
 * «קבוצת העדכונים לבתי עסק» row (Sapir 27/11, placement א׳): it renders the
 * server's invite link in a new tab, and renders nothing when the server sent
 * none (pending business, organizer, link unset — producer_me.py
 * _community_invite_url, tests/test_business_community_row.py).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CommunityRow from "@/components/producer/CommunityRow";

vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const INVITE = "https://example.invalid/community-row-fake-invite";

describe("CommunityRow", () => {
  it("links to the invite in a new tab, named by the row title", () => {
    render(<CommunityRow inviteUrl={INVITE} />);
    const cta = screen.getByTestId("community-row-cta");
    expect(cta.getAttribute("href")).toBe(INVITE);
    expect(cta.getAttribute("target")).toBe("_blank");
    expect(cta.getAttribute("rel")).toBe("noopener noreferrer");
    expect(cta.textContent).toBe("cta");
    expect(cta.getAttribute("aria-describedby")).toBe("community-row-title");
    expect(screen.getByText("title").id).toBe("community-row-title");
  });

  for (const empty of [null, undefined, ""]) {
    it(`renders nothing for inviteUrl=${JSON.stringify(empty)}`, () => {
      const { container } = render(<CommunityRow inviteUrl={empty} />);
      expect(container.innerHTML).toBe("");
    });
  }
});
