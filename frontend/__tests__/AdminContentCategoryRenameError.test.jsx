import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminContentPage from "@/app/[locale]/admin/content/page";

// MEH-1589: the MEH-1571 update_category guards return 422 with an approved
// Hebrew detail string, but the rename path had no error callback — a blocked
// save looked like a dead button. These tests lock the wiring: backend detail
// renders via the screen's existing toast surface; a detail-less failure
// falls back to the generic save_error key, never a silent no-op.
// Mirrors AdminContentCategoryDelete.test.jsx (same mocks, same screen).

const LICENSE_DETAIL =
  "לקטגוריה הזאת יש דרישת רישיון של משרד הבריאות שמזוהה לפי השם. " +
  "שינוי השם מבטל את הדרישה עבור בתי העסק בקטגוריה, ולכן הוא נעשה במיגרציה " +
  "ולא במסך הניהול. אפשר לעדכן את האימוג'י.";
const NAME_TAKEN_DETAIL = "קטגוריה בשם זה כבר קיימת";

const apiMock = vi.hoisted(() => ({
  get: vi.fn((url) => {
    if (url === "/admin/categories") {
      return Promise.resolve({
        data: [{ id: 7, name: "חלב וגבינות", emoji: null, producer_count: 3 }],
      });
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
    "admin.content.categories.producer_count": "{count} בתי עסק",
    "admin.content.categories.save_error": "שמירת הקטגוריה נכשלה. נסו שוב.",
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

// Rejection shaped like the axios error the api client throws for a 422.
const reject422 = (detail) => () =>
  Promise.reject(Object.assign(new Error("422"), { response: { data: { detail } } }));

const renameTo = async (newName) => {
  render(<AdminContentPage />);
  const input = await screen.findByDisplayValue("חלב וגבינות");
  fireEvent.change(input, { target: { value: newName } });
  fireEvent.click(screen.getByText("שמרו"));
};

describe("AdminContentPage — category rename error surfacing (MEH-1589)", () => {
  beforeEach(() => {
    apiMock.put.mockClear();
    apiMock.put.mockImplementation(() => Promise.resolve({ data: {} }));
    apiMock.get.mockClear();
    toastMock.error.mockClear();
  });

  it("renders the backend license-rename detail when the guard blocks", async () => {
    apiMock.put.mockImplementationOnce(reject422(LICENSE_DETAIL));
    await renameTo("שם חדש");
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(LICENSE_DETAIL));
  });

  it("renders the backend duplicate-name detail when the name is taken", async () => {
    apiMock.put.mockImplementationOnce(reject422(NAME_TAKEN_DETAIL));
    await renameTo("קטגוריה קיימת");
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(NAME_TAKEN_DETAIL));
  });

  it("falls back to the generic save error when the body has no string detail", async () => {
    // FastAPI validation errors carry a LIST detail; network errors none at all.
    apiMock.put.mockImplementationOnce(reject422([{ msg: "value_error" }]));
    await renameTo("שם אחר");
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("שמירת הקטגוריה נכשלה. נסו שוב."),
    );
  });

  it("a successful rename fires PUT and reloads, with no error toast", async () => {
    await renameTo("שם תקין");
    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith("/admin/categories/7", { name: "שם תקין" }),
    );
    await waitFor(() => expect(apiMock.get.mock.calls.length).toBeGreaterThan(1));
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
