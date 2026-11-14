/**
 * ui/PasswordField (MEH-3141): the eye toggle flips the input type and its own
 * accessible name, the label is wired, and `invalid` / `error` mark the field.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PasswordField from "@/components/ui/PasswordField";

const labels = { showLabel: "הצגת הסיסמה", hideLabel: "הסתרת הסיסמה" };

describe("ui/PasswordField", () => {
  it("starts hidden and the toggle shows then hides the password", () => {
    render(<PasswordField label="סיסמה נוכחית" {...labels} value="abc" onChange={() => {}} />);
    const input = screen.getByLabelText("סיסמה נוכחית");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("dir", "ltr");

    const toggle = screen.getByRole("button", { name: "הצגת הסיסמה" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "הסתרת הסיסמה" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "הסתרת הסיסמה" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("the toggle is a 44px target and never submits the form", () => {
    render(<PasswordField label="סיסמה" {...labels} />);
    const toggle = screen.getByRole("button", { name: "הצגת הסיסמה" });
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle.className).toMatch(/\bh-11\b/);
    expect(toggle.className).toMatch(/\bw-11\b/);
  });

  it("required shows the marker and sets the native attribute", () => {
    const { container } = render(<PasswordField label="סיסמה" required {...labels} />);
    expect(container.querySelector("input")).toBeRequired();
    expect(screen.getByText("*", { exact: false }).getAttribute("aria-hidden")).toBe("true");
  });

  it("invalid marks the field without a message; error adds the described-by text", () => {
    const { rerender } = render(<PasswordField label="אימות" invalid {...labels} />);
    const input = screen.getByLabelText("אימות");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.className).toMatch(/border-error/);
    expect(input).not.toHaveAttribute("aria-describedby");

    rerender(<PasswordField label="אימות" error="הסיסמאות אינן תואמות" {...labels} />);
    const described = screen.getByLabelText("אימות").getAttribute("aria-describedby");
    expect(document.getElementById(described)).toHaveTextContent("הסיסמאות אינן תואמות");
  });

  it("a valid field is not marked invalid", () => {
    render(<PasswordField label="אימות" {...labels} />);
    const input = screen.getByLabelText("אימות");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input.className).not.toMatch(/border-error/);
  });

  it("passes native props through (placeholder, aria-label, autoComplete)", () => {
    render(<PasswordField aria-label="אימות סיסמה" placeholder="שוב" autoComplete="new-password" {...labels} />);
    const input = screen.getByLabelText("אימות סיסמה");
    expect(input).toHaveAttribute("placeholder", "שוב");
    expect(input).toHaveAttribute("autocomplete", "new-password");
  });

  it("a caller cannot override type or dir (the toggle and the layout depend on them)", () => {
    // @ts-expect-error -- `type` is not in the prop type; this is the runtime half.
    render(<PasswordField label="אימות" type="text" dir="rtl" {...labels} />);
    const input = screen.getByLabelText("אימות");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("dir", "ltr");
  });
});
