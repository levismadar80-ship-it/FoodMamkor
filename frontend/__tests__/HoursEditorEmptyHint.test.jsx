/**
 * MEH-1884: the HoursEditor empty-state incentive line.
 *
 * The hint names where hours go (business page + the JSON-LD
 * openingHoursSpecification, lib/seo.js:288-291) at the moment the owner has
 * nothing saved yet. It is a conditional UI state, so it needs the full
 * matrix rather than a single happy-path render — CLAUDE.md's 5-state rule.
 *
 * The gate is the SAVED seed (`profile.opening_hours`), NOT the in-progress
 * model. That is deliberate: the hint must not vanish the instant the owner
 * ticks the first day checkbox, mid-edit, before anything is persisted. The
 * "stays visible while editing" case below is what pins that choice down — a
 * refactor that re-gates on the live `days` model reds it.
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

describe("HoursEditor empty-state hint (MEH-1884)", () => {
  it.each([
    ["opening_hours is an empty string", ""],
    ["opening_hours is null", null],
    ["opening_hours is undefined", undefined],
    ["opening_hours is whitespace only", "   "],
  ])("renders the hint when %s", (_label, value) => {
    render(<HoursEditor profile={{ opening_hours: value }} onSave={() => {}} />);
    expect(screen.getByTestId("hours-empty-hint")).toBeTruthy();
  });

  it("renders the hint when the profile itself is missing", () => {
    render(<HoursEditor profile={undefined} onSave={() => {}} />);
    expect(screen.getByTestId("hours-empty-hint")).toBeTruthy();
  });

  it("does NOT render the hint once hours are saved", () => {
    render(<HoursEditor profile={{ opening_hours: SAVED }} onSave={() => {}} />);
    expect(screen.queryByTestId("hours-empty-hint")).toBeNull();
  });

  // The gate is the saved seed, not the live model: an owner who starts
  // editing has still saved nothing, so the hint stays until it persists.
  it("keeps the hint visible while editing an empty editor (gated on the saved seed)", () => {
    render(<HoursEditor profile={{ opening_hours: "" }} onSave={() => {}} />);
    expect(screen.getByTestId("hours-empty-hint")).toBeTruthy();

    // Applying the preset makes the editor dirty but saves nothing.
    fireEvent.click(screen.getByText("preset"));
    expect(screen.getByTestId("hours-revert")).toBeTruthy(); // proves it IS dirty
    expect(screen.getByTestId("hours-empty-hint")).toBeTruthy();
  });

  // Conversely, clearing a saved value in the editor must not resurrect the
  // hint — the seed is still non-empty until a save lands.
  it("does not resurrect the hint when a saved value is cleared in the editor", () => {
    render(<HoursEditor profile={{ opening_hours: SAVED }} onSave={() => {}} />);
    fireEvent.click(screen.getByText("preset"));
    expect(screen.queryByTestId("hours-empty-hint")).toBeNull();
  });

  it("uses the hours-namespace key (guards the namespace the component reads)", () => {
    render(<HoursEditor profile={{ opening_hours: "" }} onSave={() => {}} />);
    // The next-intl mock echoes the key, so the rendered text IS the key —
    // a key moved to another namespace would render undefined/blank here.
    expect(screen.getByTestId("hours-empty-hint").textContent).toBe("hours_empty_hint");
  });
});
