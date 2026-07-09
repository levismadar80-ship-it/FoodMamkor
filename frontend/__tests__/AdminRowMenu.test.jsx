import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AdminRowMenu from "@/components/admin/AdminRowMenu";

// MEH-1023: contract tests for the admin-table kebab menu. Dismissal
// contract (document mousedown + window keydown) mirrors ui/Popover.

function renderMenu(items, extra = {}) {
  return render(<AdminRowMenu ariaLabel="פעולות נוספות" items={items} {...extra} />);
}

const promote = (onSelect = () => {}) => ({ key: "promote", label: "העלי לאדמין", onSelect });
const demote = (onSelect = () => {}) => ({ key: "demote", label: "הסירי הרשאות", tone: "danger", onSelect });

describe("admin/AdminRowMenu", () => {
  it("renders nothing when items is empty (protected super-admin + self)", () => {
    const { container } = renderMenu([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens on trigger click, closes on second click", () => {
    renderMenu([promote()]);
    const trigger = screen.getByRole("button", { name: "פעולות נוספות" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on outside mousedown", () => {
    renderMenu([promote()]);
    fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    renderMenu([promote()]);
    const trigger = screen.getByRole("button", { name: "פעולות נוספות" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(globalThis, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("fires the item's onSelect and closes the menu", () => {
    const onSelect = vi.fn();
    renderMenu([promote(onSelect)]);
    fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "העלי לאדמין" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  // MEH-1027: per-item disabled — mirrors the inline buttons' busy guards
  // when actions move into the menu (producers table).
  it("renders a disabled item as disabled; click does not fire onSelect or close", () => {
    const onSelect = vi.fn();
    renderMenu([{ key: "delete", label: "מחקו", tone: "danger", disabled: true, onSelect }]);
    fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
    const item = screen.getByRole("menuitem", { name: "מחקו" });
    expect(item).toBeDisabled();
    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("items without a disabled flag stay enabled", () => {
    renderMenu([promote(), { ...demote(), disabled: false }]);
    fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
    screen.getAllByRole("menuitem").forEach((it) => expect(it).toBeEnabled());
  });

  it("renders both promote and demote items when provided", () => {
    renderMenu([promote(), demote()]);
    fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.getByRole("menuitem", { name: "הסירי הרשאות" })).toBeInTheDocument();
  });
});
