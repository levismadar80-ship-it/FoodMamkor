/**
 * MEH-1403: HoursEditor preset → labeled two-way toggle.
 *
 * The MEH-1276 preset was a one-way "apply". It is now a two-way toggle:
 * when the current model already equals the preset the button flips to a
 * "clear the hours" action (closes all 7 days, times untouched). The label
 * always states the NEXT action and aria-pressed reflects presetApplied.
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

// The canonical serialization of presetDays() (Sun–Thu 09:00–18:00,
// Fri 09:00–14:00, Sat closed → omitted).
const PRESET = "Sun-Thu 09:00-18:00, Fri 09:00-14:00";

const toggle = () => screen.getByTestId("hours-preset-toggle");
const openDayCount = () =>
  screen.getAllByRole("checkbox").filter((c) => c.checked).length;

describe("HoursEditor preset toggle (MEH-1403)", () => {
  it("labels the next action and reflects aria-pressed across the full cycle", () => {
    render(<HoursEditor profile={{ opening_hours: "" }} onSave={() => {}} />);

    // Not applied → CTA is the preset label, aria-pressed=false.
    expect(toggle().textContent).toBe("preset");
    expect(toggle().getAttribute("aria-pressed")).toBe("false");

    // Apply → flips to the clear CTA, aria-pressed=true, 6 days open.
    fireEvent.click(toggle());
    expect(toggle().textContent).toBe("clear_cta");
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect(openDayCount()).toBe(6);

    // Clear → all 7 days closed, label flips back to the preset CTA.
    fireEvent.click(toggle());
    expect(openDayCount()).toBe(0);
    expect(toggle().textContent).toBe("preset");
    expect(toggle().getAttribute("aria-pressed")).toBe("false");

    // Re-apply → back to the applied state (two-way toggle round-trips).
    fireEvent.click(toggle());
    expect(toggle().textContent).toBe("clear_cta");
    expect(openDayCount()).toBe(6);
  });

  it("starts in the applied (clear) state when the saved value already equals the preset", () => {
    render(<HoursEditor profile={{ opening_hours: PRESET }} onSave={() => {}} />);
    expect(toggle().textContent).toBe("clear_cta");
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
  });

  it("clear closes days but leaves each row's from/to untouched", () => {
    render(<HoursEditor profile={{ opening_hours: PRESET }} onSave={() => {}} />);

    // Clean on mount → Save disabled.
    expect(screen.getByText("save_cta").disabled).toBe(true);

    // Clear all days → dirty, Save enabled, no time inputs rendered.
    fireEvent.click(toggle());
    expect(screen.getByText("save_cta").disabled).toBe(false);
    expect(openDayCount()).toBe(0);

    // Re-open Sunday only (its own checkbox). If clear had reset the times it
    // would show the DEFAULT_CLOSE 17:00; the preset's 18:00 proves from/to
    // survived the close.
    fireEvent.click(screen.getByRole("checkbox", { name: /^sun /i }));
    expect(screen.getByLabelText("sun to_label").value).toBe("18:00");
  });
});
