/**
 * MEH-3819 — the business page's events, experiences and group buys are read
 * together: `ready` turns true only once all three answered (a failed read is
 * an empty list), and a server-seeded page reads none of them in the browser.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { pending } = vi.hoisted(() => ({ pending: { current: {} } }));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(
      (url) =>
        new Promise((resolve, reject) => {
          pending.current[url.split("?")[0]] = { resolve, reject };
        }),
    ),
  },
}));
import api from "@/lib/api";
import { useProducerActivities } from "@/app/[locale]/producer/[id]/hooks/useProducerActivities";

async function answer(path, outcome) {
  await act(async () => {
    if (outcome instanceof Error) pending.current[path].reject(outcome);
    else pending.current[path].resolve({ data: outcome });
  });
}

beforeEach(() => {
  pending.current = {};
  api.get.mockClear();
});

describe("useProducerActivities (MEH-3819)", () => {
  it("is ready only once all three lists answered; a failed list is empty", async () => {
    const { result } = renderHook(() => useProducerActivities({ producerId: "p-1" }));
    expect(api.get.mock.calls.map((c) => c[0])).toEqual([
      "/events?producer_id=p-1",
      "/experiences?producer_id=p-1",
      "/group-buys?producer_id=p-1",
    ]);
    await answer("/events", [{ id: "e1" }]);
    await answer("/group-buys", [{ id: "g1" }]);
    expect(result.current.ready).toBe(false);
    expect(result.current.events).toEqual([]);
    await answer("/experiences", new Error("network"));
    expect(result.current).toEqual({
      events: [{ id: "e1" }],
      experiences: [],
      groupBuys: [{ id: "g1" }],
      ready: true,
    });
  });

  it("server-seeded: ready at once, and nothing is read in the browser", () => {
    const initial = { events: [], experiences: [{ id: "x1" }], groupBuys: [] };
    const { result } = renderHook(() => useProducerActivities({ producerId: "p-1", initial }));
    expect(result.current).toEqual({ ...initial, ready: true });
    expect(api.get).not.toHaveBeenCalled();
  });
});
