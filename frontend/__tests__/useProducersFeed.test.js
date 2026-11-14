import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { useProducersFeed } from "@/app/[locale]/map/state/useProducersFeed";

// MEH-779: the map producers fetch is now Zod-validated. These cases prove
// a valid payload hydrates the feed AND a malformed payload degrades to the
// existing error state (empty list + toast) instead of crashing the map.
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/toast", () => ({
  showToast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));

const validProducers = [
  { id: 1, name: "מאפיית אורה", lat: 32.1, lng: 34.8, images: [] },
  { id: 2, name: "דבש הגליל", city: "צפת" },
];

// api.get is hit for both /categories (on mount) and /producers (loadProducers).
function routeProducers(producersResult) {
  api.get.mockImplementation((url) => {
    if (url === "/producers") return producersResult();
    return Promise.resolve({ data: [] }); // /categories etc.
  });
}

describe("useProducersFeed — MEH-779 response validation", () => {
  beforeEach(() => {
    api.get.mockReset();
    showToast.error.mockClear();
  });

  it("valid response hydrates the feed (no error toast)", async () => {
    routeProducers(() => Promise.resolve({ data: validProducers }));
    const { result } = renderHook(() => useProducersFeed());
    await waitFor(() => expect(result.current.allProducers).toHaveLength(2));
    expect(showToast.error).not.toHaveBeenCalled();
  });

  it("malformed response does NOT drop the page — empty list + toast", async () => {
    // name must be a string; a number fails the schema → safeParse rejects.
    routeProducers(() => Promise.resolve({ data: [{ id: 1, name: 123 }] }));
    const { result } = renderHook(() => useProducersFeed());
    await waitFor(() => expect(showToast.error).toHaveBeenCalled());
    expect(result.current.allProducers).toEqual([]);
  });

  it("non-array payload falls back to empty + toast", async () => {
    routeProducers(() => Promise.resolve({ data: { oops: "not an array" } }));
    const { result } = renderHook(() => useProducersFeed());
    await waitFor(() => expect(showToast.error).toHaveBeenCalled());
    expect(result.current.allProducers).toEqual([]);
  });

  it("network failure falls back to empty + toast", async () => {
    routeProducers(() => Promise.reject(new Error("network")));
    const { result } = renderHook(() => useProducersFeed());
    await waitFor(() => expect(showToast.error).toHaveBeenCalled());
    expect(result.current.allProducers).toEqual([]);
  });
});

