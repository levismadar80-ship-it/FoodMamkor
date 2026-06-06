/**
 * MEH-141 — CategoryRequestModal
 * Verifies: renders when open, submits POST, shows toast, closes.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

// MEH-475 PR-C4a chunk 3: mock next-intl per PR-A1/B precedent.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      title: "איזו קטגוריה חסרה?",
      name_placeholder: "שם הקטגוריה המוצעת *",
      name_example: "לדוגמה: משקאות מותססים",
      examples_placeholder: "דוגמאות למוצרים (אופציונלי)",
      examples_hint: "קומבוצ'ה, קפיר, וואטר קפיר...",
      submit: "שלחי בקשה",
      submit_loading: "שולחת...",
      close: "סגרי",
      "toasts.success": "תודה! הבקשה התקבלה. בינתיים, בחרי את הקטגוריה הקרובה ביותר.",
      "toasts.error": "שגיאה בשליחת הבקשה — נסי שוב",
    };
    return flat[key] ?? key;
  },
}));

vi.mock("@/lib/use-focus-return", () => ({ useFocusReturn: vi.fn() }));
// MEH-685: methods-only object.
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const apiPostSpy = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { post: (...args) => apiPostSpy(...args) },
}));

import CategoryRequestModal from "@/components/CategoryRequestModal";
import { showToast } from "@/lib/toast";

afterEach(() => vi.clearAllMocks());

describe("CategoryRequestModal (MEH-141)", () => {
  it("renders nothing when closed", () => {
    render(<CategoryRequestModal open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders form when open", () => {
    render(<CategoryRequestModal open={true} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("איזו קטגוריה חסרה?")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/שם הקטגוריה/)).toBeInTheDocument();
  });

  it("submits POST and shows success toast", async () => {
    apiPostSpy.mockResolvedValue({ data: { id: "abc", status: "pending" } });
    const onClose = vi.fn();
    render(<CategoryRequestModal open={true} onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText(/שם הקטגוריה/), {
      target: { value: "משקאות מותססים" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole("dialog").querySelector("form"));
    });

    expect(apiPostSpy).toHaveBeenCalledWith(
      "/category-requests",
      expect.objectContaining({ requested_name: "משקאות מותססים" })
    );
    expect(showToast.success).toHaveBeenCalledWith(
      expect.stringContaining("תודה"),
      expect.objectContaining({ duration: expect.any(Number) }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error toast on API failure", async () => {
    apiPostSpy.mockRejectedValue(new Error("network"));
    render(<CategoryRequestModal open={true} onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText(/שם הקטגוריה/), {
      target: { value: "תבלינים" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole("dialog").querySelector("form"));
    });

    expect(showToast.error).toHaveBeenCalledWith(expect.any(String));
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(<CategoryRequestModal open={true} onClose={onClose} />);
    const backdrop = screen.getByRole("dialog");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key — WCAG 2.1 §2.1.2", () => {
    const onClose = vi.fn();
    render(<CategoryRequestModal open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
