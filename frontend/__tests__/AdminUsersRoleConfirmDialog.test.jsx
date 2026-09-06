import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminUsersPage from "@/app/[locale]/admin/users/page";

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
  useAdminAction: () => ({ run: vi.fn(), isBusy: () => adminAction.busy }),
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

const PROMPT = "את בטוחה שברצונך להעניק הרשאות אדמין למשתמשת 4?";

async function openConfirm() {
  render(<AdminUsersPage />);
  await screen.findByText("u4@example.com");
  fireEvent.click(screen.getByRole("button", { name: "העלי לאדמין" }));
  return screen.getByRole("dialog");
}

describe("admin/users — the role-confirm dialog (MEH-2268)", () => {
  beforeEach(() => {
    adminAction.busy = false;
    apiMock.get.mockClear();
  });

  it("is a dialog, is modal, and is named by its own copy", async () => {
    const dialog = await openConfirm();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Named THROUGH aria-labelledby, not by a duplicated aria-label: the id
    // has to resolve to the paragraph that actually carries the sentence, so
    // an accessible-name assertion covers the wiring and the copy at once.
    expect(dialog).toHaveAccessibleName(PROMPT);
    expect(dialog).toHaveAttribute("aria-labelledby", "role-confirm-title");
    expect(document.querySelector("#role-confirm-title")).toHaveTextContent(
      PROMPT,
    );
  });

  it("closes on Escape", async () => {
    await openConfirm();
    fireEvent.keyDown(globalThis, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("does NOT close on Escape while the role change is in flight", async () => {
    adminAction.busy = true;
    const dialog = await openConfirm();
    fireEvent.keyDown(globalThis, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBe(dialog);
    // control: the same keypress with a key that is not Escape is inert too,
    // so a listener that closed on ANY key would not read as a passing guard.
    fireEvent.keyDown(globalThis, { key: "a" });
    expect(screen.getByRole("dialog")).toBe(dialog);
  });

  it("«ביטול» still closes it, busy or not — the guard is on Escape, not on the button", async () => {
    await openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "ביטול" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
