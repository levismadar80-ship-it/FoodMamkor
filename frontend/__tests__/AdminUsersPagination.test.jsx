import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminUsersPage from "@/app/[locale]/admin/users/page";

// MEH-1046: client-side pagination on /admin/users — slice correctness,
// page reset on filter change, bounds disabling. The fetch stays a single
// full load; filters are server-side, so pagination slices `users` directly.

const USERS = Array.from({ length: 60 }, (_, i) => ({
  id: `u${i + 1}`,
  name: `משתמש ${i + 1}`,
  email: `user${i + 1}@example.com`,
  city: "תל אביב",
  role: "consumer",
  is_blocked: false,
  favorites_count: 0,
  created_at: "2026-07-01T10:00:00",
}));

const apiMock = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: USERS })),
  put: vi.fn(() => Promise.resolve({})),
  post: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "me", email: "admin@example.com", role: "admin" } }),
}));
vi.mock("@/lib/use-admin-action", () => ({
  useAdminAction: () => ({ run: vi.fn(), isBusy: () => false }),
}));
vi.mock("@/components/admin/AdminRowMenu", () => ({
  default: () => <span data-testid="row-menu" />,
}));
vi.mock("@phosphor-icons/react", () => ({
  Heart: (props) => <span {...props} />,
  Lock: (props) => <span {...props} />,
}));

vi.mock("next-intl", () => {
  const flat = {
    "admin.users.title": "משתמשים",
    "admin.users.count": "{count} משתמשים",
    "admin.users.search_placeholder": "חיפוש...",
    "admin.users.role_filter.all": "כל התפקידים",
    "admin.users.role_filter.consumer": "צרכניות",
    "admin.users.role_filter.producer": "בתי עסק",
    "admin.users.role_filter.admin": "אדמין",
    "admin.users.columns.name": "שם",
    "admin.users.columns.email": "אימייל",
    "admin.users.columns.city": "עיר",
    "admin.users.columns.role": "תפקיד",
    "admin.users.columns.favorites": "מועדפים",
    "admin.users.columns.joined": "הצטרפות",
    "admin.users.columns.actions": "פעולות",
    "admin.users.empty": "אין משתמשים",
    "admin.users.roles.consumer": "צרכנית",
    "admin.users.roles.producer": "בית עסק",
    "admin.users.roles.admin": "אדמין",
    "admin.users.actions.block": "חסום",
    "admin.users.actions.unblock": "בטל חסימה",
    "admin.users.actions.menu_aria": "פעולות נוספות",
    "admin.users.pagination.page_size": "שורות בעמוד",
    "admin.users.pagination.prev": "הקודם",
    "admin.users.pagination.next": "הבא",
    "admin.users.pagination.page_of": "עמוד {page} מתוך {total}",
    "admin.common.search": "חיפוש",
    "admin.common.cancel": "ביטול",
  };
  const resolve = (fullKey, values) => {
    const raw = flat[fullKey] ?? fullKey;
    if (!values || Object.keys(values).length === 0) return raw;
    let s = raw;
    for (const [k, v] of Object.entries(values)) s = s.replaceAll(`{${k}}`, v);
    return s;
  };
  return {
    useTranslations: (scope) => (key, values = {}) =>
      resolve(scope ? `${scope}.${key}` : key, values),
    useLocale: () => "he",
  };
});

const rowCount = () => screen.getAllByText(/^user\d+@example\.com$/).length;

describe("AdminUsersPage — client-side pagination (MEH-1046)", () => {
  beforeEach(() => {
    apiMock.get.mockClear();
    apiMock.get.mockImplementation(() => Promise.resolve({ data: USERS }));
  });

  const renderPage = async () => {
    render(<AdminUsersPage />);
    await screen.findByText("user1@example.com");
  };

  it("renders only the first 25 rows by default, with prev disabled", async () => {
    await renderPage();
    expect(rowCount()).toBe(25);
    expect(screen.getByText("user1@example.com")).toBeInTheDocument();
    expect(screen.queryByText("user26@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("עמוד 1 מתוך 3")).toBeInTheDocument();
    expect(screen.getByText("הקודם")).toBeDisabled();
    expect(screen.getByText("הבא")).not.toBeDisabled();
    // header count shows the full total, not the page slice
    expect(screen.getByText("60 משתמשים")).toBeInTheDocument();
  });

  it("next advances the slice; next disabled on the last page", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("הבא"));
    expect(screen.getByText("user26@example.com")).toBeInTheDocument();
    expect(screen.queryByText("user1@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("עמוד 2 מתוך 3")).toBeInTheDocument();
    fireEvent.click(screen.getByText("הבא"));
    expect(screen.getByText("עמוד 3 מתוך 3")).toBeInTheDocument();
    expect(rowCount()).toBe(10); // 60 - 50
    expect(screen.getByText("הבא")).toBeDisabled();
    fireEvent.click(screen.getByText("הקודם"));
    expect(screen.getByText("עמוד 2 מתוך 3")).toBeInTheDocument();
  });

  it("page-size change re-slices and resets to page 1", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("הבא")); // page 2
    fireEvent.change(screen.getByDisplayValue("25"), { target: { value: "50" } });
    expect(screen.getByText("עמוד 1 מתוך 2")).toBeInTheDocument();
    expect(rowCount()).toBe(50);
  });

  it("role filter change refetches and resets to page 1", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("הבא")); // page 2
    expect(screen.getByText("עמוד 2 מתוך 3")).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("כל התפקידים"), { target: { value: "consumer" } });
    await waitFor(() => expect(screen.getByText("עמוד 1 מתוך 3")).toBeInTheDocument());
    expect(screen.getByText("user1@example.com")).toBeInTheDocument();
  });

  it("search submit resets to page 1", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("הבא")); // page 2
    fireEvent.keyDown(screen.getByPlaceholderText("חיפוש..."), { key: "Enter" });
    await waitFor(() => expect(screen.getByText("עמוד 1 מתוך 3")).toBeInTheDocument());
  });

  it("single-page result set renders controls with both bounds disabled", async () => {
    apiMock.get.mockImplementation(() => Promise.resolve({ data: USERS.slice(0, 5) }));
    await renderPage();
    expect(rowCount()).toBe(5);
    expect(screen.getByText("עמוד 1 מתוך 1")).toBeInTheDocument();
    expect(screen.getByText("הקודם")).toBeDisabled();
    expect(screen.getByText("הבא")).toBeDisabled();
  });

  it("empty result set shows the empty row and no pagination controls", async () => {
    apiMock.get.mockImplementation(() => Promise.resolve({ data: [] }));
    render(<AdminUsersPage />);
    await screen.findByText("אין משתמשים");
    expect(screen.queryByText("הקודם")).not.toBeInTheDocument();
    expect(screen.queryByText("הבא")).not.toBeInTheDocument();
  });
});
