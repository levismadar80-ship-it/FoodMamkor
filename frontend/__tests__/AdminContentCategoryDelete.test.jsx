import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AdminContentPage from "@/app/[locale]/admin/content/page";

// MEH-1023 Chunk B: lifecycle tests for the category-delete confirm dialog
// that replaced native confirm(). Mirrors AdminRowMenu.test.jsx (Chunk A):
// open on delete click · cancel = no DELETE · confirm = DELETE + close + reload.

// vi.hoisted so the vi.fns exist before the hoisted vi.mock factory runs.
const apiMock = vi.hoisted(() => ({
  get: vi.fn((url) => {
    if (url === "/admin/categories") {
      return Promise.resolve({ data: [{ id: 7, name: "חלב וגבינות", emoji: null }] });
    }
    return Promise.resolve({ data: [] });
  }),
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
    "admin.content.categories.confirm_delete": "למחוק את הקטגוריה '{name}'?",
    "admin.content.categories.deleting": "מוחקים…",
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

describe("AdminContentPage — category delete dialog (MEH-1023 Chunk B)", () => {
  beforeEach(() => {
    apiMock.get.mockClear();
    apiMock.delete.mockClear();
    apiMock.delete.mockImplementation(() => Promise.resolve({}));
    toastMock.error.mockClear();
  });

  const openDialog = async () => {
    render(<AdminContentPage />);
    // Row renders after the categories load resolves.
    await screen.findByDisplayValue("חלב וגבינות");
    fireEvent.click(screen.getByText("מחקו")); // row delete button (only one pre-dialog)
    return screen.getByRole("dialog");
  };

  it("opens the modal with the category name and fires no DELETE yet", async () => {
    const dialog = await openDialog();
    expect(within(dialog).getByText("למחוק את הקטגוריה 'חלב וגבינות'?")).toBeInTheDocument();
    expect(apiMock.delete).not.toHaveBeenCalled();
  });

  it("cancel closes the dialog and fires no DELETE", async () => {
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByText("ביטול"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiMock.delete).not.toHaveBeenCalled();
  });

  it("Escape closes the dialog and fires no DELETE", async () => {
    await openDialog();
    fireEvent.keyDown(globalThis, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiMock.delete).not.toHaveBeenCalled();
  });

  it("confirm fires DELETE with the id, closes, and reloads the list", async () => {
    const dialog = await openDialog();
    const getCallsBefore = apiMock.get.mock.calls.length;
    fireEvent.click(within(dialog).getByText("מחקו")); // confirm button inside the dialog
    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith("/admin/categories/7"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // load() re-fetches after a successful delete
    expect(apiMock.get.mock.calls.length).toBeGreaterThan(getCallsBefore);
  });

  it("on DELETE failure shows an error toast and keeps the dialog open", async () => {
    apiMock.delete.mockImplementationOnce(() => Promise.reject(new Error("500")));
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByText("מחקו"));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // stays open on failure
  });
});
