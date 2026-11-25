/**
 * ui/IconButton (MEH-3832) — the one icon-only button: named by `label`,
 * a 44×44 hit area through `.tap-area`, and never a surprise submit.
 */
import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import IconButton from "@/components/ui/IconButton";

describe("ui/IconButton", () => {
  it("is named by its label, so a screen reader reads more than an icon", () => {
    render(
      <IconButton label="סגירה">
        <svg aria-hidden="true" />
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "סגירה" })).toBeTruthy();
  });

  it("carries the tap-area class next to the caller's own look", () => {
    render(<IconButton label="מחיקה" className="w-6 h-6 rounded-full" />);
    const cls = screen.getByRole("button", { name: "מחיקה" }).className.split(/\s+/);
    expect(cls).toContain("tap-area");
    expect(cls).toEqual(expect.arrayContaining(["w-6", "h-6", "rounded-full"]));
  });

  it("is type=button unless the caller asks for submit, so it never submits a form by accident", () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <IconButton label="פלוס" />
        <IconButton label="שליחה" type="submit" />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "פלוס" }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "שליחה" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("forwards the ref and every other prop to the native button", () => {
    const ref = createRef();
    const onClick = vi.fn();
    render(
      <IconButton ref={ref} label="תפריט" aria-expanded={false} data-testid="kebab" onClick={onClick} disabled={false} />,
    );
    const btn = screen.getByTestId("kebab");
    expect(ref.current).toBe(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps `label` as the name even when a caller also passes aria-label", () => {
    render(<IconButton label="סגירה" aria-label="x" />);
    expect(screen.getByRole("button", { name: "סגירה" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "x" })).toBeNull();
  });
});
