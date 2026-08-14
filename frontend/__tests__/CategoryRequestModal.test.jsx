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

  // MEH-2039: this used to read `screen.getByRole("dialog")` and click it,
  // which worked only because role="dialog" sat on the full-screen OVERLAY —
  // i.e. the test's handle on "the backdrop" WAS the bug the ticket fixes. The
  // role now lives on the inner panel, so the backdrop has to be addressed as
  // the backdrop: the dialog's parent element.
  //
  // Strictly stronger than before — it now pins both halves of the behaviour,
  // where the old version could not distinguish them at all.
  it("calls onClose when the backdrop is clicked, and NOT when the panel is", () => {
    const onClose = vi.fn();
    render(<CategoryRequestModal open={true} onClose={onClose} />);
    const panel = screen.getByRole("dialog");

    // Clicking inside the panel must not close it.
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();

    // Clicking the overlay behind it must.
    fireEvent.click(panel.parentElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // MEH-2039. This modal is the one of the four the Playwright keyboard pass
  // could NOT reach — it mounts behind a multi-step registration wizard that
  // needs a live backend to advance — so its trap evidence lives here instead,
  // against the real component rather than a stand-in.
  //
  // Why this discriminates by construction: jsdom does not implement native Tab
  // focus movement. Nothing moves focus on a Tab keydown unless the component's
  // own handler runs and calls .focus() itself. So if the trap were absent, the
  // active element would simply stay put and both assertions would fail — the
  // pass is only reachable through the code under test.
  it("traps Tab inside the panel — wraps last→first and first→last", () => {
    render(<CategoryRequestModal open={true} onClose={vi.fn()} />);
    const panel = screen.getByRole("dialog");
    const focusables = panel.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusables.length).toBeGreaterThan(1);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("locks body scroll while open and restores it on unmount", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(<CategoryRequestModal open={true} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("puts role=dialog on the panel, not on the full-screen overlay", () => {
    render(<CategoryRequestModal open={true} onClose={vi.fn()} />);
    const panel = screen.getByRole("dialog");
    // The overlay is the parent; it must NOT also claim the dialog role, or the
    // whole page sits inside the dialog boundary (MDN).
    expect(panel.parentElement.getAttribute("role")).toBe("presentation");
    expect(panel.className).not.toContain("inset-0");
    expect(panel).toHaveAttribute("aria-modal", "true");
  });

  it("calls onClose on Escape key — WCAG 2.1 §2.1.2", () => {
    const onClose = vi.fn();
    render(<CategoryRequestModal open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
