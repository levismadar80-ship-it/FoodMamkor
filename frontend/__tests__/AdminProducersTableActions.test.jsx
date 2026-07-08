import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ProducerActions,
  AwaitingCompletionBadge,
} from "@/app/[locale]/admin/producers/AdminProducersTable";
import { approveGateReason } from "@/app/[locale]/admin/producers/use-admin-producers";

// next-intl: identity-ish mock — return the full dotted key so we can
// assert on stable key strings rather than translated copy.
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
}));

const APPROVE_KEY = "admin.producers.table.actions.approve_short";
const REQUEST_CHANGES_KEY = "admin.producers.table.actions.request_changes";
const AWAITING_KEY = "admin.producers.table.awaiting_completion";

function renderActions(status) {
  const onQuickApprove = vi.fn();
  const onRequestChanges = vi.fn();
  render(
    <ProducerActions
      producer={{ id: "p1", status }}
      isStoryOpen={false}
      onQuickApprove={onQuickApprove}
      onRequestChanges={onRequestChanges}
      onToggleStatus={vi.fn()}
      onToggleAmbassador={vi.fn()}
      onDeleteProducer={vi.fn()}
      onToggleStoryCard={vi.fn()}
    />
  );
  return { onQuickApprove, onRequestChanges };
}

describe("ProducerActions — approve gate (MEH-745)", () => {
  it("renders approve for a self-registered pending_whatsapp producer", () => {
    renderActions("pending_whatsapp");
    expect(screen.getByText(APPROVE_KEY)).toBeInTheDocument();
  });

  it("still renders approve for a classic pending producer (no regression)", () => {
    renderActions("pending");
    expect(screen.getByText(APPROVE_KEY)).toBeInTheDocument();
  });

  it("does not render approve for an approved producer", () => {
    renderActions("approved");
    expect(screen.queryByText(APPROVE_KEY)).not.toBeInTheDocument();
  });

  // MEH-1011 Chunk 2 — approve now passes the full producer (so the 422
  // handler can open request-changes prefilled), not just the id.
  it("passes the full producer object to onQuickApprove", () => {
    const { onQuickApprove } = renderActions("pending");
    fireEvent.click(screen.getByText(APPROVE_KEY));
    expect(onQuickApprove).toHaveBeenCalledWith({ id: "p1", status: "pending" });
  });
});

describe("ProducerActions — request-changes button (MEH-1011)", () => {
  it("renders on a pending producer and calls onRequestChanges with the producer", () => {
    const { onRequestChanges } = renderActions("pending");
    const btn = screen.getByText(REQUEST_CHANGES_KEY);
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onRequestChanges).toHaveBeenCalledWith({ id: "p1", status: "pending" });
  });

  it("renders on a pending_whatsapp producer", () => {
    renderActions("pending_whatsapp");
    expect(screen.getByText(REQUEST_CHANGES_KEY)).toBeInTheDocument();
  });

  it("does NOT render for an approved producer (pending-only)", () => {
    renderActions("approved");
    expect(screen.queryByText(REQUEST_CHANGES_KEY)).not.toBeInTheDocument();
  });
});

describe("approveGateReason — 422 detail → chip mapping (MEH-1011)", () => {
  it("maps the MEH-971 license-gate detail to 'license'", () => {
    expect(
      approveGateReason(
        "לא ניתן לאשר בית עסק בקטגוריה הדורשת רישיון יצרן ללא מספר רישיון."
      )
    ).toBe("license");
  });

  it("maps the MEH-799 photo-gate detail to 'photo'", () => {
    expect(
      approveGateReason("לא ניתן לאשר בית עסק ללא תמונה. בקשי מבעלת העסק להעלות תמונה אחת לפחות.")
    ).toBe("photo");
  });

  it("defaults to 'photo' for empty/unknown detail", () => {
    expect(approveGateReason("")).toBe("photo");
    expect(approveGateReason(undefined)).toBe("photo");
  });
});

// MEH-1027 Chunk A — secondary/destructive actions (status/ambassador/story/
// delete) live in the AdminRowMenu kebab; approve/request-changes/edit/view
// stay inline. Same guards + handlers as before — only the trigger moved.
const MENU_ARIA_KEY = "admin.producers.table.actions.menu_aria";
const SUSPEND_KEY = "admin.producers.table.actions.suspend";
const ACTIVATE_KEY = "admin.producers.table.actions.activate";
const AMBASSADOR_OFF_KEY = "admin.producers.table.actions.ambassador_inactive";
const STORY_KEY = "admin.producers.table.actions.story_card";
const DELETE_KEY = "admin.common.delete";

