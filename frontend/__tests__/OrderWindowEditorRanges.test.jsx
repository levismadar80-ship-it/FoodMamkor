/**
 * MEH-1869 — OrderWindowEditor: several order ranges per day.
 *
 * The editor used to offer exactly one open/close pair per day, which cannot
 * express a lunch break (or Friday morning + מוצ"ש). These assertions cover the
 * add/remove affordances, the cap, and the client-side overlap guard that
 * mirrors `_order_window_validator` — a save must not be attempted with a
 * payload the API is going to 422.
 *
 * REUSES: __tests__/HoursEditorRevert.test.jsx (next-intl + api mock pattern).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import OrderWindowEditor from "@/app/[locale]/producer/dashboard/edit/OrderWindowEditor";
import api from "@/lib/api";

vi.mock("next-intl", () => {
  const t = (key) => key;
  return { useTranslations: () => t };
});

vi.mock("@/lib/api", () => ({
  default: { put: vi.fn(() => Promise.resolve({ data: {} })) },
}));

// Sunday is row 0 (ORDER_WINDOW_DAYS is sunday-first).
const SUNDAY_SPLIT = {
  sunday: [
    { open: "09:00", close: "13:00" },
    { open: "16:00", close: "20:00" },
  ],
  monday: [{ open: "08:30", close: "18:00" }],
};

const LEGACY = { sunday: { open: "09:00", close: "14:00" } };

const renderEditor = (order_window) =>
  render(<OrderWindowEditor profile={{ order_window }} onSave={() => {}} />);

describe("OrderWindowEditor — ranges per day (MEH-1869)", () => {
  beforeEach(() => {
    api.put.mockClear();
  });

  it("prefills a stored split day with BOTH ranges", () => {
    renderEditor(SUNDAY_SPLIT);
    expect(screen.getByDisplayValue("09:00")).toBeTruthy();
    expect(screen.getByDisplayValue("13:00")).toBeTruthy();
    expect(screen.getByDisplayValue("16:00")).toBeTruthy();
    expect(screen.getByDisplayValue("20:00")).toBeTruthy();
    // Two ranges → the second one is removable, the first is not shown alone.
    expect(screen.getByTestId("order-window-remove-0-1")).toBeTruthy();
  });

  it("prefills a LEGACY single-dict day as one range (backward compat)", () => {
    renderEditor(LEGACY);
    expect(screen.getByDisplayValue("09:00")).toBeTruthy();
    expect(screen.getByDisplayValue("14:00")).toBeTruthy();
    // A single range offers no remove control — closing the day is the checkbox.
    expect(screen.queryByTestId("order-window-remove-0-0")).toBeNull();
  });

  // MEH-1869 self-QA finding: the first implementation appended the generic
  // 09:00–14:00 default, which on a day that already had a morning block was
  // instantly overlapping — the editor refused to save its own default.
  it("appends a range that CONTINUES from the last one, not an overlapping default", () => {
    renderEditor(SUNDAY_SPLIT); // …09:00–13:00, 16:00–20:00
    fireEvent.click(screen.getByTestId("order-window-add-range-0"));
    // Starts where the evening block ended (adjacency is legal) and runs 2h.
    expect(screen.getByDisplayValue("22:00")).toBeTruthy();
    // …and the result is immediately saveable, which is the whole point.
    fireEvent.click(screen.getByText("save_cta"));
    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      order_window: {
        sunday: [
          { open: "09:00", close: "13:00" },
          { open: "16:00", close: "20:00" },
          { open: "20:00", close: "22:00" },
        ],
        monday: [{ open: "08:30", close: "18:00" }],
      },
    });
  });

  it("clamps an appended range to the end of the day", () => {
    renderEditor({ sunday: [{ open: "20:00", close: "23:30" }] });
    fireEvent.click(screen.getByTestId("order-window-add-range-0"));
    expect(screen.getByDisplayValue("23:59")).toBeTruthy();
  });

  // Reported by the CI adversarial reviewer: a day ending at 23:59 has no room
  // left, so an append could only produce a zero-length (invalid) range. The
  // control is hidden rather than handing over an unsaveable form.
  it("hides the add control when the day has no room left", () => {
    renderEditor({ sunday: [{ open: "20:00", close: "23:59" }] });
    expect(screen.queryByTestId("order-window-add-range-0")).toBeNull();
  });

  it("names the OVERLAP reason in the top-level error, not just the row", () => {
    renderEditor(SUNDAY_SPLIT);
    fireEvent.change(screen.getByDisplayValue("16:00"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByText("save_cta"));
    // Two elements now: the row message and the top-level one. Before, the
    // top-level always said "close must be after open" while the row said
    // "overlap" — two different explanations of one mistake.
    expect(screen.getAllByText("invalid_overlap").length).toBeGreaterThanOrEqual(2);
  });

  it("adds a range, and hides the add control at the 3-range cap", () => {
    renderEditor(LEGACY);
    const add = () => screen.queryByTestId("order-window-add-range-0");
    expect(add()).toBeTruthy(); // 1 range
    fireEvent.click(add()); // 2
    expect(add()).toBeTruthy();
    fireEvent.click(add()); // 3 → capped
    expect(add()).toBeNull();
    expect(screen.getByTestId("order-window-remove-0-2")).toBeTruthy();
  });

  it("removes the range that was clicked, keeping the others", () => {
    renderEditor(SUNDAY_SPLIT);
    fireEvent.click(screen.getByTestId("order-window-remove-0-0"));
    // The evening range survives; the morning one is gone.
    expect(screen.queryByDisplayValue("09:00")).toBeNull();
    expect(screen.getByDisplayValue("16:00")).toBeTruthy();
    expect(screen.getByDisplayValue("20:00")).toBeTruthy();
  });

  it("saves the LIST shape — even for a single range", async () => {
    renderEditor(LEGACY);
    // Make it dirty without making it invalid.
    fireEvent.change(screen.getByDisplayValue("14:00"), { target: { value: "15:00" } });
    fireEvent.click(screen.getByText("save_cta"));
    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      order_window: { sunday: [{ open: "09:00", close: "15:00" }] },
    });
  });

  it("blocks the save and flags OVERLAP rather than letting the API 422", () => {
    renderEditor(SUNDAY_SPLIT);
    // Drag the evening range back so it starts before the morning one ends.
    fireEvent.change(screen.getByDisplayValue("16:00"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByText("save_cta"));
    expect(api.put).not.toHaveBeenCalled();
    // The message names the actual problem — not the generic close>open copy.
    expect(screen.getAllByText("invalid_overlap").length).toBeGreaterThan(0);
  });

  it("still flags a single bad range with the close>open message", () => {
    renderEditor(LEGACY);
    fireEvent.change(screen.getByDisplayValue("14:00"), { target: { value: "08:00" } });
    fireEvent.click(screen.getByText("save_cta"));
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getAllByText("invalid_range").length).toBeGreaterThan(0);
  });

  it("treats an adjacent pair (13:00 → 13:00) as valid, matching the backend", () => {
    renderEditor(SUNDAY_SPLIT);
    fireEvent.change(screen.getByDisplayValue("16:00"), { target: { value: "13:00" } });
    fireEvent.click(screen.getByText("save_cta"));
    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      order_window: {
        sunday: [
          { open: "09:00", close: "13:00" },
          { open: "13:00", close: "20:00" },
        ],
        monday: [{ open: "08:30", close: "18:00" }],
      },
    });
  });

  it("a closed day contributes nothing, and clearing every day sends null", () => {
    renderEditor(SUNDAY_SPLIT);
    const rows = screen.getAllByRole("checkbox");
    rows.forEach((box) => {
      if (box.checked) fireEvent.click(box);
    });
    fireEvent.click(screen.getByText("save_cta"));
    expect(api.put).toHaveBeenCalledWith("/producers/me", { order_window: null });
  });
});

describe("OrderWindowEditor — untouched behaviour", () => {
  it("renders seven day rows and an empty state when nothing is set", () => {
    renderEditor(null);
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
    expect(screen.getByTestId("order-window-empty")).toBeTruthy();
  });

  it("keeps the revert affordance dirty-gated", () => {
    renderEditor(LEGACY);
    expect(screen.queryByTestId("order-window-revert")).toBeNull();
    fireEvent.click(screen.getByTestId("order-window-add-range-0"));
    const revert = screen.getByTestId("order-window-revert");
    fireEvent.click(revert);
    expect(screen.queryByTestId("order-window-revert")).toBeNull();
    // Back to the single stored range.
    expect(within(document.body).queryByTestId("order-window-remove-0-1")).toBeNull();
  });
});
