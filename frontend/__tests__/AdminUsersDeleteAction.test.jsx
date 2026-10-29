import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminUsersPage from "@/app/[locale]/admin/users/page";

// MEH-2585 — «מחיקה» in the /admin/users row menu: who gets it, what the
// confirm says, and that confirming calls DELETE /admin/users/{id}.
// (Harness copied from AdminUsersRoleConfirmDialog.test.jsx, MEH-2268.)
//
// Original header of the copied harness:
// MEH-2268 — the /admin/users role-confirm modal's a11y contract.
//
// admin/reviews/page.jsx and admin/content/page.js each carry a code comment
// saying they MIRROR this dialog. Both of them had role="dialog" +
// aria-modal="true" + aria-labelledby and an Escape close; the original had
// none of it. The copies were improved and the source was not, so a screen
// reader announced nothing here.
//
// These cases are the runnable half of the guard. The 12e Playwright spec
// covers the same contract end-to-end, but it needs a build and a server, and
// a contract this small deserves a check that reds in two seconds.

const USERS = [
  {
    id: "adm",
    name: "אדמינית",
    email: "other-admin@example.com",
    city: null,
    role: "admin",
    is_blocked: false,
    favorites_count: 0,
    created_at: "2026-07-01T10:00:00",
  },
  {
    id: "sup",
    name: "Smadar Levi",
    email: "levismadar80@gmail.com",
    city: null,
    role: "producer",
    is_blocked: false,
    favorites_count: 0,
    created_at: "2026-07-01T10:00:00",
  },
  {
    id: "u1",
    name: "משתמשת 4",
    email: "u4@example.com",
    city: "תל אביב",
    role: "consumer",
    is_blocked: false,
    favorites_count: 0,
    created_at: "2026-07-01T10:00:00",
  },
];

const apiMock = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: USERS })),
  put: vi.fn(() => Promise.resolve({})),
  post: vi.fn(() => Promise.resolve({})),
  delete: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "me", email: "admin@example.com", role: "admin" },
  }),
}));

// `busy` is flipped per test to exercise the Escape guard. `run` is a no-op:
// nothing here asserts the PUT, only the dialog's dismissal contract.
const adminAction = vi.hoisted(() => ({ busy: false }));
vi.mock("@/lib/use-admin-action", () => ({
  useAdminAction: () => ({
    run: (_key, fn) => fn(),
    isBusy: () => adminAction.busy,
  }),
}));

// The real kebab is a portaled menu with its own keyboard contract (MEH-2267);
// here it is reduced to plain buttons that fire the items' own onSelect, which
// is the only part this file needs — the confirm dialog is opened by an item.
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

vi.mock("next-intl", () => {
  const flat = {
    "admin.users.title": "משתמשים",
    "admin.users.count": "{count} משתמשים",
    "admin.users.search_placeholder": "חיפוש...",
    "admin.users.role_filter.all": "כל התפקידים",
    "admin.users.columns.name": "שם",
    "admin.users.columns.email": "אימייל",
    "admin.users.columns.city": "עיר",
    "admin.users.columns.role": "תפקיד",
    "admin.users.columns.favorites": "מועדפים",
    "admin.users.columns.joined": "הצטרפות",
    "admin.users.columns.actions": "פעולות",
    "admin.users.empty": "אין משתמשים",
    "admin.users.roles.consumer": "צרכנית",
    "admin.users.roles.admin": "אדמין",
    "admin.users.actions.block": "חסום",
    "admin.users.actions.promote": "העלי לאדמין",
    "admin.users.actions.demote": "הסירי הרשאות",
    "admin.users.actions.menu_aria": "פעולות נוספות",
    "admin.users.actions.delete": "מחיקה",
    "admin.users.confirm.delete":
      'למחוק את "{name}" ({email})? יימחקו גם בית העסק, המועדפים והביקורות שלו. פעולה זו אינה הפיכה.',
    "admin.users.roles.producer": "בית עסק",
    "admin.users.roles.admin_protected": "אדמין ראשי",
    "admin.users.actions.protected_title": "מוגן",
    "admin.users.confirm.promote":
      "את בטוחה שברצונך להעניק הרשאות אדמין ל{name}?",
    "admin.users.confirm.demote":
      "את בטוחה שברצונך להסיר הרשאות אדמין מ{name}?",
    "admin.users.confirm.submitting": "...",
    "admin.users.confirm.confirm": "אישור",
    "admin.users.pagination.page_size": "שורות בעמוד",
    "admin.users.pagination.prev": "הקודם",
    "admin.users.pagination.next": "הבא",
    "admin.users.pagination.page_of": "עמוד {page} מתוך {total}",
    "admin.common.search": "חיפוש",
    "admin.common.cancel": "ביטול",
    "admin.common.loading_f": "בטעינה...",
  };
  const resolve = (fullKey, values) => {
    const raw = flat[fullKey] ?? fullKey;
    if (!values) return raw;
    let s = raw;
    for (const [key, val] of Object.entries(values))
      s = s.replaceAll(`{${key}}`, val);
    return s;
  };
  return {
    useTranslations:
      (scope) =>
      (key, values = {}) =>
        resolve(`${scope}.${key}`, values),
    useLocale: () => "he",
  };
});

const DELETE_PROMPT =
  'למחוק את "משתמשת 4" (u4@example.com)? יימחקו גם בית העסק, המועדפים והביקורות שלו. פעולה זו אינה הפיכה.';

describe("admin users — delete action (MEH-2585)", () => {
  beforeEach(() => {
    adminAction.busy = false;
    apiMock.delete.mockClear();
  });

  it("offers «מחיקה» only on the non-admin, non-protected row", async () => {
    render(<AdminUsersPage />);
    await screen.findByText("u4@example.com");
    // 3 rows: admin, protected super-admin, consumer → exactly one delete item.
    expect(screen.getAllByRole("button", { name: "מחיקה" })).toHaveLength(1);
  });

  it("confirm names the user and email, and confirming calls DELETE", async () => {
    render(<AdminUsersPage />);
    await screen.findByText("u4@example.com");
    fireEvent.click(screen.getByRole("button", { name: "מחיקה" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(DELETE_PROMPT);
    expect(apiMock.delete).not.toHaveBeenCalled();

    // The dialog's own confirm button carries the same label as the item.
    const confirmBtn = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "מחיקה",
    );
    fireEvent.click(confirmBtn);
    await waitFor(() =>
      expect(apiMock.delete).toHaveBeenCalledWith("/admin/users/u1"),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cancel closes the dialog without deleting", async () => {
    render(<AdminUsersPage />);
    await screen.findByText("u4@example.com");
    fireEvent.click(screen.getByRole("button", { name: "מחיקה" }));
    fireEvent.click(screen.getByRole("button", { name: "ביטול" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(apiMock.delete).not.toHaveBeenCalled();
  });
});
