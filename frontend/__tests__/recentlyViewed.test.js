import { describe, it, expect, beforeEach } from "vitest";
import {
  STORAGE_KEY,
  MAX_ENTRIES,
  TTL_MS,
  getRecentlyViewedIds,
  pushRecentlyViewed,
} from "@/lib/recently-viewed";

const NOW = 1_717_000_000_000; // arbitrary fixed "now" for deterministic tests
const DAY = 24 * 60 * 60 * 1000;

describe("recently-viewed", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("constants", () => {
    it("caps at 5 entries", () => {
      expect(MAX_ENTRIES).toBe(5);
    });

    it("uses a 7-day TTL", () => {
      expect(TTL_MS).toBe(7 * DAY);
    });

    it("uses the documented storage key", () => {
      expect(STORAGE_KEY).toBe("recently_viewed");
    });
  });

  describe("getRecentlyViewedIds", () => {
    it("returns [] when localStorage is empty", () => {
      expect(getRecentlyViewedIds(NOW)).toEqual([]);
    });

    it("returns [] on JSON parse error", () => {
      window.localStorage.setItem(STORAGE_KEY, "not-json");
      expect(getRecentlyViewedIds(NOW)).toEqual([]);
    });

    it("returns IDs newest-first, capped at 5", () => {
      const entries = [];
      for (let i = 0; i < 10; i++) {
        entries.push({ id: `p${i}`, viewedAt: NOW - i * 1000 });
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      const ids = getRecentlyViewedIds(NOW);
      expect(ids).toHaveLength(5);
      expect(ids).toEqual(["p0", "p1", "p2", "p3", "p4"]);
    });

    it("filters out entries older than 7 days", () => {
      const entries = [
        { id: "fresh", viewedAt: NOW - 2 * DAY }, // 2 days old — keep
        { id: "stale", viewedAt: NOW - 8 * DAY }, // 8 days old — drop
        { id: "edge", viewedAt: NOW - 7 * DAY - 1 }, // just past 7d — drop
        { id: "alsoFresh", viewedAt: NOW - 6 * DAY }, // keep
      ];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      expect(getRecentlyViewedIds(NOW)).toEqual(["fresh", "alsoFresh"]);
    });

    it("treats legacy bare-id array as expired and clears storage", () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
      expect(getRecentlyViewedIds(NOW)).toEqual([]);
      // Storage should be cleared after the legacy detection
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("ignores entries missing a viewedAt", () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: "noTimestamp" }, { id: "ok", viewedAt: NOW }]),
      );
      expect(getRecentlyViewedIds(NOW)).toEqual(["ok"]);
    });
  });

  describe("pushRecentlyViewed", () => {
    it("creates the entry on first call", () => {
      pushRecentlyViewed("p1", NOW);
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      expect(stored).toEqual([{ id: "p1", viewedAt: NOW }]);
    });

    it("prepends the newest entry", () => {
      pushRecentlyViewed("p1", NOW - 1000);
      pushRecentlyViewed("p2", NOW);
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      expect(stored.map((e) => e.id)).toEqual(["p2", "p1"]);
    });

    it("dedupes the same producer (re-stamps it as newest)", () => {
      pushRecentlyViewed("p1", NOW - 5000);
      pushRecentlyViewed("p2", NOW - 4000);
      pushRecentlyViewed("p1", NOW); // re-view p1
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      expect(stored.map((e) => e.id)).toEqual(["p1", "p2"]);
      expect(stored[0].viewedAt).toBe(NOW); // refreshed timestamp
    });

    it("caps at 5 entries even after many pushes", () => {
      for (let i = 0; i < 10; i++) {
        pushRecentlyViewed(`p${i}`, NOW + i);
      }
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      expect(stored).toHaveLength(5);
      // Newest 5 (p9 down to p5)
      expect(stored.map((e) => e.id)).toEqual(["p9", "p8", "p7", "p6", "p5"]);
    });

    it("is a no-op when producerId is null/undefined", () => {
      pushRecentlyViewed(null, NOW);
      pushRecentlyViewed(undefined, NOW);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("survives legacy storage shape (clears + writes new entry)", () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2]));
      pushRecentlyViewed("p1", NOW);
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      expect(stored).toEqual([{ id: "p1", viewedAt: NOW }]);
    });
  });

  describe("integration: write → read", () => {
    it("getRecentlyViewedIds drops entries that age past 7d between writes", () => {
      pushRecentlyViewed("old", NOW - 8 * DAY);
      pushRecentlyViewed("new", NOW);
      // The "old" entry was stamped 8 days before NOW so it's expired now.
      expect(getRecentlyViewedIds(NOW)).toEqual(["new"]);
    });
  });
});
