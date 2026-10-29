import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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
      onDeleteProducer={vi.fn()}
      onToggleStoryCard={vi.fn()}
    />
  );
  return { onQuickApprove, onRequestChanges };
}

describe("ProducerActions — approve gate (MEH-745)", () => {
  // A sibling case here asserted approve for a `pending_whatsapp` producer;
  // that status was removed in MEH-2124, so the case was deleted rather than
  // retargeted — the `pending` case below is the same
  // assertion against the only waiting status that now exists.
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

  // MEH-2299: this detail used to fall through to "photo" — red before the fix.
  it("maps the WhatsApp-verification gate detail to 'phone', not 'photo'", () => {
    expect(
      approveGateReason(
        "לא ניתן לאשר בית עסק ללא אימות מספר הוואטסאפ. בקשי מבעלת העסק לאמת את המספר, או אשרי עם דריסה מפורשת.",
      ),
    ).toBe("phone");
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
// MEH-2509: the ambassador item is gone from the kebab (it duplicated
// «בחירת העורכת»). Its two action keys are named here only to assert absence.
const AMBASSADOR_OFF_KEY = "admin.producers.table.actions.set_ambassador_title";
const AMBASSADOR_ON_KEY = "admin.producers.table.actions.remove_ambassador_title";
const STORY_KEY = "admin.producers.table.actions.story_card";
const DELETE_KEY = "admin.common.delete";
// MEH-226: pending-only terminal reject (kebab, danger tone).
const REJECT_KEY = "admin.producers.table.actions.reject";

function renderRow(producer, { isBusy } = {}) {
  const handlers = {
    onQuickApprove: vi.fn(),
    onRequestChanges: vi.fn(),
    onToggleStatus: vi.fn(),
    onDeleteProducer: vi.fn(),
    onReject: vi.fn(),
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
  // MEH-2509: an EXACT list — status, story, delete, in that order. A
  // re-added ambassador item (or any stray entry) breaks the count.
  it("approved row: status/story/delete are NOT inline, and are exactly the kebab's items", () => {
    renderRow({ id: "p1", status: "approved", slug: "farm", ambassador: false, name: "חוה" });
    [SUSPEND_KEY, STORY_KEY, DELETE_KEY].forEach((k) =>
      expect(screen.queryByText(k)).not.toBeInTheDocument()
    );
    openMenu();
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(SUSPEND_KEY);
    expect(items[1]).toHaveTextContent(STORY_KEY);
    expect(items[2]).toHaveTextContent(DELETE_KEY);
  });

  // MEH-226 changed this row's expected contents: reject joined delete in the
  // kebab for pending producers. Kept as an EXACT count naming both items —
  // relaxing it to "contains delete" would stop catching a stray third entry,
  // which is the whole property this case was written for.
  it("pending row: menu contains exactly reject + delete (status/ambassador/story guards hold)", () => {
    renderRow({ id: "p1", status: "pending", name: "חוה" });
    openMenu();
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(REJECT_KEY);
    expect(items[1]).toHaveTextContent(DELETE_KEY);
  });

  it("approved row: reject is absent (it is a pending-only action)", () => {
    renderRow({ id: "p1", status: "approved", slug: "farm", name: "חוה" });
    openMenu();
    expect(screen.queryByRole("menuitem", { name: REJECT_KEY })).not.toBeInTheDocument();
  });

  it("reject item carries danger tone and fires onReject with the producer", () => {
    const producer = { id: "p1", status: "pending", name: "חוה" };
    const h = renderRow(producer);
    openMenu();
    const reject = screen.getByRole("menuitem", { name: REJECT_KEY });
    expect(reject).toHaveClass("text-red-600");
    fireEvent.click(reject);
    // the whole producer, not just the id — ProducerDecisionModal renders its name.
    expect(h.onReject).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", name: "חוה" }));
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
    expect(del).toHaveClass("text-red-600");
    fireEvent.click(del);
    expect(h.onDeleteProducer).toHaveBeenCalledWith("p1", "חוה");
  });

  it("story item fires onToggleStoryCard(id) — canvas wiring unchanged", () => {
    const h = renderRow({ id: "p1", status: "approved", slug: "farm", name: "חוה" });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: STORY_KEY }));
    expect(h.onToggleStoryCard).toHaveBeenCalledWith("p1");
  });

  // MEH-2509 — neither direction of the retired ambassador toggle renders,
  // whatever the stored flag says.
  it("ambassador item is absent for ambassador=false and ambassador=true", () => {
    renderRow({ id: "p1", status: "approved", slug: "farm", ambassador: false, name: "חוה" });
    openMenu();
    expect(screen.queryByRole("menuitem", { name: AMBASSADOR_OFF_KEY })).not.toBeInTheDocument();

    cleanup();

    renderRow({ id: "p2", status: "approved", slug: "farm", ambassador: true, name: "חוה" });
    openMenu();
    expect(screen.queryByRole("menuitem", { name: AMBASSADOR_ON_KEY })).not.toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });

  it("busy action marks its menu item aria-disabled and blocks the handler (isBusy keys unchanged)", () => {
    const h = renderRow(
      { id: "p1", status: "approved", slug: "farm", name: "חוה" },
      { isBusy: (k) => k === "delete:p1" }
    );
    openMenu();
    const del = screen.getByRole("menuitem", { name: DELETE_KEY });
    // MEH-1027 Ch.B: aria-disabled (focusable) instead of native disabled (APG).
    expect(del).toHaveAttribute("aria-disabled", "true");
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
