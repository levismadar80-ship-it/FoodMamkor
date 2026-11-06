// MEH-2743 — useFavoriteProducers().reserve: hold the strip's height only while
// the list is loading for a browser whose user had favorites last visit.
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = { user: null, loading: true };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => apiGet(...a) } }));

import { useFavoriteProducers } from "@/lib/use-favorite-producers";
import { resetFavoritesCache } from "@/lib/favorites-cache";

const row = (i) => ({
  producer_id: `p${i}`,
  producer: { id: `p${i}`, name: `עסק ${i}`, city: "בנימינה", slug: `b-${i}`, images: [] },
  created_at: "2026-11-01T10:00:00Z",
});

describe("useFavoriteProducers reserve", () => {
  beforeEach(() => {
    resetFavoritesCache(); // also clears the hint
    apiGet.mockReset();
    auth.user = null;
    auth.loading = true;
  });

  it("no hint → never reserves, even while auth loads", () => {
    const { result } = renderHook(() => useFavoriteProducers());
    expect(result.current.reserve).toBe(false);
  });

  it("hint + auth loading → reserves", () => {
    localStorage.setItem("fav_strip_hint", "1");
    const { result } = renderHook(() => useFavoriteProducers());
    expect(result.current.reserve).toBe(true);
  });

  it("hint + signed in + list loading → reserves; list arrives → cards, no reserve", async () => {
    localStorage.setItem("fav_strip_hint", "1");
    let release;
    apiGet.mockReturnValueOnce(new Promise((r) => { release = r; }));
    auth.user = { id: 1 };
    auth.loading = false;
    const { result } = renderHook(() => useFavoriteProducers());
    expect(result.current.reserve).toBe(true);
    await act(async () => {
      release({ data: [row(1)] });
    });
    expect(result.current.items.map((p) => p.id)).toEqual(["p1"]);
    expect(result.current.reserve).toBe(false);
  });

  it("hint + auth done, signed out → no reserve", () => {
    localStorage.setItem("fav_strip_hint", "1");
    auth.loading = false;
    const { result } = renderHook(() => useFavoriteProducers());
    expect(result.current.reserve).toBe(false);
  });

  it("hint + load returns 0 favorites → no reserve, hint cleared", async () => {
    localStorage.setItem("fav_strip_hint", "1");
    apiGet.mockResolvedValueOnce({ data: [] });
    auth.user = { id: 1 };
    auth.loading = false;
    const { result } = renderHook(() => useFavoriteProducers());
    await act(async () => {});
    expect(result.current.reserve).toBe(false);
    expect(localStorage.getItem("fav_strip_hint")).toBeNull();
  });
});
