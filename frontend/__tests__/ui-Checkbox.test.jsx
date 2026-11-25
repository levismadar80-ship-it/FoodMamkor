/**
 * MEH-3830 — ui/Checkbox: a native checkbox inside its label, the whole row a
 * 44px hit area (32px from md). jsdom has no layout, so the reach case checks
 * the row carries the touch tokens; the rest is behaviour.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import Checkbox from "@/components/ui/Checkbox";

function Controlled({ onChange = () => {} }) {
  const [on, setOn] = useState(false);
  return (
    <Checkbox
      checked={on}
      onChange={(e) => {
        setOn(e.target.checked);
        onChange(e.target.checked);
      }}
      data-testid="cb"
    >
      <span>אני מאשרת את התנאים</span>
    </Checkbox>
  );
}

describe("ui/Checkbox", () => {
  it("is a checkbox named by its children", () => {
    render(<Controlled />);
    expect(screen.getByRole("checkbox", { name: "אני מאשרת את התנאים" })).toBe(screen.getByTestId("cb"));
  });

  it("clicking the label text toggles it (the row is the hit area)", () => {
    const seen = vi.fn();
    render(<Controlled onChange={seen} />);
    fireEvent.click(screen.getByText("אני מאשרת את התנאים"));
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(seen).toHaveBeenLastCalledWith(true);
  });

  it("the row carries min-h-touch below md and min-h-8 from md", () => {
    render(<Controlled />);
    const row = screen.getByRole("checkbox").closest("label");
    expect(row.classList.contains("min-h-touch")).toBe(true);
    expect(row.classList.contains("md:min-h-8")).toBe(true);
  });

  it("the caller's display and alignment replace the defaults instead of fighting them", () => {
    render(<Checkbox className="flex items-start gap-3">x</Checkbox>);
    const row = screen.getByRole("checkbox").closest("label");
    expect(row.classList.contains("inline-flex")).toBe(false);
    expect(row.classList.contains("items-center")).toBe(false);
    expect(row.classList.contains("gap-2")).toBe(false);
  });

  it("forwards required / disabled / aria-label to the native input", () => {
    render(<Checkbox required disabled aria-label="בחירה" />);
    const box = screen.getByRole("checkbox", { name: "בחירה" });
    expect(box).toBeRequired();
    expect(box).toBeDisabled();
  });
});
