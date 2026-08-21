import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  renderHook,
  act,
  waitFor,
} from "@testing-library/react";
import AdminReviewChecklist from "@/app/[locale]/admin/producers/AdminReviewChecklist";
import { useReviewChecklist } from "@/app/[locale]/admin/producers/use-review-checklist";
import {
  ADMIN_REVIEW_CHECKLIST,
  ADMIN_REVIEW_CHECKLIST_TITLE,
  ADMIN_REVIEW_APPROVE_CONFIRM,
} from "@/lib/admin-review-checklist";
import api from "@/lib/api";

/**
 * MEH-1396 shipped this as a static config with session-local ticks.
 * MEH-1399 (Phase 2) moved the items to the API and made the ticks persist.
 *
 * ONE PHASE 1 ASSERTION WAS INVERTED ON PURPOSE, not repaired to pass.
 * The old suite asserted "collapsing resets a producer's ticks", which was
 * correct while ticks were ephemeral. They are now server state, so clearing
 * them on collapse would make a reopen render as though the checks had never
 * happened until the refetch landed. The test below now asserts the opposite
 * and says why — see `keeps ticks across collapse`.
 *
 * The static constant keeps two consumers and is still tested: the section
 * title and the approve-confirm copy. Its 7 ITEMS are now only the migration's
 * seed, so the item assertions moved to the API-driven cases.
 */

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn() },
}));

const ITEMS = [
  { id: "11111111-1111-1111-1111-111111111111", label: "פרטים בסיסיים תקינים", hint: "שם, עיר, טלפון" },
  { id: "22222222-2222-2222-2222-222222222222", label: "תמונות שייכות לעסק", hint: "חשד לתמונת סטוק" },
  { id: "33333333-3333-3333-3333-333333333333", label: "רישיון הוצלב", hint: null },
];

