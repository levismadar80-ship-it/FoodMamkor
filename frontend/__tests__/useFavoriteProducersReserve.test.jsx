// MEH-2743 — useFavoriteProducers().reserve: hold the strip's height only while
// the list is loading for a browser whose user had favorites last visit.
import { favoriteRow, uuidFor } from "./helpers/contract-row";
import { GetFavoritesUsersMeFavoritesGetResponseItem as FAV } from "@/lib/generated/api.zod";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = { user: null, loading: true };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => apiGet(...a) } }));

import { useFavoriteProducers } from "@/lib/use-favorite-producers";
import { resetFavoritesCache } from "@/lib/favorites-cache";

const row = (i) => ({
  ...favoriteRow(FAV, `p${i}`, { name: `עסק ${i}`, city: "בנימינה", slug: `b-${i}`, images: [] }),
  created_at: "2026-11-01T10:00:00Z",
});

describe("useFavoriteProducers reserve", () => {
  beforeEach(() => {
    resetFavoritesCache(); // also clears the hint
    apiGet.mockReset();
    auth.user = null;
    auth.loading = true;
    localStorage.setItem("token", "t"); // a stored session, as on every sign-in path
  });

  it("no hint → never reserves, even while auth loads", () => {
    const { result } = renderHook(() => useFavoriteProducers());
    expect(result.current.reserve).toBe(false);
  });

  it("hint + session token + auth loading → reserves", () => {
    localStorage.setItem("fav_strip_hint", "1");
    const { result } = renderHook(() => useFavoriteProducers());
    expect(result.current.reserve).toBe(true);
  });

  // MEH-3858: a hint with no session token (the session ended in api.js,
  // which removes the token and keeps the hint) must not reserve: the
  // pre-paint script does not reveal the strip without a token, so reserving
  // after mount opened it and the signed-out answer collapsed it (CLS 0.14).
  it("hint without a session token → never reserves", () => {
    localStorage.removeItem("token");
    localStorage.setItem("fav_strip_hint", "1");
    const { result } = renderHook(() => useFavoriteProducers());
    expect(result.current.reserve).toBe(false);
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
    expect(result.current.items.map((p) => p.id)).toEqual([uuidFor("p1")]);
    expect(result.current.reserve).toBe(false);
  });

  it("hint + auth done, signed out (expired token) → no reserve, hint cleared", () => {
    localStorage.setItem("fav_strip_hint", "1");
    auth.loading = false;
    const { result } = renderHook(() => useFavoriteProducers());
    expect(result.current.reserve).toBe(false);
    expect(localStorage.getItem("fav_strip_hint")).toBeNull();
  });

  it("hint survives while auth is still loading", () => {
    localStorage.setItem("fav_strip_hint", "1");
    renderHook(() => useFavoriteProducers());
    expect(localStorage.getItem("fav_strip_hint")).toBe("1");
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
