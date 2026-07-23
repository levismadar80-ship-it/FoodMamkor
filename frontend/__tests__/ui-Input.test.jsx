import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Input from "@/components/ui/Input";

// ui/Input is a labelled field primitive with helper/error slots (MEH-602).
describe("ui/Input", () => {
  it("renders a labelled input wired via htmlFor/id", () => {
    render(<Input label="אימייל" />);
    const input = screen.getByLabelText("אימייל");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("defaults to type=text and forwards an explicit type", () => {
    const { rerender } = render(<Input label="a" />);
    expect(screen.getByLabelText("a")).toHaveAttribute("type", "text");
    rerender(<Input label="a" type="email" />);
    expect(screen.getByLabelText("a")).toHaveAttribute("type", "email");
  });

  it("renders helper text linked via aria-describedby", () => {
    render(<Input label="שם" helperText="לא נשתף עם אף אחד" />);
    const input = screen.getByLabelText("שם");
    const descId = input.getAttribute("aria-describedby");
    expect(descId).toBeTruthy();
    expect(document.getElementById(descId)).toHaveTextContent(
      "לא נשתף עם אף אחד",
    );
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("error supersedes helperText and sets aria-invalid", () => {
    render(<Input label="שם" helperText="עזרה" error="שדה חובה" />);
    const input = screen.getByLabelText("שם");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("שדה חובה")).toBeInTheDocument();
    expect(screen.queryByText("עזרה")).not.toBeInTheDocument();
  });

  it("applies the error border when invalid", () => {
    render(<Input label="x" error="bad" />);
    expect(screen.getByLabelText("x").className).toContain("border-error");
  });

  it("disables the field and applies disabled styling", () => {
    render(<Input label="x" disabled />);
    const input = screen.getByLabelText("x");
    expect(input).toBeDisabled();
    expect(input.className).toContain("cursor-not-allowed");
  });

  it("renders without a label or message gracefully", () => {
    render(<Input placeholder="חיפוש" />);
    const input = screen.getByPlaceholderText("חיפוש");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("honours an explicit id over the generated one", () => {
    render(<Input id="email-field" label="אימייל" />);
    expect(screen.getByLabelText("אימייל")).toHaveAttribute("id", "email-field");
  });

  // MEH-1128 D1 regression lock: the default rendering path (no startAdornment,
  // no success) must stay byte-identical across primitive extensions — 56+
  // live fields render through it. These snapshots were captured BEFORE the
  // D1 extension landed; a failure here means the default path changed.
  it("default-path markup is unchanged (D1 lock — labelled + helper)", () => {
    const { container } = render(
      <Input id="snap-default" label="שם" helperText="עזרה" placeholder="p" />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("default-path markup is unchanged (D1 lock — bare + error + disabled)", () => {
    const { container } = render(
      <>
        <Input id="snap-bare" placeholder="חיפוש" />
        <Input id="snap-error" label="שגוי" error="שדה חובה" />
        <Input id="snap-disabled" label="מושבת" disabled />
      </>,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  // MEH-1128 D1 — startAdornment slot
  it("renders the startAdornment decoratively; ltr input clears via pe- (MEH-992 ₪ parity)", () => {
    const { container } = render(
      <Input label="מחיר" startAdornment="₪" dir="ltr" />,
    );
    const input = screen.getByLabelText("מחיר");
    expect(input.className).toContain("pe-10");
    expect(input.className).not.toContain("px-3");
    const adornment = container.querySelector('[aria-hidden="true"]');
    expect(adornment).toHaveTextContent("₪");
    expect(adornment.className).toContain("pointer-events-none");
    expect(adornment.className).toContain("start-3");
  });

  it("rtl/default input clears the adornment via ps-", () => {
    render(<Input label="יישוב" startAdornment="📍" />);
    const input = screen.getByLabelText("יישוב");
    expect(input.className).toContain("ps-10");
    expect(input.className).not.toContain("px-3");
  });

  it("keeps px-3 and renders no adornment wrapper without startAdornment", () => {
    const { container } = render(<Input label="רגיל" />);
    expect(screen.getByLabelText("רגיל").className).toContain("px-3");
    expect(container.querySelector(".relative")).toBeNull();
  });

  // MEH-1128 D1 — success state (primary family per ADR-019 / DESIGN.md)
  it("applies the primary border + renders successText with a check", () => {
    const { container } = render(
      <Input label="שם" success successText="נראה טוב" helperText="עזרה" />,
    );
    const input = screen.getByLabelText("שם");
    expect(input.className).toContain("border-primary");
    expect(input.className).not.toContain("border-border");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText("נראה טוב")).toBeInTheDocument();
    expect(screen.queryByText("עזרה")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("success without successText tints the border and keeps helperText", () => {
    render(<Input label="שם" success helperText="עזרה" />);
    expect(screen.getByLabelText("שם").className).toContain("border-primary");
    expect(screen.getByText("עזרה")).toBeInTheDocument();
  });

  it("error wins over success", () => {
    render(<Input label="שם" success successText="נראה טוב" error="שדה חובה" />);
    const input = screen.getByLabelText("שם");
    expect(input.className).toContain("border-error");
    expect(input.className).not.toContain("border-primary");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("שדה חובה")).toBeInTheDocument();
    expect(screen.queryByText("נראה טוב")).not.toBeInTheDocument();
  });
});
