/**
 * MEH-1443 — ReportInfoModal
 * Verifies: opens/closes, required message blocks empty submit, submit POSTs
 * {producer_slug, message, reporter_email} + success toast, error toast on
 * failure, Escape + backdrop close.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      title: "עדכון פרטים",
      placeholder: "מה לא מדויק? שעות, טלפון, כתובת — כל פרט עוזר",
      email_label: "מייל לעדכון חוזר (לא חובה)",
      submit: "שליחה",
      submit_loading: "בשליחה...",
      close: "סגרו",
      "toasts.success": "תודה! נבדוק ונעדכן בהקדם",
      "toasts.error": "שגיאה בשליחה — נסו שוב",
    };
    return flat[key] ?? key;
  },
}));

vi.mock("@/lib/use-focus-return", () => ({ useFocusReturn: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const apiPostSpy = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { post: (...args) => apiPostSpy(...args) },
}));

import ReportInfoModal from "@/components/ReportInfoModal";
import { showToast } from "@/lib/toast";

afterEach(() => vi.clearAllMocks());

const SLUG = "chavat-hanisui";

describe("ReportInfoModal (MEH-1443)", () => {
  it("renders nothing when closed", () => {
    render(<ReportInfoModal open={false} onClose={() => {}} producerSlug={SLUG} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the form when open", () => {
    render(<ReportInfoModal open={true} onClose={() => {}} producerSlug={SLUG} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("עדכון פרטים")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/מה לא מדויק/)).toBeInTheDocument();
  });

  it("required message blocks an empty submit (API not called)", async () => {
    render(<ReportInfoModal open={true} onClose={() => {}} producerSlug={SLUG} />);
    await act(async () => {
      fireEvent.submit(screen.getByRole("dialog").querySelector("form"));
    });
    expect(apiPostSpy).not.toHaveBeenCalled();
  });

  it("submits POST with slug + message and shows success toast", async () => {
    apiPostSpy.mockResolvedValue({ status: 204 });
    const onClose = vi.fn();
    render(<ReportInfoModal open={true} onClose={onClose} producerSlug={SLUG} />);

    fireEvent.change(screen.getByPlaceholderText(/מה לא מדויק/), {
      target: { value: "הטלפון שגוי" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole("dialog").querySelector("form"));
    });

    expect(apiPostSpy).toHaveBeenCalledWith(
      "/reports/producer-info",
      expect.objectContaining({
        producer_slug: SLUG,
        message: "הטלפון שגוי",
      }),
    );
    expect(showToast.success).toHaveBeenCalledWith(
      expect.stringContaining("תודה"),
      expect.objectContaining({ duration: expect.any(Number) }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error toast on API failure", async () => {
    apiPostSpy.mockRejectedValue(new Error("network"));
    render(<ReportInfoModal open={true} onClose={() => {}} producerSlug={SLUG} />);

    fireEvent.change(screen.getByPlaceholderText(/מה לא מדויק/), {
      target: { value: "הכתובת השתנתה" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole("dialog").querySelector("form"));
    });

    expect(showToast.error).toHaveBeenCalledWith(expect.any(String));
  });

  // MEH-2039: previously clicked `getByRole("dialog")` — which closed the modal
  // only because role="dialog" sat on the full-screen OVERLAY, the very thing
  // this ticket moves. The role is now on the inner panel, so the backdrop is
  // addressed as the panel's parent. Pins both halves instead of one.
  it("calls onClose when the backdrop is clicked, and NOT when the panel is", () => {
    const onClose = vi.fn();
    render(<ReportInfoModal open={true} onClose={onClose} producerSlug={SLUG} />);
    const panel = screen.getByRole("dialog");

    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(panel.parentElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape key — WCAG 2.1 §2.1.2", () => {
    const onClose = vi.fn();
    render(<ReportInfoModal open={true} onClose={onClose} producerSlug={SLUG} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

/**
 * MEH-2039 — the dialog contract, guarded at the vitest gate.
 *
 * Added after the CI reviewer on PR #2847 noted the asymmetry: the sibling
 * CategoryRequestModal got these three, while this file's identical trap and
 * scroll-lock code was covered only by a hand-run QA script that no CI job
 * executes. A guard nothing runs is not a guard.
 *
 * Discriminates by construction: jsdom implements no native Tab focus
 * movement, so focus only moves if the component's own handler runs.
 */
describe("ReportInfoModal dialog contract (MEH-2039)", () => {
  it("traps Tab inside the panel — wraps last→first and first→last", () => {
    render(<ReportInfoModal open={true} onClose={vi.fn()} producerSlug={SLUG} />);
    const panel = screen.getByRole("dialog");
    const focusables = panel.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusables.length).toBeGreaterThan(1);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("locks body scroll while open and restores it on unmount", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(
      <ReportInfoModal open={true} onClose={vi.fn()} producerSlug={SLUG} />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("puts role=dialog on the panel, not on the full-screen overlay", () => {
    render(<ReportInfoModal open={true} onClose={vi.fn()} producerSlug={SLUG} />);
    const panel = screen.getByRole("dialog");
    expect(panel.parentElement.getAttribute("role")).toBe("presentation");
    expect(panel.className).not.toContain("inset-0");
    expect(panel).toHaveAttribute("aria-modal", "true");
  });
});