function renderRow(producer, { isBusy } = {}) {
  const handlers = {
    onQuickApprove: vi.fn(),
    onRequestChanges: vi.fn(),
    onToggleStatus: vi.fn(),
    onToggleAmbassador: vi.fn(),
    onDeleteProducer: vi.fn(),
    onToggleStoryCard: vi.fn(),
  };
  render(
    <ProducerActions producer={producer} isStoryOpen={false} {...handlers} isBusy={isBusy} />
  );
  return handlers;
}

const openMenu = () =>
  fireEvent.click(screen.getByRole("button", { name: MENU_ARIA_KEY }));

describe("ProducerActions — overflow menu (MEH-1027 Chunk A)", () => {
  it("approved row: status/ambassador/story/delete are NOT inline, all appear in the kebab", () => {
    renderRow({ id: "p1", status: "approved", slug: "farm", ambassador: false, name: "חוה" });
    [SUSPEND_KEY, AMBASSADOR_OFF_KEY, STORY_KEY, DELETE_KEY].forEach((k) =>
      expect(screen.queryByText(k)).not.toBeInTheDocument()
    );
    openMenu();
    expect(screen.getByRole("menuitem", { name: SUSPEND_KEY })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: AMBASSADOR_OFF_KEY })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: STORY_KEY })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: DELETE_KEY })).toBeInTheDocument();
  });

  it("pending row: menu contains only delete (status/ambassador/story guards hold)", () => {
    renderRow({ id: "p1", status: "pending", name: "חוה" });
    openMenu();
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent(DELETE_KEY);
  });

  it("inactive row: menu shows activate (toggle-status guard unchanged)", () => {
    renderRow({ id: "p1", status: "inactive", name: "חוה" });
    openMenu();
    expect(screen.getByRole("menuitem", { name: ACTIVATE_KEY })).toBeInTheDocument();
  });

  it("delete item carries danger tone and fires onDeleteProducer(id, name)", () => {
    const h = renderRow({ id: "p1", status: "approved", slug: "farm", name: "חוה" });
    openMenu();
    const del = screen.getByRole("menuitem", { name: DELETE_KEY });
    expect(del.className).toContain("text-red-600");
    fireEvent.click(del);
    expect(h.onDeleteProducer).toHaveBeenCalledWith("p1", "חוה");
  });

  it("story item fires onToggleStoryCard(id) — canvas wiring unchanged", () => {
    const h = renderRow({ id: "p1", status: "approved", slug: "farm", name: "חוה" });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: STORY_KEY }));
    expect(h.onToggleStoryCard).toHaveBeenCalledWith("p1");
  });

  it("ambassador item fires onToggleAmbassador(id, current) — behavior unchanged", () => {
    const h = renderRow({ id: "p1", status: "approved", slug: "farm", ambassador: false, name: "חוה" });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: AMBASSADOR_OFF_KEY }));
    expect(h.onToggleAmbassador).toHaveBeenCalledWith("p1", false);
  });

  it("busy action disables its menu item and blocks the handler (isBusy keys unchanged)", () => {
    const h = renderRow(
      { id: "p1", status: "approved", slug: "farm", name: "חוה" },
      { isBusy: (k) => k === "delete:p1" }
    );
    openMenu();
    const del = screen.getByRole("menuitem", { name: DELETE_KEY });
    expect(del).toBeDisabled();
    fireEvent.click(del);
    expect(h.onDeleteProducer).not.toHaveBeenCalled();
  });

  it("pending row keeps approve/request-changes/edit inline alongside the kebab", () => {
    renderRow({ id: "p1", status: "pending", name: "חוה" });
    expect(screen.getByText(APPROVE_KEY)).toBeInTheDocument();
    expect(screen.getByText(REQUEST_CHANGES_KEY)).toBeInTheDocument();
    expect(screen.getByText("admin.common.edit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: MENU_ARIA_KEY })).toBeInTheDocument();
  });
});

describe("AwaitingCompletionBadge — trail badge (MEH-1011)", () => {
  it("renders 'ממתין להשלמה' + an LTR-wrapped date when requested_changes is set", () => {
    render(
      <AwaitingCompletionBadge
        producer={{
          requested_changes: "חסרה תמונה",
          changes_requested_at: "2026-07-04T08:00:00Z",
        }}
      />
    );
    expect(screen.getByText(AWAITING_KEY)).toBeInTheDocument();
    // date segment is wrapped dir="ltr" so RTL doesn't flip it
    const ltr = document.querySelector('span[dir="ltr"]');
    expect(ltr).not.toBeNull();
  });

  it("renders nothing when requested_changes is null", () => {
    const { container } = render(
      <AwaitingCompletionBadge producer={{ requested_changes: null }} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
