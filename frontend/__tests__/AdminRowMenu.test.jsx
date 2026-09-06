import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AdminRowMenu from "@/components/admin/AdminRowMenu";

// MEH-1023: contract tests for the admin-table kebab menu. Dismissal
// contract (document mousedown + window keydown) mirrors ui/Popover.
// MEH-1251: the open panel now portals to document.body (escapes the admin
// tables' overflow clipping) — assertions below confirm the menu renders
// OUTSIDE the component's own container, as a child of document.body.

function renderMenu(items, extra = {}) {
  return render(
    <AdminRowMenu ariaLabel="פעולות נוספות" items={items} {...extra} />,
  );
}

const promote = (onSelect = () => {}) => ({
  key: "promote",
  label: "העלי לאדמין",
  onSelect,
});
const demote = (onSelect = () => {}) => ({
  key: "demote",
  label: "הסירי הרשאות",
  tone: "danger",
  onSelect,
});

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

  // MEH-1251: the open panel must render OUTSIDE the component's own wrapper —
  // portaled to document.body — so the admin tables' overflow-hidden /
  // overflow-x-auto containers can't clip it on lower rows. This is the
  // structural assertion behind the "menu fully visible for the LAST row" AC:
  // once the panel is a body child + `fixed`, no ancestor overflow clips it.
  it("portals the open panel to document.body (escapes overflow clipping)", () => {
    const { container } = renderMenu([promote(), demote()]);
    fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
    const menu = screen.getByRole("menu");
    // Rendered as a direct child of <body>, NOT inside the component container.
    expect(menu.parentElement).toBe(document.body);
    expect(container.contains(menu)).toBe(false);
    // `fixed` positioning is what lets it escape the clipping ancestor.
    expect(menu.style.position).toBe("fixed");
    // aria-controls still resolves across the portal boundary (ID reference).
    const trigger = screen.getByRole("button", { name: "פעולות נוספות" });
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
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
  // when actions move into the menu (producers table). Ch.B: aria-disabled +
  // click-guard instead of native disabled so busy items stay focusable (APG).
  it("renders a disabled item as aria-disabled, still focusable; click does not fire onSelect or close", () => {
    const onSelect = vi.fn();
    renderMenu([
      {
        key: "delete",
        label: "מחקו",
        tone: "danger",
        disabled: true,
        onSelect,
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
    const item = screen.getByRole("menuitem", { name: "מחקו" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    item.focus();
    expect(document.activeElement).toBe(item); // keyboard users can reach it (APG)
    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("items without a disabled flag carry no aria-disabled (users-page consumer unchanged)", () => {
    renderMenu([promote(), { ...demote(), disabled: false }]);
    fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
    screen.getAllByRole("menuitem").forEach((it) => {
      expect(it).not.toHaveAttribute("aria-disabled");
      expect(it).toBeEnabled();
    });
  });

  it("renders both promote and demote items when provided", () => {
    renderMenu([promote(), demote()]);
    fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(
      screen.getByRole("menuitem", { name: "הסירי הרשאות" }),
    ).toBeInTheDocument();
  });

  // ── MEH-2267 — WAI-ARIA APG menu-button keyboard contract ────────────────
  //
  // The panel is portaled to the END of <body> (MEH-1251), so before this the
  // items sat after every other focusable node on the page: from the open
  // trigger, one Tab landed on the NEXT table row's control. Every assertion
  // below fails against the pre-MEH-2267 component — the "Shown-failing" run
  // is in the PR body, and each case names the specific thing it discriminates.
  describe("MEH-2267 — keyboard (APG menu button)", () => {
    it("moves focus to the first item on open", () => {
      renderMenu([promote(), demote()]);
      fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
      // Old behaviour: focus stayed on the trigger and this was the trigger.
      expect(document.activeElement).toBe(
        screen.getByRole("menuitem", { name: "העלי לאדמין" }),
      );
    });

    it("skips a busy (aria-disabled) first item, landing on the first choosable one", () => {
      renderMenu([{ ...promote(), disabled: true }, demote()]);
      fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
      expect(document.activeElement).toBe(
        screen.getByRole("menuitem", { name: "הסירי הרשאות" }),
      );
    });

    it("falls back to the first item when EVERY item is busy — focus is never dropped to <body>", () => {
      renderMenu([
        { ...promote(), disabled: true },
        { ...demote(), disabled: true },
      ]);
      fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(
        screen.getByRole("menuitem", { name: "העלי לאדמין" }),
      );
    });

    it("ArrowDown/ArrowUp walk the items and wrap in both directions", () => {
      renderMenu([promote(), demote()]);
      fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
      const menu = screen.getByRole("menu");
      const [first, second] = screen.getAllByRole("menuitem");
      fireEvent.keyDown(menu, { key: "ArrowDown" });
      expect(document.activeElement).toBe(second);
      fireEvent.keyDown(menu, { key: "ArrowDown" }); // wraps forward
      expect(document.activeElement).toBe(first);
      fireEvent.keyDown(menu, { key: "ArrowUp" }); // wraps backward
      expect(document.activeElement).toBe(second);
      fireEvent.keyDown(menu, { key: "ArrowUp" });
      expect(document.activeElement).toBe(first);
    });

    it("Arrow navigation does NOT skip an aria-disabled item (MEH-1027 Ch.B — busy items stay perceivable)", () => {
      renderMenu([promote(), { ...demote(), disabled: true }]);
      fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
      fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
      expect(document.activeElement).toBe(
        screen.getByRole("menuitem", { name: "הסירי הרשאות" }),
      );
    });

    it("Home and End jump to the ends", () => {
      renderMenu([promote(), demote()]);
      fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
      const menu = screen.getByRole("menu");
      const [first, last] = screen.getAllByRole("menuitem");
      fireEvent.keyDown(menu, { key: "End" });
      expect(document.activeElement).toBe(last);
      fireEvent.keyDown(menu, { key: "Home" });
      expect(document.activeElement).toBe(first);
    });

    it("Tab closes the menu and returns focus to the trigger (APG — not a focus trap)", () => {
      renderMenu([promote(), demote()]);
      const trigger = screen.getByRole("button", { name: "פעולות נוספות" });
      fireEvent.click(trigger);
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" });
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });

    // An unhandled key must be inert: no focus move, no close, and no
    // preventDefault (typing must still reach whatever else listens).
    //
    // This case replaced a prototype-pollution probe (`key: "toString"`) that
    // did NOT discriminate: React normalises `e.key` through a plain-object
    // lookup of its own, so a prototype-named key reaches the handler as a
    // function and matches nothing — the assertion passed identically against a
    // Map lookup and against the object lookup it existed to reject. Measured,
    // then deleted rather than reformulated. See the note at MENU_NAV.
    it("an unhandled key is inert — focus stays put and the menu stays open", () => {
      renderMenu([promote(), demote()]);
      fireEvent.click(screen.getByRole("button", { name: "פעולות נוספות" }));
      const menu = screen.getByRole("menu");
      const [, second] = screen.getAllByRole("menuitem");
      fireEvent.keyDown(menu, { key: "ArrowDown" });
      expect(document.activeElement).toBe(second); // control: arrows do work
      fireEvent.keyDown(menu, { key: "PageDown" });
      expect(document.activeElement).toBe(second);
      fireEvent.keyDown(menu, { key: "a" });
      expect(document.activeElement).toBe(second);
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });
  });
});
