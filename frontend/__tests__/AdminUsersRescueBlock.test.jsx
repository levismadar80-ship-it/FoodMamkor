import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import heMessages from "@/messages/he.json";
import AdminUsersPage from "@/app/[locale]/admin/users/page";

// MEH-3226 (D4 of the 14/11 grill retro) — a buyer blocked from rescue bags
// after two no-shows is visible on /admin/users, and «שחרור חסימת סלים» in
// her row menu releases the block. Cells: 0 blocked rows / 1 / many, and the
// badge count follows the server's number. Copy read from the real he.json,
// so a drift from the approved strings goes red here.
// (Harness shape from AdminUsersDeleteAction.test.jsx, MEH-2585.)

const row = (over) => ({
  name: "משתמשת",
  city: null,
  role: "consumer",
  is_blocked: false,
  favorites_count: 0,
  rescue_active_no_shows: 0,
  rescue_blocked: false,
  created_at: "2026-07-01T10:00:00",
  ...over,
});

let USERS = [];
const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(() => Promise.resolve({})),
  post: vi.fn(() => Promise.resolve({})),
  delete: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "me", email: "admin@example.com", role: "admin" } }),
}));

vi.mock("@/lib/use-admin-action", () => ({
  useAdminAction: () => ({ run: (_key, fn) => fn(), isBusy: () => false }),
}));

vi.mock("@/components/admin/AdminRowMenu", () => ({
  default: ({ items = [] }) => (
    <>
      {items.map((it) => (
        <button key={it.key} type="button" onClick={it.onSelect}>
          {it.label}
        </button>
      ))}
    </>
  ),
}));
vi.mock("@phosphor-icons/react", () => ({
  Heart: (props) => <span {...props} />,
  Lock: (props) => <span {...props} />,
}));

function lookup(key) {
  return key.split(".").reduce((o, k) => (o == null ? o : o[k]), heMessages);
}

vi.mock("next-intl", () => ({
  useTranslations:
    (scope) =>
    (key, values = {}) => {
      let s = lookup(`${scope}.${key}`) ?? `${scope}.${key}`;
      if (typeof s !== "string") return `${scope}.${key}`;
      for (const [k, v] of Object.entries(values)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
  useLocale: () => "he",
}));

const RELEASE = "שחרור חסימת סלים";

describe("admin users — rescue-bag block (MEH-3226)", () => {
  beforeEach(() => {
    apiMock.get.mockImplementation(() => Promise.resolve({ data: USERS }));
    apiMock.post.mockClear();
    toastMock.success.mockClear();
  });

  it("the approved copy is what he.json carries", () => {
    expect(lookup("admin.users.actions.clear_rescue_block")).toBe(RELEASE);
    expect(lookup("admin.users.rescue.blocked_badge")).toBe("חסומה לסלים ({count} אי-הגעות)");
    expect(lookup("admin.users.rescue.cleared")).toBe("החסימה שוחררה");
  });

  it("0 blocked rows: no badge, no release item", async () => {
    USERS = [row({ id: "a", email: "a@example.com" }), row({ id: "b", email: "b@example.com" })];
    render(<AdminUsersPage />);
    await screen.findByText("a@example.com");
    expect(screen.queryByTestId("admin-user-rescue-blocked")).toBeNull();
    expect(screen.queryByRole("button", { name: RELEASE })).toBeNull();
  });

  it("1 blocked row: badge reads the approved text and only her row has the item", async () => {
    USERS = [
      row({ id: "a", email: "a@example.com" }),
      row({ id: "b", email: "b@example.com", rescue_active_no_shows: 2, rescue_blocked: true }),
    ];
    render(<AdminUsersPage />);
    await screen.findByText("b@example.com");
    const badges = screen.getAllByTestId("admin-user-rescue-blocked");
    expect(badges.map((b) => b.textContent)).toEqual(["חסומה לסלים (2 אי-הגעות)"]);
    expect(screen.getAllByRole("button", { name: RELEASE })).toHaveLength(1);
  });

  it("many blocked rows: one badge and one item each, count from the server", async () => {
    USERS = [
      row({ id: "a", email: "a@example.com", rescue_active_no_shows: 3, rescue_blocked: true }),
      row({ id: "b", email: "b@example.com", rescue_active_no_shows: 2, rescue_blocked: true }),
      row({ id: "c", email: "c@example.com", rescue_active_no_shows: 1 }),
    ];
    render(<AdminUsersPage />);
    await screen.findByText("c@example.com");
    expect(screen.getAllByTestId("admin-user-rescue-blocked").map((b) => b.textContent)).toEqual([
      "חסומה לסלים (3 אי-הגעות)",
      "חסומה לסלים (2 אי-הגעות)",
    ]);
    expect(screen.getAllByRole("button", { name: RELEASE })).toHaveLength(2);
  });

  it("the item releases the block, toasts, and reloads the list", async () => {
    USERS = [row({ id: "b", email: "b@example.com", rescue_active_no_shows: 2, rescue_blocked: true })];
    render(<AdminUsersPage />);
    await screen.findByText("b@example.com");
    const loadsBefore = apiMock.get.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: RELEASE }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith("/admin/rescue/users/b/clear-block"),
    );
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("החסימה שוחררה"));
    await waitFor(() => expect(apiMock.get.mock.calls.length).toBeGreaterThan(loadsBefore));
  });
});
