import { describe, it, expect } from "vitest";
import { sortProducers } from "@/app/[locale]/map/state/useMapFilters";

// Pure-function coverage for the /map sort dropdown's comparators (map-quality
// batch PR 2). Tel Aviv userLoc; distances: TLV ≈ 0km, Jerusalem ≈ 54km,
// Haifa ≈ 85km.
const userLoc = { lat: 32.0853, lng: 34.7818 };

const tlv = { id: "tlv", name: "תל אביב", lat: 32.0853, lng: 34.7818, avg_rating: 3.5, reviews_count: 2 };
const jlm = { id: "jlm", name: "ירושלים", lat: 31.7683, lng: 35.2137, avg_rating: 4.8, reviews_count: 12 };
const haifa = { id: "haifa", name: "חיפה", lat: 32.794, lng: 34.9896, avg_rating: 4.8, reviews_count: 3 };
const noCoords = { id: "nc", name: "בלי מיקום", lat: null, lng: null, avg_rating: null, reviews_count: null };

const FEED = [jlm, noCoords, haifa, tlv]; // deliberate non-sorted feed order

describe("sortProducers — nearest", () => {
  it("orders by haversine distance ASC to userLoc, null-coords last", () => {
    const out = sortProducers(FEED, "nearest", userLoc);
    expect(out.map((p) => p.id)).toEqual(["tlv", "jlm", "haifa", "nc"]);
  });

  it("does not mutate the input array", () => {
    const input = [...FEED];
    sortProducers(input, "nearest", userLoc);
    expect(input.map((p) => p.id)).toEqual(FEED.map((p) => p.id));
  });

  it("degrades to feed order without a userLoc (option is disabled in the UI)", () => {
    expect(sortProducers(FEED, "nearest", null).map((p) => p.id)).toEqual(
      FEED.map((p) => p.id),
    );
  });
});

describe("sortProducers — rating", () => {
  it("orders by avg_rating DESC with reviews_count DESC tiebreak, null rating last", () => {
    const out = sortProducers(FEED, "rating", null);
    // jlm (4.8, 12) beats haifa (4.8, 3) on the tiebreak; null rating last
    expect(out.map((p) => p.id)).toEqual(["jlm", "haifa", "tlv", "nc"]);
  });

  it("does not crash on all-null rating fields", () => {
    const nulls = [{ id: "a" }, { id: "b", avg_rating: null }, { id: "c", avg_rating: 2 }];
    expect(sortProducers(nulls, "rating", null).map((p) => p.id)).toEqual(["c", "a", "b"]);
  });
});

describe("sortProducers — newest", () => {
  it("preserves feed order (backend default IS created_at DESC — producer_listing.py:127)", () => {
    expect(sortProducers(FEED, "newest", userLoc)).toBe(FEED);
  });

  it("treats an unknown sort key as newest/feed order", () => {
    expect(sortProducers(FEED, "bogus", userLoc)).toBe(FEED);
  });
});

describe("sortProducers — degenerate inputs", () => {
  it("returns [] for a nullish list and short lists unchanged", () => {
    expect(sortProducers(null, "rating", null)).toEqual([]);
    expect(sortProducers(undefined, "nearest", userLoc)).toEqual([]);
    const one = [tlv];
    expect(sortProducers(one, "rating", null)).toBe(one);
  });
});
