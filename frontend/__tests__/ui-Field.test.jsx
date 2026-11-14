import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { fieldClasses } from "@/components/ui/field";

// MEH-3136 — compact Input sizes, inline form, and the shared Select/Textarea.
describe("ui/field — compact fields share one look and one wiring", () => {
  it("fieldClasses: size, error border, and block are the only moving parts", () => {
    expect(fieldClasses()).toBe(
      "w-full rounded-sm border bg-surface-card text-text px-3 py-2 text-sm placeholder:text-fg-muted transition-colors duration-fast ease-quart focus-ring border-border focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-background",
    );
    expect(fieldClasses({ size: "xs" })).toContain("px-2 py-1 text-sm");
    expect(fieldClasses({ invalid: true })).toContain("border-error");
    expect(fieldClasses({ invalid: true })).not.toContain("border-border");
    expect(fieldClasses({ block: false }).split(" ")).not.toContain("w-full");
  });

  it("Input md is untouched by the new props' defaults", () => {
    render(<Input label="שם" />);
    expect(screen.getByLabelText("שם").className).toBe(
      "w-full min-h-touch rounded-sm border bg-surface-card px-3 text-text placeholder:text-fg-muted transition-colors duration-fast ease-quart focus-ring border-border focus:border-primary  ",
    );
  });

  it("Input sm keeps the label and error wiring", () => {
    render(<Input size="sm" label="שם" error="שדה חובה" />);
    const el = screen.getByLabelText("שם");
    expect(el.className).toContain("px-3 py-2 text-sm");
    expect(el).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(el.getAttribute("aria-describedby"))).toHaveTextContent("שדה חובה");
  });

  it("Input inline is the bare input: no wrapper, no w-full, caller's width", () => {
    const { container } = render(<Input inline size="xs" type="time" aria-label="שעה" className="w-20" />);
    expect(container.firstChild.tagName).toBe("INPUT");
    expect(container.firstChild.className.split(" ")).toContain("w-20");
    expect(container.firstChild.className.split(" ")).not.toContain("w-full");
  });

  it("Input inline with an error still shows it (a message needs the shell)", () => {
    const { container } = render(<Input inline size="sm" aria-label="קוד" error="קוד שגוי" />);
    expect(container.firstChild.tagName).toBe("DIV");
    expect(screen.getByText("קוד שגוי")).toBeInTheDocument();
  });

  it("Select: labelled, options render, required marks the label and the control", () => {
    render(
      <Select label="אזור" required defaultValue="b">
        <option value="a">צפון</option>
        <option value="b">מרכז</option>
      </Select>,
    );
    const el = screen.getByLabelText(/אזור/);
    expect(el.tagName).toBe("SELECT");
    expect(el).toBeRequired();
    expect(el.value).toBe("b");
    expect(el.className).toBe(fieldClasses());
  });

  it("Select inline is bare; inline with a label gets the shell back", () => {
    const { container, rerender } = render(<Select inline aria-label="ריק" className="w-32" />);
    expect(container.firstChild.tagName).toBe("SELECT");
    expect(container.firstChild.className.split(" ")).not.toContain("w-full");
    rerender(<Select inline label="עם תווית" />);
    expect(container.firstChild.tagName).toBe("DIV");
    expect(screen.getByLabelText("עם תווית").tagName).toBe("SELECT");
  });

  it("Input md + inline: 44px field, no wrapper, same look source", () => {
    const { container } = render(<Input inline aria-label="חיפוש" className="flex-1" />);
    expect(container.firstChild.tagName).toBe("INPUT");
    expect(container.firstChild.className).toBe(`${fieldClasses({ size: "md", block: false })} flex-1`);
    expect(container.firstChild.className.split(" ")).toContain("min-h-touch");
  });

  it("compact Input: required marks the label and the control; successText is not shown", () => {
    render(<Input size="sm" label="שם" required success successText="מצוין" />);
    expect(screen.getByLabelText(/שם/)).toBeRequired();
    expect(screen.getByText("*", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("מצוין")).not.toBeInTheDocument();
  });

  it("Textarea rows: 3 by default, the caller's value wins", () => {
    const { rerender } = render(<Textarea label="א" />);
    expect(screen.getByLabelText("א")).toHaveAttribute("rows", "3");
    rerender(<Textarea label="א" rows={6} />);
    expect(screen.getByLabelText("א")).toHaveAttribute("rows", "6");
  });

  it("Textarea: helper text is described-by; an error replaces it and sets aria-invalid", () => {
    const { rerender } = render(<Textarea label="הערה" helperText="עד 300 תווים" />);
    let el = screen.getByLabelText("הערה");
    expect(el.tagName).toBe("TEXTAREA");
    expect(el).not.toHaveAttribute("aria-invalid");
    expect(document.getElementById(el.getAttribute("aria-describedby"))).toHaveTextContent("עד 300 תווים");
    rerender(<Textarea label="הערה" helperText="עד 300 תווים" error="ארוך מדי" />);
    el = screen.getByLabelText("הערה");
    expect(el).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("עד 300 תווים")).not.toBeInTheDocument();
  });

  it("disabled passes through to the control", () => {
    render(<Textarea label="נעול" disabled />);
    expect(screen.getByLabelText("נעול")).toBeDisabled();
  });
});
