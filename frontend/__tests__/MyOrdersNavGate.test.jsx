// MEH-3525: «ההזמנות שלי» shows while on-site ordering is on, fail-closed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import api from "@/lib/api";
import { useMyOrdersNavGate, resetMyOrdersNavGateRequest } from "@/lib/use-my-orders-nav-gate";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

describe("useMyOrdersNavGate", () => {
  beforeEach(() => {
    api.get.mockReset();
    sessionStorage.clear();
    resetMyOrdersNavGateRequest();
  });

  it("is on when the list answers 200, and caches it for the session", async () => {
    api.get.mockResolvedValueOnce({ data: { orders: [] } });
    const { result } = renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    const again = renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    expect(again.result.current).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("stays off when ordering is switched off (404)", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 404 } });
    const { result } = renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    await waitFor(() =>
      expect(JSON.parse(sessionStorage.getItem("meh_my_orders_nav"))).toMatchObject({ uid: "u1", on: false }),
    );
    expect(result.current).toBe(false);
    renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("two menus mounting together make one request", async () => {
    let resolve;
    api.get.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const a = renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    const b = renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    resolve({ data: { orders: [] } });
    await waitFor(() => expect(a.result.current && b.result.current).toBe(true));
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("switching person hides the link until the new person's answer arrives", async () => {
    sessionStorage.setItem("meh_my_orders_nav", JSON.stringify({ uid: "u1", on: true, at: Date.now() }));
    api.get.mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(({ user }) => useMyOrdersNavGate(user), {
      initialProps: { user: { id: "u1" } },
    });
    await waitFor(() => expect(result.current).toBe(true));
    rerender({ user: { id: "u2" } });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(false);
  });

  it("a cached answer for another person is not reused", async () => {
    sessionStorage.setItem("meh_my_orders_nav", JSON.stringify({ uid: "u2", on: true, at: Date.now() }));
    api.get.mockRejectedValueOnce({ response: { status: 404 } });
    const { result } = renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(false);
  });

  it("a guest makes no request", () => {
    const { result } = renderHook(() => useMyOrdersNavGate(null));
    expect(result.current).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
  });
});
