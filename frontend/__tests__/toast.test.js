/**
 * MEH-685 — toast store API contract.
 *
 * Covers the semantic methods (showToast.success/error/info), the opaque
 * icon-override pass-through, action handling, auto-dismiss, subscriber
 * notification, and the legacy positional backward-compat shim.
 *
 * resetModules + dynamic import per test → fresh module-level `toasts = []`,
 * so the singleton store can't leak state across cases.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let toast;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  toast = await import("../lib/toast.js");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toast store — semantic methods (MEH-685)", () => {
  it("success() enqueues type=success with no explicit icon", () => {
    toast.showToast.success("נשמר");
    const [t] = toast.getToasts();
    expect(t.type).toBe("success");
    expect(t.message).toBe("נשמר");
    expect(t.icon).toBeNull(); // default resolved in Toaster, not the store
    expect(t.action).toBeNull();
  });

  it("error() enqueues type=error", () => {
    toast.showToast.error("שגיאה");
    expect(toast.getToasts()[0].type).toBe("error");
  });

  it("info() enqueues type=info", () => {
    toast.showToast.info("מידע");
    expect(toast.getToasts()[0].type).toBe("info");
  });

  it("passes an explicit icon override through opaquely", () => {
    // The store never touches React — a sentinel node proves pass-through.
    toast.showToast.success("עוקבת", { icon: "BELL_NODE" });
    expect(toast.getToasts()[0].icon).toBe("BELL_NODE");
  });

  it("carries a complete action", () => {
    toast.showToast.info("פג", { action: { label: "התחברי", href: "/login" } });
    expect(toast.getToasts()[0].action).toEqual({ label: "התחברי", href: "/login" });
  });

  it("drops an incomplete action (label without href)", () => {
    toast.showToast.success("x", { action: { label: "only" } });
    expect(toast.getToasts()[0].action).toBeNull();
  });

  it("auto-dismisses after a custom duration", () => {
    toast.showToast.success("bye", { duration: 100 });
    expect(toast.getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(100);
    expect(toast.getToasts()).toHaveLength(0);
  });

  it("notifies subscribers on enqueue and on dismiss", () => {
    const spy = vi.fn();
    const unsub = toast.subscribe(spy);
    toast.showToast.info("x", { duration: 50 });
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50);
    expect(spy).toHaveBeenCalledTimes(2);
    unsub();
  });
});

// MEH-3173: a fixed id dedupes — the same toast raised N times shows once
// (sonner / react-hot-toast `id` semantics).
describe("toast store — fixed id dedupe (MEH-3173)", () => {
  it("same id twice → one toast in the store", () => {
    toast.showToast.info("פג תוקף", { id: "session-expired" });
    toast.showToast.info("פג תוקף", { id: "session-expired" });
    expect(toast.getToasts()).toHaveLength(1);
  });

  it("5 calls with the same id → one toast", () => {
    for (let i = 0; i < 5; i++) toast.showToast.info("פג תוקף", { id: "session-expired" });
    expect(toast.getToasts()).toHaveLength(1);
  });

  it("no id, same text twice (double tap) → one toast", () => {
    toast.showToast.info("א");
    toast.showToast.info("א");
    expect(toast.getToasts()).toHaveLength(1);
  });

  it("no id, different text → both stay (stacking still works)", () => {
    toast.showToast.info("א");
    toast.showToast.info("ב");
    expect(toast.getToasts()).toHaveLength(2);
  });

  it("same text, different type → two toasts (type is part of the key)", () => {
    toast.showToast.info("א");
    toast.showToast.error("א");
    expect(toast.getToasts()).toHaveLength(2);
  });

  it("a repeat keeps the entry's id, so the Toaster updates in place", () => {
    toast.showToast.info("א", { id: "k" });
    const first = toast.getToasts()[0].id;
    toast.showToast.info("ב", { id: "k" });
    expect(toast.getToasts()).toHaveLength(1);
    expect(toast.getToasts()[0].id).toBe(first);
    expect(toast.getToasts()[0].message).toBe("ב");
  });

  it("a repeat restarts the timer: the toast lives a full duration from the LAST call", () => {
    toast.showToast.info("פג תוקף", { id: "x", duration: 1000 });
    vi.advanceTimersByTime(800);
    toast.showToast.info("פג תוקף", { id: "x", duration: 1000 });
    vi.advanceTimersByTime(800); // 1600ms after the first call
    expect(toast.getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(300);
    expect(toast.getToasts()).toHaveLength(0);
  });
});
