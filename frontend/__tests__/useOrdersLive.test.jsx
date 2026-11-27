// @ts-check
// MEH-3964: an open «הזמנות» tab picks up a new order without a reload, and
// the browser tab title counts the orders waiting for an answer.
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pendingPage = vi.fn();
const loadOrders = vi.fn();
vi.mock("@/lib/product-orders", () => ({
  PAGE_LIMIT: 50,
  loadPendingPage: (...args) => pendingPage(...args),
  loadOrders: (...args) => loadOrders(...args),
}));

import useOrdersLive from "@/lib/use-orders-live";
import { dashboardTitle } from "@/lib/use-dashboard-title";

/** @param {string} [status] @param {number} [id] */
const order = (id = 1, status = "pending") => ({ id, status });

/** @param {{ orders: any[] | null, onFresh: (o: any[]) => void }} props */
function Probe({ orders, onFresh }) {
  useOrdersLive(orders, onFresh);
  return null;
}

let hidden = false;
beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  document.title = "הזמנות | מהמקור";
  pendingPage.mockReset();
  loadOrders.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("dashboardTitle counts the orders waiting (MEH-3964)", () => {
  it.each([
    [0, "הזמנות | מהמקור"],
    [1, "(1) הזמנות | מהמקור"],
    [7, "(7) הזמנות | מהמקור"],
  ])("%i waiting → %s", (count, title) => {
    expect(dashboardTitle("הזמנות", "he", count)).toBe(title);
  });
});

describe("useOrdersLive", () => {
  it("a new pending order seen on the minute check reloads the board", async () => {
    const onFresh = vi.fn();
    const fresh = [order(1), order(9)];
    pendingPage.mockResolvedValue({ total: 2, orders: fresh });
    loadOrders.mockResolvedValue(fresh);
    render(<Probe orders={[order(1)]} onFresh={onFresh} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(pendingPage).toHaveBeenCalledTimes(1);
    expect(loadOrders).toHaveBeenCalledTimes(1);
    expect(onFresh).toHaveBeenCalledWith(fresh);
  });

  it("nothing new: one light check, no full reload", async () => {
    const onFresh = vi.fn();
    pendingPage.mockResolvedValue({ total: 1, orders: [order(1)] });
    render(<Probe orders={[order(1)]} onFresh={onFresh} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(pendingPage).toHaveBeenCalledTimes(1);
    expect(loadOrders).not.toHaveBeenCalled();
    expect(onFresh).not.toHaveBeenCalled();
  });

  it("an order that stopped waiting (expired elsewhere) also reloads", async () => {
    const onFresh = vi.fn();
    pendingPage.mockResolvedValue({ total: 0, orders: [] });
    loadOrders.mockResolvedValue([order(1, "expired")]);
    render(<Probe orders={[order(1)]} onFresh={onFresh} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(loadOrders).toHaveBeenCalledTimes(1);
  });

  it("a hidden tab asks nothing; coming back asks once, right away", async () => {
    pendingPage.mockResolvedValue({ total: 1, orders: [order(1)] });
    render(<Probe orders={[order(1)]} onFresh={vi.fn()} />);
    hidden = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(pendingPage).not.toHaveBeenCalled();
    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(pendingPage).toHaveBeenCalledTimes(1);
  });

  it("over one page of waiting orders: same count and known ids, no reload", async () => {
    const many = Array.from({ length: 60 }, (_, i) => order(i + 1));
    pendingPage.mockResolvedValue({ total: 60, orders: many.slice(0, 50) });
    render(<Probe orders={many} onFresh={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(pendingPage).toHaveBeenCalledTimes(1);
    expect(loadOrders).not.toHaveBeenCalled();
  });

  it("same count, one expired and one arrived: still a reload", async () => {
    pendingPage.mockResolvedValue({ total: 1, orders: [order(2)] });
    loadOrders.mockResolvedValue([order(1, "expired"), order(2)]);
    render(<Probe orders={[order(1)]} onFresh={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(loadOrders).toHaveBeenCalledTimes(1);
  });

  it("an open dialog defers the check, so her typed note stays", async () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    pendingPage.mockResolvedValue({ total: 2, orders: [order(1), order(9)] });
    render(<Probe orders={[order(1)]} onFresh={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(pendingPage).not.toHaveBeenCalled();
    dialog.remove();
  });

  it("her own change during a reload wins over the older reload", async () => {
    const onFresh = vi.fn();
    pendingPage.mockResolvedValue({ total: 2, orders: [order(1), order(9)] });
    /** @type {(v: any) => void} */
    let finish = () => {};
    loadOrders.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { rerender } = render(<Probe orders={[order(1)]} onFresh={onFresh} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(loadOrders).toHaveBeenCalledTimes(1);
    // She confirms order 1 while the reload is in flight.
    rerender(<Probe orders={[order(1, "confirmed")]} onFresh={onFresh} />);
    await act(async () => {
      finish([order(1), order(9)]);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onFresh).not.toHaveBeenCalled();
  });

  it("a failed check keeps the board as it is", async () => {
    const onFresh = vi.fn();
    pendingPage.mockRejectedValue(new Error("offline"));
    render(<Probe orders={[order(1)]} onFresh={onFresh} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(onFresh).not.toHaveBeenCalled();
  });

  it("before the first load (orders null) nothing is asked", async () => {
    render(<Probe orders={null} onFresh={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(pendingPage).not.toHaveBeenCalled();
    expect(document.title).toBe("הזמנות | מהמקור");
  });
});
