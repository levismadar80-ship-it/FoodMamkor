/**
 * MEH-1344: HoursEditor revert affordance.
 *
 * The MEH-1276 editor had a one-click preset but no way back — the only
 * "undo" was manually re-toggling 7 day rows. The revert button restores
 * the last-saved seed and renders ONLY while the editor is dirty.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HoursEditor from "@/app/[locale]/producer/dashboard/edit/HoursEditor";

vi.mock("next-intl", () => {
  const t = (key) => key;
  return { useTranslations: () => t };
});

vi.mock("@/lib/api", () => ({
  default: { put: vi.fn(() => Promise.resolve({ data: {} })) },
}));

const SAVED = "Sun-Thu 09:00-17:00, Fri 09:00-13:00";

describe("HoursEditor revert (MEH-1344)", () => {
  it("hides the revert button while clean", () => {
    render(<HoursEditor profile={{ opening_hours: SAVED }} onSave={() => {}} />);
    expect(screen.queryByTestId("hours-revert")).toBeNull();
  });

  it("shows revert after the preset and restores the saved state on click", () => {
    render(<HoursEditor profile={{ opening_hours: SAVED }} onSave={() => {}} />);

    // Preset (09:00-18:00) differs from the saved seed (09:00-17:00) → dirty.
    fireEvent.click(screen.getByText("preset"));
    const revert = screen.getByTestId("hours-revert");
    expect(revert).toBeTruthy();
    // Save enabled while dirty.
    expect(screen.getByText("save_cta").disabled).toBe(false);

    fireEvent.click(revert);

    // Back to the saved state: clean editor → revert unmounts, save disabled.
    expect(screen.queryByTestId("hours-revert")).toBeNull();
    expect(screen.getByText("save_cta").disabled).toBe(true);
  });

  it("keeps dirty-tracking wiring intact (reportDirty false after revert)", () => {
    const reportDirty = vi.fn();
    render(
      <HoursEditor
        profile={{ opening_hours: SAVED }}
        onSave={() => {}}
        reportDirty={reportDirty}
      />,
    );
    fireEvent.click(screen.getByText("preset"));
    expect(reportDirty).toHaveBeenCalledWith("hours", true);
    fireEvent.click(screen.getByTestId("hours-revert"));
    expect(reportDirty).toHaveBeenLastCalledWith("hours", false);
  });
});
