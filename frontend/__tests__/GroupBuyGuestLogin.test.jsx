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

// MEH-3130: the quantity chosen before «כניסה להצטרפות» survives the trip.
describe("GroupBuyDetailClient — guest quantity kept across sign-in (MEH-3130)", () => {
  it("a guest's quantity is kept, and restored (then cleared) once signed in", async () => {
    mockPush.mockClear();
    sessionStorage.clear();
    window.history.pushState({}, "", "/group-buys/gb-1");
    const { unmount } = render(<GroupBuyDetailClient id="gb-1" />);
    const qty = await screen.findByLabelText("quantity_label");
    fireEvent.change(qty, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "submit_login" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem("group_buy_draft_qty_gb-1")).toBe("3");
    unmount();

    auth.user = { id: "u-1" };
    try {
      render(<GroupBuyDetailClient id="gb-1" />);
      const back = await screen.findByLabelText("quantity_label");
      await waitFor(() => expect(back.value).toBe("3"));
      expect(sessionStorage.getItem("group_buy_draft_qty_gb-1")).toBeNull();
    } finally {
      auth.user = null;
      window.history.pushState({}, "", "/");
    }
  });
});
