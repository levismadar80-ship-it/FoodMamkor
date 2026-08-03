/**
 * MEH-1870 — HoursEditor: several opening-hours ranges per day.
 *
 * The MEH-1276 editor offered exactly one open/close pair per day, which cannot
 * express a lunch break or Friday morning + מוצ"ש. These cover the add/remove
 * affordances, the cap, the append default, and the per-day validation that
 * distinguishes overlap from close<=open.
 *
 * REUSES: __tests__/HoursEditorRevert.test.jsx (next-intl + api mock pattern).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HoursEditor from "@/app/[locale]/producer/dashboard/edit/HoursEditor";
import api from "@/lib/api";

vi.mock("next-intl", () => {
  const t = (key) => key;
  return { useTranslations: () => t };
});

vi.mock("@/lib/api", () => ({
  default: { put: vi.fn(() => Promise.resolve({ data: {} })) },
}));

// Friday is row 5.
const SPLIT = "Fri 09:00-13:00 16:00-19:00";
const LEGACY = "Fri 09:00-14:00";

const renderEditor = (opening_hours) =>
  render(<HoursEditor profile={{ opening_hours }} onSave={() => {}} />);

const save = () => fireEvent.click(screen.getByText("save_cta"));

describe("HoursEditor — ranges per day (MEH-1870)", () => {
  beforeEach(() => api.put.mockClear());

  it("prefills a stored split day with BOTH ranges", () => {
    renderEditor(SPLIT);
    expect(screen.getByDisplayValue("09:00")).toBeTruthy();
    expect(screen.getByDisplayValue("13:00")).toBeTruthy();
    expect(screen.getByDisplayValue("16:00")).toBeTruthy();
    expect(screen.getByDisplayValue("19:00")).toBeTruthy();
    expect(screen.getByTestId("hours-remove-5-1")).toBeTruthy();
  });

  it("prefills a LEGACY single-range string with one range and no remove control", () => {
    renderEditor(LEGACY);
    expect(screen.getByDisplayValue("09:00")).toBeTruthy();
    expect(screen.getByDisplayValue("14:00")).toBeTruthy();
    expect(screen.queryByTestId("hours-remove-5-0")).toBeNull();
  });

  it("appends a range that CONTINUES from the last, so it is immediately valid", () => {
    renderEditor(SPLIT);
    fireEvent.click(screen.getByTestId("hours-add-range-5"));
    // 19:00 + 2h, adjacency being legal in this grammar.
    expect(screen.getByDisplayValue("21:00")).toBeTruthy();
    save();
    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      opening_hours: "Fri 09:00-13:00 16:00-19:00 19:00-21:00",
    });
  });

  it("hides the add control at the 3-range cap", () => {
    renderEditor(LEGACY);
    const add = () => screen.queryByTestId("hours-add-range-5");
    fireEvent.click(add());
    fireEvent.click(add());
    expect(add()).toBeNull();
    expect(screen.getByTestId("hours-remove-5-2")).toBeTruthy();
  });

  it("removes the clicked range and keeps the rest", () => {
    renderEditor(SPLIT);
    fireEvent.click(screen.getByTestId("hours-remove-5-0"));
    expect(screen.queryByDisplayValue("09:00")).toBeNull();
    expect(screen.getByDisplayValue("16:00")).toBeTruthy();
    save();
    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      opening_hours: "Fri 16:00-19:00",
    });
  });

  it("blocks the save and names OVERLAP rather than the close>open message", () => {
    renderEditor(SPLIT);
    fireEvent.change(screen.getByDisplayValue("16:00"), { target: { value: "12:00" } });
    save();
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getAllByText("invalid_overlap").length).toBeGreaterThan(0);
  });

  it("still flags a single reversed range with the close>open message", () => {
    renderEditor(LEGACY);
    fireEvent.change(screen.getByDisplayValue("14:00"), { target: { value: "08:00" } });
    save();
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getAllByText("invalid_range").length).toBeGreaterThan(0);
  });

  it("accepts an adjacent pair, matching the grammar", () => {
    renderEditor(SPLIT);
    fireEvent.change(screen.getByDisplayValue("16:00"), { target: { value: "13:00" } });
    save();
    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      opening_hours: "Fri 09:00-13:00 13:00-19:00",
    });
  });

  it("numbers the time inputs ONLY when a day has more than one range", () => {
    const { unmount } = renderEditor(LEGACY);
    // Single range → the label is exactly what it was pre-MEH-1870.
    expect(screen.getByLabelText("fri to_label")).toBeTruthy();
    unmount();
    renderEditor(SPLIT);
    expect(screen.getByLabelText("fri to_label 1")).toBeTruthy();
    expect(screen.getByLabelText("fri to_label 2")).toBeTruthy();
  });

  // Reported by the CI adversarial reviewer on the sibling PR (#2560), and the
  // same defect existed here: a day whose last range ends at 23:59 has no room
  // left, so appending could only produce a zero-length (invalid) range. The
  // control is hidden instead of handing over an unsaveable form.
  it("hides the add control when the day has no room left", () => {
    renderEditor("Fri 09:00-23:59");
    expect(screen.queryByTestId("hours-add-range-5")).toBeNull();
    // …and a day that DOES have room still offers it.
    expect(screen.queryByTestId("hours-add-range-4")).toBeNull(); // Thu closed
  });

  it("still offers the control when there is room", () => {
    renderEditor("Fri 09:00-22:00");
    expect(screen.getByTestId("hours-add-range-5")).toBeTruthy();
  });
});
