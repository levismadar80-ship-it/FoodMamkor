// MEH-3289 — a funded group buy still takes joiners until it is full or the
// deadline passes; MEH-3287 — a group the daily job cancelled after its
// deadline reads «the deadline passed», not «cancelled».
// Harness copied from GroupBuyGuestLogin.test.jsx; the group buy is mutable.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" }, loading: false }) }));
vi.mock("next-intl", () => ({ useLocale: () => "he", useTranslations: () => (key) => key }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "1 בינואר 2099" }));

const FUTURE = "2099-01-01T00:00:00";
const PAST = "2000-01-01T00:00:00";
const BASE = {
  id: "gb-1", title: "קבוצת רכישה לדוגמה", status: "open", deadline: FUTURE,
  min_participants: 2, max_participants: 4, commits_count: 0,
  price_per_unit_regular: 100, price_per_unit_group: 80,
  user_committed: false, user_commit: null,
};
const state = vi.hoisted(() => ({ gb: null }));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: state.gb })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

const show = async (over) => {
  state.gb = { ...BASE, ...over };
  render(<GroupBuyDetailClient id="gb-1" />);
  await screen.findByText("קבוצת רכישה לדוגמה", { selector: "h1" });
};
const joinButton = () => screen.queryByRole("button", { name: "submit_join" });

describe("joining a funded group buy (MEH-3289)", () => {
  it("funded with room: the join form is there", async () => {
    await show({ status: "funded", commits_count: 2 });
    expect(joinButton()).not.toBeNull();
    expect(screen.queryByTestId("group-buy-full")).toBeNull();
  });

  it("funded and full: no form, the full line instead", async () => {
    await show({ status: "funded", commits_count: 4 });
    expect(joinButton()).toBeNull();
    expect(screen.getByTestId("group-buy-full").textContent).toBe("full");
  });

  it("funded, no maximum: stays joinable", async () => {
    await show({ status: "funded", commits_count: 40, max_participants: null });
    expect(joinButton()).not.toBeNull();
  });

  it("funded past the deadline: no form", async () => {
    await show({ status: "funded", commits_count: 2, deadline: PAST });
    expect(joinButton()).toBeNull();
  });

  it("a participant of a funded group can still leave before the deadline", async () => {
    await show({ status: "funded", commits_count: 2, user_committed: true, user_commit: { quantity: 1 } });
    expect(screen.getByRole("button", { name: "cancel_cta" })).not.toBeNull();
    expect(screen.queryByTestId("group-buy-full")).toBeNull();
  });
});

describe("the count past the minimum (MEH-3289)", () => {
  it("shows the count alone once it passes the minimum", async () => {
    await show({ status: "funded", commits_count: 3 });
    expect(screen.getAllByText("progress_joined").length).toBeGreaterThan(0);
    expect(screen.queryByText("progress_label")).toBeNull();
  });

  it("at the minimum it still reads N of min", async () => {
    await show({ status: "funded", commits_count: 2 });
    expect(screen.queryByText("progress_joined")).toBeNull();
  });
});

describe("a group that missed its deadline (MEH-3287)", () => {
  it("cancelled after the deadline says the deadline passed, not cancelled", async () => {
    await show({ status: "cancelled", deadline: PAST });
    expect(screen.getByText("deadline_passed")).not.toBeNull();
    expect(screen.queryByText("cancelled")).toBeNull();
  });

  it("cancelled by the business before the deadline still says cancelled", async () => {
    await show({ status: "cancelled" });
    expect(screen.getByText("cancelled")).not.toBeNull();
    expect(screen.queryByText("deadline_passed")).toBeNull();
  });
});
