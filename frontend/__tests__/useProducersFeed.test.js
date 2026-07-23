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
