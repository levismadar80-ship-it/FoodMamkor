// MEH-3525 · MEH-3698: «ההזמנות שלי» shows only to someone with an order, a
// group buy or a bag (GET /users/me/orders/any), fail-closed, one request.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import api from "@/lib/api";
import { useMyOrdersNavGate, resetMyOrdersNavGateRequest, clearMyOrdersNavGate } from "@/lib/use-my-orders-nav-gate";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

const ANY = "/users/me/orders/any";
const cached = () => JSON.parse(sessionStorage.getItem("meh_my_orders_nav"));

describe("useMyOrdersNavGate", () => {
  beforeEach(() => {
    api.get.mockReset();
    sessionStorage.clear();
    resetMyOrdersNavGateRequest();
  });

  it("is on when the person has something, and caches it for the session", async () => {
    api.get.mockResolvedValueOnce({ data: { any: true } });
    const { result } = renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    const again = renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    await waitFor(() => expect(again.result.current).toBe(true));
    expect(api.get).toHaveBeenCalledTimes(1);
    // MEH-3552: the probe never refreshes or logs the person out on a 401.
    expect(api.get).toHaveBeenCalledWith(ANY, { skipAuthRefresh: true });
  });

  it("is off, and cached off, when the person has nothing", async () => {
    api.get.mockResolvedValueOnce({ data: { any: false } });
    const { result } = renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    await waitFor(() => expect(cached()).toMatchObject({ uid: "u1", on: false }));
    expect(result.current).toBe(false);
    renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("a body without a boolean is no answer: off, and not cached", async () => {
    api.get.mockResolvedValueOnce({ data: { orders: [] } });
    const { result } = renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(result.current).toBe(false);
    expect(sessionStorage.getItem("meh_my_orders_nav")).toBeNull();
  });

  it("two menus mounting together make one request", async () => {
    let resolve;
    api.get.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const a = renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    const b = renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    resolve({ data: { any: true } });
    await waitFor(() => expect(a.result.current && b.result.current).toBe(true));
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("after an order, a cached «nothing» is dropped and mounted menus show the row", async () => {
    api.get.mockResolvedValueOnce({ data: { any: false } });
    const a = renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    const b = renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    await waitFor(() => expect(cached()).toMatchObject({ on: false }));
    api.get.mockResolvedValueOnce({ data: { any: true } });
    act(() => clearMyOrdersNavGate());
    await waitFor(() => expect(a.result.current && b.result.current).toBe(true));
    // Both mounted menus share the one new request.
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(cached()).toMatchObject({ uid: "u1", on: true });
  });

  it("an answer that started before the order does not write a stale «nothing»", async () => {
    let resolveOld;
    api.get.mockReturnValueOnce(new Promise((r) => { resolveOld = r; }));
    renderHook(() => useMyOrdersNavGate({ id: "u1" }));
    api.get.mockReturnValueOnce(new Promise(() => {}));
    act(() => clearMyOrdersNavGate());
    await act(async () => { resolveOld({ data: { any: false } }); });
    expect(sessionStorage.getItem("meh_my_orders_nav")).toBeNull();
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
