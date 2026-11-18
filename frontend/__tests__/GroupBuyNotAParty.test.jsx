// MEH-3398 — the join card is where a buyer commits to an order through the
// site's own tools, so it carries the locked «not a party to the transaction»
// line (DirectoryDisclaimer) and its /terms link. Before this the line lived
// only on the business page.
// REUSES: frontend/__tests__/GroupBuyGuestLogin.test.jsx — same mocks.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";

const mockPush = vi.fn();
vi.mock("@/lib/constants", async (orig) => ({ ...(await orig()), BRAND_NAME: "מהמקור" }));
// MEH-2544: the page's business row is OwnerRow, which links via @/i18n/navigation.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// MEH-2982: signed OUT — the commit button must send her to /login and back.
// MEH-3130: mutable so one test can come back signed in.
const auth = vi.hoisted(() => ({ user: null }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: auth.user, loading: false }),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (key) => key,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/format-date", () => ({
  formatEventDate: () => "1 בינואר 2099",
}));

// An open, joinable group buy with a far-future deadline.
const OPEN_GB = {
  id: "gb-1",
  title: "קבוצת רכישה לדוגמה",
  status: "open",
  deadline: "2099-01-01T00:00:00Z",
  min_participants: 2,
  max_participants: 10,
  commits_count: 0,
  price_per_unit_regular: 100,
  price_per_unit_group: 80,
  user_committed: false,
  user_commit: null,
};

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: OPEN_GB })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

describe("GroupBuyDetailClient — not a party to the transaction (MEH-3398)", () => {
  it("the join card carries the disclaimer and its /terms link", async () => {
    render(<GroupBuyDetailClient id="gb-1" />);
    const card = await screen.findByTestId("group-buy-join-card");
    const note = within(card).getByRole("note");
    expect(note).toHaveTextContent("body");
    expect(within(note).getByRole("link", { name: "terms_link" })).toHaveAttribute("href", "/terms");
  });
});
