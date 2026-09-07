import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AdminContentPage from "@/app/[locale]/admin/content/page";

// MEH-1456 chunk 2b — the reader half of the seeded-row guard. The backend
// refuses a rename/delete on `is_system` rows with a 422; this screen must say
// so BEFORE the admin types, and must not lock rows it has no flag for.
//
// Mirrors AdminContentCategoryRenameError.test.jsx (same mocks, same screen).
// The list deliberately mixes all three payload shapes, so every assertion
// below is a count over one render rather than three separate fixtures that
// could each be right about a different world.
const ROWS = [
  // seeded: `GET /admin/categories` serialises CategoryOut.is_system (chunk A)
  { id: 7, name: "חלב וגבינות", emoji: "🥛", producer_count: 3, is_system: true },
  // admin-created: the column default
  { id: 8, name: "קטגוריה שנוצרה באדמין", emoji: "🍓", producer_count: 0, is_system: false },
  // an older backend that does not serialise the field at all
  { id: 9, name: "קטגוריה בלי דגל", emoji: "🍇", producer_count: 1 },
];

const apiMock = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: [] })),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  put: vi.fn(() => Promise.resolve({ data: {} })),
  delete: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

vi.mock("next-intl", () => {
  const flat = {
    "admin.content.title": "תוכן",
    "admin.content.tabs.categories": "קטגוריות",
    "admin.content.tabs.about": "אודות",
    "admin.content.tabs.terms": "תקנון",
    "admin.content.categories.name_placeholder": "שם קטגוריה",
    "admin.content.categories.add": "+ הוסף",
    "admin.content.categories.empty": "אין נתונים להצגה",
    "admin.content.categories.save": "שמרו",
    "admin.content.categories.delete": "מחקו",
    "admin.content.categories.producer_count": "{count} בתי עסק",
    "admin.content.categories.system_badge": "קטגוריית מערכת",
    "admin.content.categories.system_hint":
      "השם והמחיקה של קטגוריית מערכת נקבעים בקוד ומשתנים במיגרציה, לא במסך הניהול.",
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
  };
});

const renderList = async () => {
  apiMock.get.mockImplementation((url) =>
    url === "/admin/categories" ? Promise.resolve({ data: ROWS }) : Promise.resolve({ data: [] }),
  );
  render(<AdminContentPage />);
  await screen.findByDisplayValue("חלב וגבינות");
};

describe("AdminContentPage — system category lock (MEH-1456 chunk 2b)", () => {
  beforeEach(() => {
    apiMock.get.mockClear();
    apiMock.put.mockClear();
    apiMock.delete.mockClear();
    toastMock.error.mockClear();
  });

  it("locks the system row's name field and leaves the other two editable", async () => {
    await renderList();
    // By display value, not by the testid this PR introduces: a testid-only
    // locator goes red against any implementation that names things
    // differently, which is not the same as going red against a wrong one.
    expect(screen.getByDisplayValue("חלב וגבינות")).toHaveAttribute("readonly");
    expect(screen.getByDisplayValue("קטגוריה שנוצרה באדמין")).not.toHaveAttribute(
      "readonly",
    );
    // The absent-field row is the one that decides `=== true` vs truthiness:
    // `undefined` must read as "not system", not as "unknown, so lock it".
    expect(screen.getByDisplayValue("קטגוריה בלי דגל")).not.toHaveAttribute("readonly");
  });

  it("shows the badge on the system row only, and swaps out its two actions", async () => {
    await renderList();
    // Counts over the whole list, not a per-row presence check: a regression
    // that badged every row would pass three separate getByTestId calls.
    expect(screen.getAllByText("קטגוריית מערכת")).toHaveLength(1);
    expect(screen.getAllByText("שמרו")).toHaveLength(2);
    expect(screen.getAllByText("מחקו")).toHaveLength(2);
    expect(screen.queryByTestId("category-save-7")).toBeNull();
    expect(screen.queryByTestId("category-delete-7")).toBeNull();
    expect(screen.getByTestId("category-save-8")).toBeInTheDocument();
    expect(screen.getByTestId("category-delete-9")).toBeInTheDocument();
  });

  it("says where the change belongs, on the badge and on the field", async () => {
    await renderList();
    const hint =
      "השם והמחיקה של קטגוריית מערכת נקבעים בקוד ומשתנים במיגרציה, לא במסך הניהול.";
    expect(screen.getByText("קטגוריית מערכת")).toHaveAttribute("title", hint);
    expect(screen.getByDisplayValue("חלב וגבינות")).toHaveAttribute("title", hint);
  });

  it("offers no control at all on the system row that could reach the API", async () => {
    await renderList();
    // `readOnly` is not the guarantee: fireEvent writes straight through it.
    // The guarantee is that the row carries no control that calls the API, so
    // the assertion counts BUTTONS IN THE ROW — 2 before this change, 0 after.
    //
    // The first version of this case clicked every button on screen and
    // asserted no PUT fired. It passed against the unfixed component too: the
    // section tabs come first in DOM order, so the very first click unmounted
    // the list and the remaining clicks landed on detached nodes. A green with
    // two causes, and the wrong one was supplying it.
    const systemRow = screen.getByDisplayValue("חלב וגבינות").closest("li");
    const editableRow = screen.getByDisplayValue("קטגוריה שנוצרה באדמין").closest("li");
    expect(within(systemRow).queryAllByRole("button")).toHaveLength(0);
    expect(within(editableRow).queryAllByRole("button")).toHaveLength(2);
  });

  it("still saves a non-system row", async () => {
    await renderList();
    // Scoped to the row, not `getAllByText(...)[0]`: an index into the whole
    // list means something different before and after this change, so an
    // index-based click would make a both-worlds regression guard depend on
    // the fix it is supposed to be independent of.
    const row = screen.getByDisplayValue("קטגוריה שנוצרה באדמין").closest("li");
    fireEvent.change(within(row).getByDisplayValue("קטגוריה שנוצרה באדמין"), {
      target: { value: "שם חדש ותקין" },
    });
    fireEvent.click(within(row).getByText("שמרו"));
    expect(apiMock.put).toHaveBeenCalledWith("/admin/categories/8", {
      name: "שם חדש ותקין",
    });
  });
});
