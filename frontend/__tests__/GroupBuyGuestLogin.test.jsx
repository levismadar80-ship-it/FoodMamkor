// MEH-2982 — a guest tapping the join button on a group buy goes to /login
// WITH a redirect back to the group buy. Before the fix it was a bare "/login",
// so after signing in she landed on "/" and had to find the group buy again.
// Mocks copied from GroupBuyCommit422.test.jsx; useAuth answers "signed out".
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";

const mockPush = vi.fn();
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
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false }),
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

describe("GroupBuyDetailClient — guest join (MEH-2982)", () => {
  it("sends the guest to /login with a redirect back to this group buy", async () => {
    window.history.pushState({}, "", "/group-buys/gb-1");
    render(<GroupBuyDetailClient id="gb-1" />);
    const submit = await screen.findByRole("button", { name: "submit_login" });
    fireEvent.click(submit);
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith("/login?redirect=%2Fgroup-buys%2Fgb-1");
  });

  it("an English reader goes to the English login page", async () => {
    mockPush.mockClear();
    window.history.pushState({}, "", "/en/group-buys/gb-1");
    render(<GroupBuyDetailClient id="gb-1" />);
    const [submit] = await screen.findAllByRole("button", { name: "submit_login" });
    fireEvent.click(submit);
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith("/en/login?redirect=%2Fen%2Fgroup-buys%2Fgb-1");
    window.history.pushState({}, "", "/");
  });
});
