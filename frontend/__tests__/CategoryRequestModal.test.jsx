/**
 * MEH-141 — CategoryRequestModal
 * Verifies: renders when open, submits POST, shows toast, closes.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

vi.mock("@/lib/use-focus-return", () => ({ useFocusReturn: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

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
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("תודה"),
      "success",
      expect.any(Number)
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

    expect(showToast).toHaveBeenCalledWith(expect.any(String), "error");
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    const { container } = render(<CategoryRequestModal open={true} onClose={onClose} />);
    const backdrop = screen.getByRole("dialog");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
