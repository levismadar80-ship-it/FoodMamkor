import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AdminReviewsPage from "@/app/[locale]/admin/reviews/page";

// MEH-1040: lifecycle tests for the review-delete confirm dialog that
// replaced native window.confirm() — the last admin surface with that
// pattern. Mirrors AdminContentCategoryDelete.test.jsx (MEH-1023 Ch.B):
// open-shows-names/no-DELETE · cancel · Escape · confirm→DELETE+close.

// vi.hoisted so the vi.fns exist before the hoisted vi.mock factory runs.
const apiMock = vi.hoisted(() => ({
  get: vi.fn((url) => {
    if (url === "/admin/reviews") {
      return Promise.resolve({
        data: [
          {
            id: 42,
            producer_name: "חוות הזית",
            user_name: "דנה",
            user_email: "dana@example.com",
            stars: 4,
            title: "מעולה",
            body: "טעים מאוד",
            created_at: "2026-07-01T10:00:00Z",
          },
        ],
      });
    }
    return Promise.resolve({ data: [] });
  }),
  delete: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

vi.mock("next-intl", () => {
  const flat = {
    "admin.reviews.title": "ביקורות",
    "admin.reviews.tooltip": "מידע",
    "admin.reviews.tooltip_label": "מידע על מודרציית ביקורות",
    "admin.reviews.count": "{filtered} מתוך {total}",
    "admin.reviews.search_placeholder": "חיפוש...",
    "admin.reviews.filter_aria": "סינון לפי דירוג",
    "admin.reviews.all_ratings": "כל הדירוגים",
    "admin.reviews.columns.producer": "עסק",
    "admin.reviews.columns.user": "משתמשת",
    "admin.reviews.columns.rating": "דירוג",
    "admin.reviews.columns.content": "תוכן",
    "admin.reviews.columns.date": "תאריך",
    "admin.reviews.columns.actions": "פעולות",
    "admin.reviews.loading": "טעינת ביקורות...",
    "admin.reviews.empty": "אין ביקורות להצגה",
    "admin.reviews.stars_aria": "{stars} כוכבים",
    "admin.reviews.delete_aria": "מחיקת הביקורת של {user}",
    "admin.reviews.confirm_delete": "למחוק את הביקורת של {user} על {producer}?",
    "admin.reviews.delete": "מחקי",
    "admin.reviews.deleting": "במחיקה...",
    "admin.reviews.deleted_toast": "הביקורת נמחקה",
    "admin.reviews.default_user": "משתמשת",
    "admin.reviews.default_producer": "העסק",
    "admin.common.cancel": "ביטול",
    "error.generic": "שגיאה",
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

describe("AdminReviewsPage — review delete dialog (MEH-1040)", () => {
  beforeEach(() => {
    apiMock.get.mockClear();
    apiMock.delete.mockClear();
    apiMock.delete.mockImplementation(() => Promise.resolve({}));
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });

  const openDialog = async () => {
    render(<AdminReviewsPage />);
    // Row renders after the reviews load resolves.
    await screen.findByText("חוות הזית");
    fireEvent.click(screen.getByText("מחקי")); // row delete button (only one pre-dialog)
    return screen.getByRole("dialog");
  };

  it("opens the modal with reviewer + business names and fires no DELETE yet", async () => {
    const dialog = await openDialog();
    expect(
      within(dialog).getByText("למחוק את הביקורת של דנה על חוות הזית?"),
    ).toBeInTheDocument();
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

  it("confirm fires DELETE with the id, closes, and removes the row", async () => {
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByText("מחקי")); // confirm button inside the dialog
    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith("/reviews/42"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Optimistic removal — the row is gone without a re-fetch.
    expect(screen.queryByText("חוות הזית")).not.toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });

  it("on DELETE failure shows an error toast and keeps the dialog open", async () => {
    apiMock.delete.mockImplementationOnce(() => Promise.reject(new Error("500")));
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByText("מחקי"));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // stays open on failure
  });
});
