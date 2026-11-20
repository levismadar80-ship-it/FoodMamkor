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
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await Promise.resolve();
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
