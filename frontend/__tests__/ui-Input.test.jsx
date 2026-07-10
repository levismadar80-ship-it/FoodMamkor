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
});
