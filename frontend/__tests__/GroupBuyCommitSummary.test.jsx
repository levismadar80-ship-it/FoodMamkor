// MEH-3734 — after joining, the member card says what happens next, how she
// pays, and how to leave: the «לא יודעת למה נרשמתי, לא יודעת איך לבטל» report
// (Sapir 23/11). Renders the panel the detail page uses.
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import GroupBuyMemberPanel from "@/components/group-buy/GroupBuyMemberPanel";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (key, p) => (p ? `${key} ${Object.values(p).join(" ")}` : key),
}));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "1 בינואר 2099", formatDate: () => "1 בינואר 2099" }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api", () => ({ default: { patch: vi.fn() } }));

afterEach(cleanup);

const GB = {
  id: "gb-1", status: "open", deadline: "2099-01-01T00:00:00", unit: "ק\"ג",
  price_per_unit_group: 13, producer_name: "טחנת אבן", units_left: null,
  pickup_starts_at: null, pickup_ends_at: null,
  user_committed: true, user_commit: { quantity: 1 },
};
const panel = (over = {}, joinable = true) =>
  render(<GroupBuyMemberPanel gb={{ ...GB, ...over }} joinable={joinable} full={false} cancelling={false} onCancel={() => {}} onChanged={() => {}} />);
const text = (id) => screen.queryByTestId(id)?.textContent ?? null;

describe("member card: what happens next (MEH-3734)", () => {
  it("open group: email when it reaches the goal, no commitment if it misses by the deadline", () => {
    panel();
    expect(text("group-buy-member-next")).toMatch(/^member_next_open /);
  });

  it("funded with a pickup time: says the group reached its goal and when to pick up", () => {
    panel({ status: "funded", pickup_starts_at: "2099-01-02T08:00:00", pickup_ends_at: "2099-01-02T10:00:00" });
    expect(text("group-buy-member-next")).toMatch(/^member_next_funded_pickup /);
  });

  it("funded with no pickup time: contact the business (the existing funded line)", () => {
    panel({ status: "funded" });
    expect(text("group-buy-member-next")).toBe("funded_subtitle טחנת אבן");
  });

  it("says nothing is paid now, with the page's existing pay line", () => {
    panel();
    expect(text("group-buy-member-pay")).toBe("pay_line");
  });

  it("leaving is a real button, and the card links to all her groups", () => {
    panel();
    const cancel = screen.getByTestId("group-buy-member-cancel");
    expect(cancel.tagName).toBe("BUTTON");
    expect(cancel.className).toMatch(/border/); // an outlined button, not grey text
    expect(screen.getByTestId("group-buy-my-groups").getAttribute("href")).toBe("/my-group-buys");
  });

  it("past the deadline: no leave button and no «next» line, the link stays", () => {
    panel({}, false);
    expect(screen.queryByTestId("group-buy-member-cancel")).toBeNull();
    expect(text("group-buy-member-next")).toBeNull();
    expect(screen.getByTestId("group-buy-my-groups")).toBeTruthy();
  });
});