function mockApi({ items = ITEMS, checks = [] } = {}) {
  api.get.mockImplementation((url) => {
    if (url.startsWith("/admin/checklist-items")) {
      return Promise.resolve({ data: items });
    }
    return Promise.resolve({ data: { producer_id: "p1", checks } });
  });
  api.put.mockImplementation((_url, body) =>
    Promise.resolve({
      data: {
        producer_id: "p1",
        checks: body.item_ids.map((id) => ({
          item_id: id,
          label_snapshot: "snapshot",
          checked_by_name: "ספיר",
          checked_at: "2026-08-21T00:00:00Z",
        })),
      },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe("admin-review-checklist config (still the seed + shared copy)", () => {
  it("exposes 7 seed items and the confirm copy interpolates the count", () => {
    expect(ADMIN_REVIEW_CHECKLIST).toHaveLength(7);
    expect(ADMIN_REVIEW_APPROVE_CONFIRM.message(3)).toContain("3");
    expect(ADMIN_REVIEW_APPROVE_CONFIRM.message(3)).toContain("לאשר בכל זאת");
  });
});

describe("AdminReviewChecklist component", () => {
  const baseProps = {
    onToggleOpen: vi.fn(),
    onToggleItem: vi.fn(),
    items: ITEMS,
    itemsError: false,
    onReloadItems: vi.fn(),
    saving: false,
    producer: { id: "p1", name: "מאפייה", city: "צפת", images: [] },
  };

  it("shows only the title when collapsed (no checkboxes)", () => {
    render(<AdminReviewChecklist {...baseProps} open={false} />);
    expect(screen.getByText(ADMIN_REVIEW_CHECKLIST_TITLE)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders the API items with labels + hints when expanded", () => {
    render(<AdminReviewChecklist {...baseProps} open />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(ITEMS.length);
    expect(screen.getByText("פרטים בסיסיים תקינים")).toBeInTheDocument();
    expect(screen.getByText("חשד לתמונת סטוק")).toBeInTheDocument();
  });

  it("fires onToggleItem with the item's UUID, not its index", () => {
    const onToggleItem = vi.fn();
    render(
      <AdminReviewChecklist
        {...baseProps}
        open
        checkedIds={new Set([ITEMS[0].id])}
        onToggleItem={onToggleItem}
      />,
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0]).toBeChecked();
    expect(boxes[1]).not.toBeChecked();
    fireEvent.click(boxes[1]);
    expect(onToggleItem).toHaveBeenCalledWith(ITEMS[1].id);
  });

  // The 5-state matrix (CLAUDE.md): (loading / 0 items / many) × (closed / open).
  // Loading and empty are separate states on purpose — collapsing them would
  // show "no items" during every load.
  it("distinguishes loading from a genuinely empty list", () => {
    const { rerender } = render(
      <AdminReviewChecklist {...baseProps} open items={null} />,
    );
    expect(screen.getByText("טוענת…")).toBeInTheDocument();
    expect(screen.queryByText(/אין סעיפים פעילים/)).not.toBeInTheDocument();

    rerender(<AdminReviewChecklist {...baseProps} open items={[]} />);
    expect(screen.queryByText("טוענת…")).not.toBeInTheDocument();
    expect(screen.getByText(/אין סעיפים פעילים/)).toBeInTheDocument();
  });

  it("the collapsed counter does not claim 0/0 while still loading", () => {
    render(<AdminReviewChecklist {...baseProps} open={false} items={null} />);
    expect(screen.getByText("(…)")).toBeInTheDocument();
    expect(screen.queryByText("(0/0)")).not.toBeInTheDocument();
  });

  it("offers a retry when the item list failed to load", () => {
    const onReloadItems = vi.fn();
    render(
      <AdminReviewChecklist
        {...baseProps}
        open
        items={[]}
        itemsError
        onReloadItems={onReloadItems}
      />,
    );
    fireEvent.click(screen.getByText("נסי שוב"));
    expect(onReloadItems).toHaveBeenCalled();
  });
});

describe("ReviewEvidence (chunk 4) — rendered inside the expanded checklist", () => {
  const props = {
    onToggleOpen: vi.fn(),
    onToggleItem: vi.fn(),
    items: ITEMS,
    itemsError: false,
    onReloadItems: vi.fn(),
    saving: false,
    open: true,
  };

  it("links to the health registry and builds a quoted Google query", () => {
    render(
      <AdminReviewChecklist
        {...props}
        producer={{ id: "p1", name: "מאפיית הגליל", city: "צפת", images: [] }}
      />,
    );
    const google = screen.getByText("חיפוש בגוגל").closest("a");
    // The quotes are the point — an unquoted name matches half the internet.
    expect(decodeURIComponent(google.getAttribute("href"))).toContain(
      '"מאפיית הגליל" צפת',
    );
    expect(screen.getByText("מאגר משרד הבריאות").closest("a")).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("renders a reverse-image link per photo, and says so when there are none", () => {
    const { rerender } = render(
      <AdminReviewChecklist
        {...props}
        producer={{
          id: "p1",
          name: "א",
          city: "ב",
          images: ["https://example.com/a.jpg"],
        }}
      />,
    );
    const lens = screen.getByAltText("חיפוש הפוך לתמונה").closest("a");
    expect(lens.getAttribute("href")).toContain("lens.google.com/uploadbyurl");
    expect(decodeURIComponent(lens.getAttribute("href"))).toContain(
      "https://example.com/a.jpg",
    );

    rerender(
      <AdminReviewChecklist
        {...props}
        producer={{ id: "p1", name: "א", city: "ב", images: [] }}
      />,
    );
    expect(screen.getByText("אין תמונות")).toBeInTheDocument();
  });

  it("shows the licence expiry when present and says so when absent", () => {
    const { rerender } = render(
      <AdminReviewChecklist
        {...props}
        producer={{
          id: "p1",
          name: "א",
          city: "ב",
          images: [],
          producer_license_number: "1234567",
          license_expires_at: "2026-09-10",
        }}
      />,
    );
    expect(screen.getByText("תוקף: 2026-09-10")).toBeInTheDocument();

    rerender(
      <AdminReviewChecklist
        {...props}
        producer={{ id: "p1", name: "א", city: "ב", images: [] }}
      />,
    );
    expect(screen.getByText("אין מספר רישיון")).toBeInTheDocument();
    expect(screen.queryByText(/^תוקף:/)).not.toBeInTheDocument();
  });
});

describe("useReviewChecklist — persistence + the soft approve gate", () => {
  it("loads the active items on mount", async () => {
    const { result } = renderHook(() => useReviewChecklist(vi.fn()));
    await waitFor(() => expect(result.current.items).toHaveLength(ITEMS.length));
    expect(api.get).toHaveBeenCalledWith("/admin/checklist-items");
  });

  it("persists a tick through the API", async () => {
    const { result } = renderHook(() => useReviewChecklist(vi.fn()));
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    await act(async () => result.current.toggleItem("p1", ITEMS[0].id));

    expect(api.put).toHaveBeenCalledWith("/admin/producers/p1/review-checks", {
      item_ids: [ITEMS[0].id],
    });
    await waitFor(() =>
      expect(result.current.checked.p1.has(ITEMS[0].id)).toBe(true),
    );
  });

  it("rolls the optimistic tick back when the save fails", async () => {
    // The dangerous direction is leaving the tick on screen after a failed
    // save: the admin would believe a check was recorded when nothing was.
    api.put.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useReviewChecklist(vi.fn()));
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    await act(async () => result.current.toggleItem("p1", ITEMS[0].id));

    await waitFor(() =>
      expect(result.current.checked.p1?.has(ITEMS[0].id)).toBeFalsy(),
    );
  });

  it("keeps ticks across collapse — INVERTED from Phase 1, deliberately", async () => {
    // Phase 1 cleared on collapse because ticks were ephemeral. They are server
    // state now, so clearing would make a reopen look like the checks never
    // happened until the refetch landed. Asserting the new contract rather than
    // deleting the old test.
    const { result } = renderHook(() => useReviewChecklist(vi.fn()));
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    await act(async () => result.current.toggleItem("p1", ITEMS[0].id));
    await waitFor(() => expect(result.current.checked.p1.size).toBe(1));

    act(() => result.current.toggleOpen("p1"));
    act(() => result.current.toggleOpen("p1"));

    expect(result.current.openId).toBeNull();
    expect(result.current.checked.p1.size).toBe(1);
  });

  it("opens the confirm dialog (does not approve) when items remain unticked", async () => {
    const approve = vi.fn();
    const { result } = renderHook(() => useReviewChecklist(approve));
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    act(() => result.current.attemptApprove({ id: "p1" }));
    expect(approve).not.toHaveBeenCalled();
    // Count comes from the API list length, not the static constant's 7.
    expect(result.current.approveConfirm).toEqual({
      producer: { id: "p1" },
      count: 3,
    });
  });

  it("approves straight through (no dialog) when all items are ticked", async () => {
    const approve = vi.fn();
    const { result } = renderHook(() => useReviewChecklist(approve));
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    for (const item of ITEMS) {
      await act(async () => result.current.toggleItem("p1", item.id));
    }
    await waitFor(() => expect(result.current.uncheckedCount("p1")).toBe(0));

    act(() => result.current.attemptApprove({ id: "p1" }));
    expect(approve).toHaveBeenCalledWith({ id: "p1" });
    expect(result.current.approveConfirm).toBeNull();
  });

  it("confirmApprove fires the real approve and closes the dialog", async () => {
    const approve = vi.fn();
    const { result } = renderHook(() => useReviewChecklist(approve));
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    act(() => result.current.attemptApprove({ id: "p3" }));
    act(() => result.current.confirmApprove());
    expect(approve).toHaveBeenCalledWith({ id: "p3" });
    expect(result.current.approveConfirm).toBeNull();
  });

  it("cancelApprove closes the dialog WITHOUT approving", async () => {
    const approve = vi.fn();
    const { result } = renderHook(() => useReviewChecklist(approve));
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    act(() => result.current.attemptApprove({ id: "p4" }));
    act(() => result.current.cancelApprove());
    expect(approve).not.toHaveBeenCalled();
    expect(result.current.approveConfirm).toBeNull();
  });
});