// MEH-1054 (MAP-16): the additive `loading` flag drives the bottom-sheet
// skeleton. It must start true (mount effect fetches immediately), clear on
// EVERY terminal path (data / malformed / network error — a stuck skeleton
// over the error state would hide the toast'd empty list), and re-arm when
// loadProducers refetches.
describe("useProducersFeed — MEH-1054 loading flag", () => {
  beforeEach(() => {
    api.get.mockReset();
    showToast.error.mockClear();
  });

  it("starts true, clears after a successful load", async () => {
    let resolveProducers;
    routeProducers(
      () => new Promise((resolve) => { resolveProducers = resolve; })
    );
    const { result } = renderHook(() => useProducersFeed());
    expect(result.current.loading).toBe(true);
    await act(async () => {
      resolveProducers({ data: validProducers });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allProducers).toHaveLength(2);
  });

  it("clears on network failure (skeleton must not stick over the error state)", async () => {
    routeProducers(() => Promise.reject(new Error("network")));
    const { result } = renderHook(() => useProducersFeed());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(showToast.error).toHaveBeenCalled();
  });

  it("clears on malformed payload", async () => {
    routeProducers(() => Promise.resolve({ data: [{ id: 1, name: 123 }] }));
    const { result } = renderHook(() => useProducersFeed());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allProducers).toEqual([]);
  });

  it("re-arms on a loadProducers refetch, then clears again", async () => {
    routeProducers(() => Promise.resolve({ data: validProducers }));
    const { result } = renderHook(() => useProducersFeed());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let resolveSecond;
    routeProducers(
      () => new Promise((resolve) => { resolveSecond = resolve; })
    );
    act(() => {
      result.current.loadProducers({ category: 5 });
    });
    expect(result.current.loading).toBe(true);
    await act(async () => {
      resolveSecond({ data: validProducers });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});

// MEH-3198: a failed load is not "no businesses". The feed reports it, the
// list shows «נסו שוב», and a retry repeats the newest call.
// DISCRIMINATION: before MEH-3198 the hook returned no loadError / retry, so
// every case below fails on `undefined`.
describe("useProducersFeed — MEH-3198 load error + retry", () => {
  beforeEach(() => {
    api.get.mockReset();
    showToast.error.mockClear();
  });

  it("network failure sets loadError; a successful retry clears it", async () => {
    let fail = true;
    routeProducers(() => (fail ? Promise.reject(new Error("network")) : Promise.resolve({ data: validProducers })));
    const { result } = renderHook(() => useProducersFeed());
    await waitFor(() => expect(result.current.loadError).toBe(true));
    fail = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.allProducers).toHaveLength(2));
    expect(result.current.loadError).toBe(false);
  });

  it("a malformed payload also sets loadError", async () => {
    routeProducers(() => Promise.resolve({ data: [{ id: 1, name: 123 }] }));
    const { result } = renderHook(() => useProducersFeed());
    await waitFor(() => expect(result.current.loadError).toBe(true));
  });

  it("a failed retry keeps the error state", async () => {
    routeProducers(() => Promise.reject(new Error("network")));
    const { result } = renderHook(() => useProducersFeed());
    await waitFor(() => expect(result.current.loadError).toBe(true));
    act(() => result.current.retry());
    await waitFor(() => expect(showToast.error).toHaveBeenCalledTimes(2));
    expect(result.current.loadError).toBe(true);
  });

  it("retry repeats the newest call's params", async () => {
    routeProducers(() => Promise.reject(new Error("network")));
    const { result } = renderHook(() => useProducersFeed());
    await waitFor(() => expect(result.current.loadError).toBe(true));
    act(() => result.current.loadProducers({ has_delivery: true }));
    await waitFor(() => expect(showToast.error).toHaveBeenCalledTimes(2));
    act(() => result.current.retry());
    await waitFor(() => expect(showToast.error).toHaveBeenCalledTimes(3));
    const producerCalls = api.get.mock.calls.filter(([url]) => url === "/producers");
    expect(producerCalls.at(-1)[1]).toEqual({ params: { has_delivery: true } });
  });
});

// MEH-3198 review: «חפשו באזור זה» goes through the feed (loadArea), so it
// takes a latest-wins ticket like every other list load, is Zod-checked, and
// «נסו שוב» after it repeats the same area search.
// DISCRIMINATION: before this change the feed had no loadArea (TypeError on
// every case); with loadArea but no ticket, the four race cases go red; with
// no safeParse, the malformed case goes red; with retry still replaying only
// loadProducers params, the retry case goes red.
describe("useProducersFeed — MEH-3198 area search (loadArea)", () => {
  const AREA = { lat: 32.1, lng: 34.8, radius_km: 5, require_physical: true };
  const areaRows = [{ id: 9, name: "שדה ירוק", lat: 32.1, lng: 34.8 }];
  let pending;

  // Every /producers call gets its own deferred, settled by the test in any order.
  function deferProducers() {
    pending = [];
    api.get.mockImplementation((url, opts) => {
      if (url !== "/producers") return Promise.resolve({ data: [] });
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      pending.push({ params: opts?.params, resolve, reject });
      return promise;
    });
  }

  async function mountSettled() {
    deferProducers();
    const hook = renderHook(() => useProducersFeed());
    await act(async () => pending[0].resolve({ data: validProducers }));
    await waitFor(() => expect(hook.result.current.allProducers).toHaveLength(2));
    return hook;
  }

  beforeEach(() => {
    api.get.mockReset();
    showToast.error.mockClear();
  });

  it("older area search fails after a newer chip load succeeded → rows and no error stay", async () => {
    const { result } = await mountSettled();
    act(() => result.current.loadArea(AREA));
    act(() => result.current.loadProducers({ has_delivery: true }));
    const [, area, chip] = pending;
    await act(async () => chip.resolve({ data: validProducers }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => area.reject(new Error("network")));
    expect(result.current.loadError).toBe(false);
    expect(result.current.allProducers).toHaveLength(2);
    expect(showToast.error).not.toHaveBeenCalled();
  });

  it("older area search fails after a newer area search succeeded → the newer rows stay", async () => {
    const { result } = await mountSettled();
    act(() => result.current.loadArea(AREA));
    act(() => result.current.loadArea({ ...AREA, lat: 31.5 }));
    const [, older, newer] = pending;
    await act(async () => newer.resolve({ data: areaRows }));
    await waitFor(() => expect(result.current.allProducers.map((p) => p.id)).toEqual([9]));
    await act(async () => older.reject(new Error("network")));
    expect(result.current.loadError).toBe(false);
    expect(result.current.allProducers.map((p) => p.id)).toEqual([9]);
  });

  it("older area search succeeds after a newer chip load failed → the error stays, no stale rows", async () => {
    const { result } = await mountSettled();
    act(() => result.current.loadArea(AREA));
    act(() => result.current.loadProducers({ has_delivery: true }));
    const [, area, chip] = pending;
    await act(async () => chip.reject(new Error("network")));
    await waitFor(() => expect(result.current.loadError).toBe(true));
    await act(async () => area.resolve({ data: areaRows }));
    expect(result.current.loadError).toBe(true);
    expect(result.current.allProducers).toEqual([]);
  });

  it("older chip load succeeds after a newer area search failed → the error stays", async () => {
    const { result } = await mountSettled();
    act(() => result.current.loadProducers({ has_delivery: true }));
    act(() => result.current.loadArea(AREA));
    const [, chip, area] = pending;
    await act(async () => area.reject(new Error("network")));
    await waitFor(() => expect(result.current.loadError).toBe(true));
    await act(async () => chip.resolve({ data: validProducers }));
    expect(result.current.loadError).toBe(true);
    expect(result.current.allProducers).toEqual([]);
    // The chip load it superseded must not leave the skeleton stuck either.
    expect(result.current.loading).toBe(false);
  });

  it("a successful area search writes its rows and ends a previous error", async () => {
    deferProducers();
    const { result } = renderHook(() => useProducersFeed());
    await act(async () => pending[0].reject(new Error("network")));
    await waitFor(() => expect(result.current.loadError).toBe(true));
    act(() => result.current.loadArea(AREA));
    await act(async () => pending[1].resolve({ data: areaRows }));
    await waitFor(() => expect(result.current.allProducers.map((p) => p.id)).toEqual([9]));
    expect(result.current.loadError).toBe(false);
    expect(pending[1].params).toEqual(AREA);
  });

  it("a malformed area response is a load failure, not rows", async () => {
    const { result } = await mountSettled();
    act(() => result.current.loadArea(AREA));
    await act(async () => pending[1].resolve({ data: [{ id: 1, name: 123 }] }));
    await waitFor(() => expect(result.current.loadError).toBe(true));
    expect(result.current.allProducers).toEqual([]);
    expect(showToast.error).toHaveBeenCalledTimes(1);
  });

  it("«נסו שוב» after a failed area search repeats that area search", async () => {
    const { result } = await mountSettled();
    act(() => result.current.loadProducers({ has_delivery: true }));
    await act(async () => pending[1].resolve({ data: validProducers }));
    act(() => result.current.loadArea(AREA));
    await act(async () => pending[2].reject(new Error("network")));
    await waitFor(() => expect(result.current.loadError).toBe(true));
    act(() => result.current.retry());
    expect(pending).toHaveLength(4);
    expect(pending[3].params).toEqual(AREA);
    await act(async () => pending[3].resolve({ data: areaRows }));
    await waitFor(() => expect(result.current.allProducers.map((p) => p.id)).toEqual([9]));
    expect(result.current.loadError).toBe(false);
  });
});
