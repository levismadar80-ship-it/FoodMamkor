import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import AdminReviewChecklist from "@/app/[locale]/admin/producers/AdminReviewChecklist";
import { useReviewChecklist } from "@/app/[locale]/admin/producers/use-review-checklist";
import {
  ADMIN_REVIEW_CHECKLIST,
  ADMIN_REVIEW_CHECKLIST_TITLE,
  ADMIN_REVIEW_APPROVE_CONFIRM,
} from "@/lib/admin-review-checklist";

// MEH-1396 — pre-approval review checklist (static config, session-local).

describe("admin-review-checklist config", () => {
  it("exposes 7 items with unique ids and Hebrew labels", () => {
    expect(ADMIN_REVIEW_CHECKLIST).toHaveLength(7);
    const ids = ADMIN_REVIEW_CHECKLIST.map((i) => i.id);
    expect(new Set(ids).size).toBe(7);
    ADMIN_REVIEW_CHECKLIST.forEach((i) => expect(i.label.length).toBeGreaterThan(0));
  });

  it("interpolates the remaining count into the confirm message", () => {
    expect(ADMIN_REVIEW_APPROVE_CONFIRM.message(3)).toContain("3");
    expect(ADMIN_REVIEW_APPROVE_CONFIRM.message(3)).toContain("לאשר בכל זאת");
  });
});

describe("AdminReviewChecklist component", () => {
  it("shows only the title when collapsed (no checkboxes)", () => {
    render(
      <AdminReviewChecklist open={false} onToggleOpen={vi.fn()} onToggleItem={vi.fn()} />
    );
    expect(screen.getByText(ADMIN_REVIEW_CHECKLIST_TITLE)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders all 7 items with labels + hints when expanded", () => {
    render(
      <AdminReviewChecklist open onToggleOpen={vi.fn()} onToggleItem={vi.fn()} />
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
    expect(screen.getByText("פרטים בסיסיים תקינים")).toBeInTheDocument();
    // a hint from item #2 renders
    expect(screen.getByText("חשד לתמונת סטוק — בדקי חיפוש הפוך")).toBeInTheDocument();
  });

  it("reflects checked state and fires onToggleItem with the item id", () => {
    const onToggleItem = vi.fn();
    render(
      <AdminReviewChecklist
        open
        onToggleOpen={vi.fn()}
        checkedIds={new Set(["basics"])}
        onToggleItem={onToggleItem}
      />
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0]).toBeChecked(); // "basics" is item #1
    expect(boxes[1]).not.toBeChecked();
    fireEvent.click(boxes[1]); // "photos" is item #2
    expect(onToggleItem).toHaveBeenCalledWith("photos");
  });

  it("toggles the header open/closed via onToggleOpen", () => {
    const onToggleOpen = vi.fn();
    render(
      <AdminReviewChecklist open={false} onToggleOpen={onToggleOpen} onToggleItem={vi.fn()} />
    );
    fireEvent.click(screen.getByText(ADMIN_REVIEW_CHECKLIST_TITLE));
    expect(onToggleOpen).toHaveBeenCalled();
  });
});

describe("useReviewChecklist — soft approve gate", () => {
  it("opens the confirm dialog (does not approve) when items remain unticked", () => {
    const approve = vi.fn();
    const { result } = renderHook(() => useReviewChecklist(approve));
    act(() => result.current.attemptApprove({ id: "p1" }));
    expect(approve).not.toHaveBeenCalled();
    expect(result.current.approveConfirm).toEqual({ producer: { id: "p1" }, count: 7 });
  });

  it("approves straight through (no dialog) when all items are ticked", () => {
    const approve = vi.fn();
    const { result } = renderHook(() => useReviewChecklist(approve));
    act(() => {
      ADMIN_REVIEW_CHECKLIST.forEach((i) => result.current.toggleItem("p2", i.id));
    });
    expect(result.current.uncheckedCount("p2")).toBe(0);
    act(() => result.current.attemptApprove({ id: "p2" }));
    expect(approve).toHaveBeenCalledWith({ id: "p2" });
    expect(result.current.approveConfirm).toBeNull();
  });

  it("confirmApprove fires the real approve and closes the dialog", () => {
    const approve = vi.fn();
    const { result } = renderHook(() => useReviewChecklist(approve));
    act(() => result.current.attemptApprove({ id: "p3" }));
    act(() => result.current.confirmApprove());
    expect(approve).toHaveBeenCalledWith({ id: "p3" });
    expect(result.current.approveConfirm).toBeNull();
  });

  it("cancelApprove closes the dialog WITHOUT approving", () => {
    const approve = vi.fn();
    const { result } = renderHook(() => useReviewChecklist(approve));
    act(() => result.current.attemptApprove({ id: "p4" }));
    act(() => result.current.cancelApprove());
    expect(approve).not.toHaveBeenCalled();
    expect(result.current.approveConfirm).toBeNull();
  });

  it("resets a producer's ticks on collapse (open→close clears)", () => {
    const { result } = renderHook(() => useReviewChecklist(vi.fn()));
    act(() => result.current.toggleItem("p5", "basics"));
    act(() => result.current.toggleOpen("p5")); // open
    expect(result.current.openId).toBe("p5");
    expect(result.current.uncheckedCount("p5")).toBe(6);
    act(() => result.current.toggleOpen("p5")); // close → resets
    expect(result.current.openId).toBeNull();
    expect(result.current.uncheckedCount("p5")).toBe(7);
  });
});
