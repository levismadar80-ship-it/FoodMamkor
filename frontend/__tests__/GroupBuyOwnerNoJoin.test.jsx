/**
 * MEH-3691 — the business's own account sees no join form on its group buy
 * (the commit route refuses it with 403); any other signed-in user does.
 *
 * Cells: owner / another business's owner / consumer × open group with room,
 * and owner / consumer × full group (the waitlist panel).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));
const auth = { user: null };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: auth.user, loading: false }) }));
vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: (ns) => (key) => `${ns}.${key}`,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "1 בינואר 2099", formatDate: () => "1 בינואר 2099" }));
vi.mock("@/lib/use-user-city", () => ({ useUserCity: () => ({ city: null }) }));

const GB = {
  id: "gb-1",
  producer_id: "p-1",
  producer_name: "מאפיית שקד",
  title: "מארז לחמים",
  status: "open",
  deadline: "2099-01-01T00:00:00Z",
  min_participants: 5,
  max_participants: null,
  commits_count: 1,
  price_per_unit_regular: "100.00",
  price_per_unit_group: "80.00",
  user_committed: false,
  user_commit: null,
};
const fixture = { gb: GB };
const get = vi.fn((url) =>
  url === "/group-buys/gb-1"
    ? Promise.resolve({ data: fixture.gb })
    : Promise.reject(new Error(`unexpected GET ${url}`)),
);
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a), post: vi.fn(), delete: vi.fn() } }));

async function joinButtons() {
  render(<GroupBuyDetailClient id="gb-1" />);
  // The share button renders for every viewer once the group loaded; gate on it.
  await waitFor(() => expect(screen.getByTestId("group-buy-share")).toBeTruthy());
  return screen.queryAllByText("group_buys.detail.submit_join").length;
}

describe("MEH-3691 — no join form for the business's own account", () => {
  beforeEach(() => {
    get.mockClear();
    fixture.gb = GB;
  });

  it("the owner sees no join button", async () => {
    auth.user = { id: "u-1", producer_id: "p-1" };
    expect(await joinButtons()).toBe(0);
  });

  it("another business's owner sees the join button", async () => {
    auth.user = { id: "u-2", producer_id: "p-2" };
    expect(await joinButtons()).toBe(1);
  });

  it("a consumer sees the join button", async () => {
    auth.user = { id: "u-3", producer_id: null };
    expect(await joinButtons()).toBe(1);
  });

  it("the owner sees no waitlist on her full group", async () => {
    fixture.gb = { ...GB, max_participants: 1, commits_count: 1 };
    auth.user = { id: "u-1", producer_id: "p-1" };
    await joinButtons();
    expect(screen.queryAllByTestId("group-buy-waitlist")).toHaveLength(0);
  });

  it("a consumer sees the waitlist on a full group", async () => {
    fixture.gb = { ...GB, max_participants: 1, commits_count: 1 };
    auth.user = { id: "u-3", producer_id: null };
    await joinButtons();
    expect(screen.queryAllByTestId("group-buy-waitlist")).toHaveLength(1);
  });
});
