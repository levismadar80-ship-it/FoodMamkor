// MEH-3465: watchFavorited replaced four copies of the hydrate-then-subscribe
// block. Behaviour: the first value after hydration, every later change, and
// nothing once the cleanup ran.
import { describe, it, expect, vi, beforeEach } from "vitest";

let listener = null;
let saved = new Set();
let resolveLoad;
const unsub = vi.fn();

vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: () => new Promise((r) => { resolveLoad = r; }),
  isFavorited: (id) => saved.has(id),
  subscribeFavorites: (fn) => { listener = fn; return unsub; },
}));

const { watchFavorited } = await import("@/lib/watch-favorited");

beforeEach(() => {
  listener = null;
  saved = new Set();
  unsub.mockClear();
});

describe("watchFavorited", () => {
  it("reports the hydrated value, then each change", async () => {
    const seen = [];
    watchFavorited("p1", (v) => seen.push(v));
    saved.add("p1");
    resolveLoad();
    await Promise.resolve();
    expect(seen).toEqual([true]);
    saved.delete("p1");
    listener();
    expect(seen).toEqual([true, false]);
  });

  it("reports nothing after cleanup, and unsubscribes", async () => {
    const seen = [];
    const stop = watchFavorited("p1", (v) => seen.push(v));
    stop();
    resolveLoad();
    await Promise.resolve();
    listener();
    expect(seen).toEqual([]);
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
