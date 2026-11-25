/**
 * MEH-3819 — the business page's events, experiences and group buys are read
 * together: `ready` turns true only once all three answered (a failed read is
 * an empty list). A server-seeded page paints at once and refreshes the lists
 * once after mount; the state changes only when an answer differs.
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
import { useProducerActivities, ACTIVITIES_WAIT_MS } from "@/app/[locale]/producer/[id]/hooks/useProducerActivities";

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
  // MEH-3836: recipes are read by slug once the producer is in, and `ready`
  // waits for them, so «מתכונים» is in the first paint.
  it("waits for the recipes: slug unknown → not ready; recipes answered → ready with them", async () => {
    const { result, rerender } = renderHook(({ slug }) => useProducerActivities({ producerId: "p-1", slug }), {
      initialProps: { slug: null },
    });
    await answer("/events", []);
    await answer("/experiences", []);
    await answer("/group-buys", []);
    expect(result.current.ready).toBe(false);
    rerender({ slug: "bakery" });
    expect(api.get.mock.calls.map((c) => c[0])).toContain("/producers/bakery/recipes");
    expect(result.current.ready).toBe(false);
    await answer("/producers/bakery/recipes", [{ id: "r1" }]);
    expect(result.current.ready).toBe(true);
    expect(result.current.recipes).toEqual([{ id: "r1" }]);
  });

  it("a business with no slug reads no recipes and does not wait for them", async () => {
    const { result } = renderHook(() => useProducerActivities({ producerId: "p-1", slug: "" }));
    await answer("/events", []);
    await answer("/experiences", []);
    await answer("/group-buys", []);
    expect(result.current.ready).toBe(true);
    expect(api.get.mock.calls.map((c) => c[0])).not.toContain(expect.stringContaining("/recipes"));
  });

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
      recipes: [],
      ready: true,
    });
  });

  it("server-seeded: ready at once with the server's lists, before any read answers", () => {
    const initial = { events: [], experiences: [{ id: "x1" }], groupBuys: [] };
    const { result } = renderHook(() => useProducerActivities({ producerId: "p-1", initial }));
    expect(result.current).toEqual({ ...initial, recipes: [], ready: true });
  });

  it("server-seeded and stale: the refresh replaces an event that is over and a changed join count", async () => {
    const initial = { events: [{ id: "old" }], experiences: [], groupBuys: [{ id: "g1", commits_count: 2 }] };
    const { result } = renderHook(() => useProducerActivities({ producerId: "p-1", initial }));
    expect(api.get).toHaveBeenCalledTimes(3);
    await answer("/events", []);
    await answer("/experiences", []);
    await answer("/group-buys", [{ id: "g1", commits_count: 3 }]);
    expect(result.current).toEqual({ events: [], experiences: [], groupBuys: [{ id: "g1", commits_count: 3 }], recipes: [], ready: true });
  });

  it("server-seeded and fresh: the same answer keeps the same state object (no re-render, no move)", async () => {
    const initial = { events: [{ id: "e1" }], experiences: [], groupBuys: [] };
    const { result } = renderHook(() => useProducerActivities({ producerId: "p-1", initial }));
    const before = result.current;
    await answer("/events", [{ id: "e1" }]);
    await answer("/experiences", []);
    await answer("/group-buys", []);
    expect(result.current).toBe(before);
  });

  it("server-seeded: a failed refresh keeps the server's list instead of hiding the section", async () => {
    const initial = { events: [{ id: "e1" }], experiences: [], groupBuys: [{ id: "g1" }] };
    const { result } = renderHook(() => useProducerActivities({ producerId: "p-1", initial }));
    await answer("/events", new Error("429"));
    await answer("/experiences", []);
    await answer("/group-buys", new Error("network"));
    expect(result.current.events).toEqual([{ id: "e1" }]);
    expect(result.current.groupBuys).toEqual([{ id: "g1" }]);
  });

  it("a slow list does not hold the page: ready after the cap, the list lands later", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useProducerActivities({ producerId: "p-1" }));
      await answer("/events", [{ id: "e1" }]);
      await answer("/experiences", []);
      await act(async () => {
        vi.advanceTimersByTime(ACTIVITIES_WAIT_MS - 1);
      });
      expect(result.current.ready).toBe(false);
      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.ready).toBe(true);
      await answer("/group-buys", [{ id: "g1" }]);
      expect(result.current.groupBuys).toEqual([{ id: "g1" }]);
      expect(result.current.events).toEqual([{ id: "e1" }]);
    } finally {
      vi.useRealTimers();
    }
  });
});
