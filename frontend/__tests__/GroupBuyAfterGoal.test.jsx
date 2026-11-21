// MEH-3588 (Sapir 21/11): what a visitor reads once a group buy reaches its
// goal — that joining is still open, how many places are left, and that the
// minimum counts participants. Matrix: 0 / 1 / many joined × open / funded /
// full / expired, with and without a maximum.
// Harness copied from GroupBuyJoinUntilMax.test.jsx; params are appended to the
// key so a test can read the number that was passed.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";
import { groupBuyGoalReached, groupBuySpotsLeft } from "@/lib/group-buy-progress";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" }, loading: false }) }));
vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (key, p) => (p ? `${key} ${Object.values(p).join(" ")}` : key),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "1 בינואר 2099" }));

const FUTURE = "2099-01-01T00:00:00";
const PAST = "2000-01-01T00:00:00";
const BASE = {
  id: "gb-1", title: "קבוצת רכישה לדוגמה", status: "open", deadline: FUTURE,
  min_participants: 2, max_participants: 5, commits_count: 0, unit: "ק\"ג",
  price_per_unit_regular: 18, price_per_unit_group: 13, producer_name: "טחנת אבן",
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
const text = (id) => screen.queryByTestId(id)?.textContent ?? null;
const howLines = () => [...(screen.queryByTestId("group-buy-how")?.querySelectorAll("li") ?? [])].map((li) => li.lastElementChild.textContent);

describe("helpers", () => {
  it("goal is reached at the minimum, not only past it", () => {
    expect(groupBuyGoalReached(1, 2)).toBe(false);
    expect(groupBuyGoalReached(2, 2)).toBe(true);
    expect(groupBuyGoalReached(3, 2)).toBe(true);
    expect(groupBuyGoalReached(0, 0)).toBe(false);
  });
  it("places left: null without a maximum, never negative", () => {
    expect(groupBuySpotsLeft(3, null)).toBeNull();
    expect(groupBuySpotsLeft(3, undefined)).toBeNull();
    expect(groupBuySpotsLeft(3, 5)).toBe(2);
    expect(groupBuySpotsLeft(7, 5)).toBe(0);
  });
});

describe("goal line", () => {
  it("0 joined, open: «עוד N», no goal line, places shown", async () => {
    await show({ commits_count: 0 });
    expect(screen.getAllByText("remaining_to_open 2").length).toBeGreaterThan(0);
    expect(text("group-buy-goal-reached")).toBeNull();
    expect(text("group-buy-spots-left")).toBe("spots_left 5");
  });

  it("1 joined, open: still N of min", async () => {
    await show({ commits_count: 1 });
    expect(screen.getAllByText("progress_label 1 2").length).toBeGreaterThan(0);
    expect(text("group-buy-goal-reached")).toBeNull();
  });

  it("at the goal, funded: goal line + the count alone + places left", async () => {
    await show({ status: "funded", commits_count: 2 });
    expect(text("group-buy-goal-reached")).toBe("goal_reached");
    expect(screen.getAllByText("progress_joined 2").length).toBeGreaterThan(0);
    expect(text("group-buy-spots-left")).toBe("spots_left 3");
  });

  it("many joined, no maximum: goal line, no places line", async () => {
    await show({ status: "funded", commits_count: 9, max_participants: null });
    expect(text("group-buy-goal-reached")).toBe("goal_reached");
    expect(text("group-buy-spots-left")).toBeNull();
  });

  it("full: no goal line, no places line, the full message", async () => {
    await show({ status: "funded", commits_count: 5 });
    expect(text("group-buy-full")).toBe("full");
    expect(text("group-buy-spots-left")).toBeNull();
    expect(text("group-buy-goal-reached")).toBe("goal_reached");
  });

  it("expired after the goal: no goal line, no places", async () => {
    await show({ status: "funded", commits_count: 3, deadline: PAST });
    expect(text("group-buy-goal-reached")).toBeNull();
    expect(text("group-buy-spots-left")).toBeNull();
  });
});

describe("funded banner", () => {
  it("a visitor who can still join is told so (with a maximum)", async () => {
    await show({ status: "funded", commits_count: 2 });
    expect(text("group-buy-funded")).toContain("funded_subtitle_join_max");
    expect(text("group-buy-funded")).not.toContain("funded_subtitle ");
  });

  it("without a maximum, the plain «still join» line", async () => {
    await show({ status: "funded", commits_count: 2, max_participants: null });
    expect(text("group-buy-funded")).toContain("funded_subtitle_join");
    expect(text("group-buy-funded")).not.toContain("funded_subtitle_join_max");
  });

  it("a participant still reads «contact the business»", async () => {
    await show({ status: "funded", commits_count: 2, user_committed: true, user_commit: { quantity: 1 } });
    expect(text("group-buy-funded")).toContain("funded_subtitle טחנת אבן");
  });

  it("full: the visitor is not told she can join", async () => {
    await show({ status: "funded", commits_count: 5 });
    expect(text("group-buy-funded")).not.toContain("funded_subtitle_join");
  });
});

describe("how it works", () => {
  it("open: join, unlock, keeps filling to the maximum, no commitment", async () => {
    await show({ commits_count: 1 });
    expect(howLines()).toEqual(["how_join", "how_unlock 2", "how_after_goal_max 5", "how_no_commit"]);
  });

  it("funded and joinable: stays, says the price is already open", async () => {
    await show({ status: "funded", commits_count: 3, max_participants: null });
    expect(howLines()).toEqual(["how_join", "how_funded_price", "how_after_goal"]);
  });

  it("full or expired: gone", async () => {
    await show({ status: "funded", commits_count: 5 });
    expect(howLines()).toEqual([]);
  });
});

describe("quantity label", () => {
  it("names the unit when there is one", async () => {
    await show({ commits_count: 1 });
    expect(screen.getByLabelText("quantity_label_unit ק\"ג")).not.toBeNull();
  });
  it("plain without a unit", async () => {
    await show({ commits_count: 1, unit: null });
    expect(screen.getByLabelText("quantity_label")).not.toBeNull();
  });
});
