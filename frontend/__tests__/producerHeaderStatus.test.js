/**
 * MEH-1546 — ProducerHeader status precedence (the page's ONLY order status).
 *
 * The rewritten spec's core finding: a second status line is not a colour
 * clash but a factual contradiction (availability_state=available plus a
 * window that closed at 14:00 would assert both "open for orders" and
 * "orders closed now" at 16:00). So order_window feeds the existing single
 * element via resolveHeaderStatus, and these are its five branches.
 *
 * Pure mapper — no React, no i18n. Copy lives in he/en; this pins precedence,
 * tone (one green) and the data-testid contract.
 */
import { describe, it, expect } from "vitest";
import {
  israelDayKey,
  israelTime,
  resolveHeaderStatus,
} from "@/app/[locale]/producer/[id]/lib/order-status";

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

describe("closed with no reopening time (PR review catch)", () => {
  // getOrderWindowStatus returns {state:"closed", nextChange:null} when a
  // window object exists but every day violates close > open. Interpolating
  // that null into the "reopening {day} at {time}" copy formats the epoch.
  it("degrades to the plain closed branch instead of an epoch date", () => {
    const s = resolveHeaderStatus({
      isVacation: false,
      isClosed: false,
      orderStatus: { state: "closed", nextChange: null },
    });
    expect(s.branch).toBe("closed");
    expect(s.tone).toBe("text-muted");
    expect(s.testid).toBe("status-closed");
    expect(s.nextChange).toBeUndefined();
  });

  it("still uses the orders_closed branch when a real reopening time exists", () => {
    expect(
      resolveHeaderStatus({ isVacation: false, isClosed: false, orderStatus: CLOSED }).branch
    ).toBe("orders_closed");
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

// MEH-2383 — the two formatters now derive from lib/orderWindow.js
// `israelNowParts`. Characterisation: the values below are what the previous
// private formatter returned on Node's ICU, and these pin them on both sides
// of an Israel midnight, in both offsets. The one place the refactor is NOT
// byte-identical is midnight itself: the old `en-GB` / `hour12:false`
// formatter could emit "24:MM" on some ICU builds; `israelNowParts` folds
// that to "00:MM", the stored/transported shape, and the first case pins it.
// No consumer compares against "24:" (grep, 27/10).
describe("israelTime / israelDayKey — Israel wall-clock, padded (MEH-2383)", () => {
  it("Mon 22:30Z in winter (IST, +2) is Tuesday 00:30 in Israel", () => {
    const d = new Date("2026-10-26T22:30:00Z");
    expect(israelTime(d)).toBe("00:30");
    expect(israelDayKey(d)).toBe("tue");
  });

  it("Mon 21:30Z in winter is still Monday 23:30 in Israel", () => {
    const d = new Date("2026-10-26T21:30:00Z");
    expect(israelTime(d)).toBe("23:30");
    expect(israelDayKey(d)).toBe("mon");
  });

  it("Fri 20:30Z in summer (IDT, +3) is Friday 23:30 — the hour keeps its pad", () => {
    const d = new Date("2026-06-05T20:30:00Z");
    expect(israelTime(d)).toBe("23:30");
    expect(israelDayKey(d)).toBe("fri");
  });

  it("Fri 06:05Z in summer is 09:05 — a single-digit hour is zero-padded", () => {
    expect(israelTime(new Date("2026-06-05T06:05:00Z"))).toBe("09:05");
  });
});

// MEH-2596: the tag tints its own text colour by 10%; `muted` fails AA on
// that tint (4.33:1), so the grey states darken to fg-muted in the tag only.
import { statusTagTone } from "@/app/[locale]/producer/[id]/lib/order-status";
describe("statusTagTone — AA on the tinted tag (MEH-2596)", () => {
  it("darkens the grey states and keeps the coloured ones", () => {
    expect(statusTagTone("text-muted")).toBe("text-fg-muted");
    expect(statusTagTone("text-primary")).toBe("text-primary");
    expect(statusTagTone("text-gold-deep")).toBe("text-gold-deep");
  });
});
