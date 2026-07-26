/**
 * MEH-1546 — ProducerHeader status precedence (the page's ONLY order status).
 *
 * The rewritten spec's core finding: a second status line is not a colour
 * clash but a factual contradiction (availability_state=available + a window
 * that closed at 14:00 would assert both "פתוח להזמנות" and "ההזמנות סגורות
 * עכשיו" at 16:00). So order_window feeds the existing single element via
 * resolveHeaderStatus, and these are its five branches.
 *
 * Pure mapper — no React, no i18n. Copy lives in he/en; this pins precedence,
 * tone (one green) and the data-testid contract.
 */
import { describe, it, expect } from "vitest";
import { resolveHeaderStatus } from "@/app/[locale]/producer/[id]/lib/order-status";

const OPEN = { state: "open", nextChange: new Date("2026-07-26T11:00:00Z") };
const CLOSING = { state: "closing_soon", nextChange: new Date("2026-07-26T11:00:00Z") };
const CLOSED = { state: "closed", nextChange: new Date("2026-07-27T06:00:00Z") };

describe("resolveHeaderStatus — precedence, first match wins", () => {
  it("1) vacation wins over everything, including an open window", () => {
    const s = resolveHeaderStatus({ isVacation: true, isClosed: false, orderStatus: OPEN });
    expect(s.branch).toBe("vacation");
    expect(s.tone).toBe("text-gold-deep");
    expect(s.testid).toBe("status-vacation");
  });

  it("2) full / full_this_week wins over the order window", () => {
    const s = resolveHeaderStatus({ isVacation: false, isClosed: true, orderStatus: OPEN });
    expect(s.branch).toBe("closed");
    expect(s.tone).toBe("text-muted");
    expect(s.testid).toBe("status-closed");
  });

  it("3) order window closed → muted, its own testid", () => {
    const s = resolveHeaderStatus({ isVacation: false, isClosed: false, orderStatus: CLOSED });
    expect(s.branch).toBe("orders_closed");
    expect(s.tone).toBe("text-muted");
    expect(s.testid).toBe("status-orders-closed");
    expect(s.nextChange).toBe(CLOSED.nextChange);
  });

  it("4) order window open → primary, REUSES status-open", () => {
    const s = resolveHeaderStatus({ isVacation: false, isClosed: false, orderStatus: OPEN });
    expect(s.branch).toBe("orders_open");
    expect(s.tone).toBe("text-primary");
    expect(s.testid).toBe("status-open");
    expect(s.nextChange).toBe(OPEN.nextChange);
  });

  it("5) no order window → the pre-MEH-1546 output, unchanged", () => {
    const s = resolveHeaderStatus({ isVacation: false, isClosed: false, orderStatus: null });
    expect(s.branch).toBe("open");
    expect(s.tone).toBe("text-primary");
    expect(s.testid).toBe("status-open");
    expect(s.nextChange).toBeUndefined();
  });
});

describe("closing_soon is dropped as a VISUAL state", () => {
  it("maps to the plain open branch — no urgency tone, no separate testid", () => {
    const soon = resolveHeaderStatus({ isVacation: false, isClosed: false, orderStatus: CLOSING });
    const open = resolveHeaderStatus({ isVacation: false, isClosed: false, orderStatus: OPEN });
    expect(soon.branch).toBe(open.branch);
    expect(soon.tone).toBe(open.tone);
    expect(soon.testid).toBe(open.testid);
  });
});

describe("SSR safety", () => {
  it("a null orderStatus (server pass / pre-mount) resolves to branch 5", () => {
    // The server cannot know the time-derived state, so it must render exactly
    // what a windowless producer renders — otherwise hydration mismatches.
    expect(resolveHeaderStatus({ isVacation: false, isClosed: false, orderStatus: null }))
      .toEqual(resolveHeaderStatus({ isVacation: false, isClosed: false, orderStatus: undefined }));
  });
});

describe("one green per page", () => {
  it("only the two open branches use the primary tone", () => {
    const cases = [
      { isVacation: true, isClosed: false, orderStatus: null },
      { isVacation: false, isClosed: true, orderStatus: null },
      { isVacation: false, isClosed: false, orderStatus: CLOSED },
      { isVacation: false, isClosed: false, orderStatus: OPEN },
      { isVacation: false, isClosed: false, orderStatus: null },
    ].map(resolveHeaderStatus);
    expect(cases.filter((c) => c.tone === "text-primary")).toHaveLength(2);
    // …and every case yields exactly ONE element (one branch, one testid).
    expect(new Set(cases.map((c) => c.branch)).size).toBe(5);
  });
});
