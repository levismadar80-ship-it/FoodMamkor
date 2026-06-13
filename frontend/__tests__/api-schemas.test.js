// Rule-19 coverage for the non-map api-schemas (MEH-779 covers the map).
// Validates that each schema accepts the real backend shape and that a
// structurally-broken payload fails safeParse (callers route to their
// existing empty/error state on failure).
import { describe, it, expect } from "vitest";
import {
  CategoriesResponseSchema,
  StatsSchema,
  FavoritesResponseSchema,
  ProducerSchema,
  ProducersResponseSchema,
} from "@/lib/api-schemas";

describe("CategoriesResponseSchema", () => {
  it("accepts a valid category list", () => {
    const data = [
      { id: 1, name: "ירקות", emoji: "🥬" },
      { id: 2, name: "מאפים", emoji: null },
      { id: 3, name: "ללא אימוג'י" },
    ];
    const result = CategoriesResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("tolerates extra/unknown keys (forward-compatible)", () => {
    const result = CategoriesResponseSchema.safeParse([
      { id: 1, name: "x", new_field: "future" },
    ]);
    expect(result.success).toBe(true);
  });

  it("fails when name is missing", () => {
    expect(CategoriesResponseSchema.safeParse([{ id: 1 }]).success).toBe(false);
  });

  it("fails when the payload is not an array", () => {
    expect(CategoriesResponseSchema.safeParse({ id: 1 }).success).toBe(false);
  });
});

describe("StatsSchema", () => {
  it("accepts valid stats", () => {
    const result = StatsSchema.safeParse({
      producers_count: 42,
      categories_count: 7,
    });
    expect(result.success).toBe(true);
  });

  it("fails when counts are non-numeric", () => {
    expect(
      StatsSchema.safeParse({ producers_count: "42", categories_count: 7 })
        .success,
    ).toBe(false);
  });

  it("fails on an empty object (missing required keys)", () => {
    expect(StatsSchema.safeParse({}).success).toBe(false);
  });
});

describe("FavoritesResponseSchema", () => {
  it("accepts FavoriteOut rows", () => {
    const result = FavoritesResponseSchema.safeParse([
      { producer_id: "abc-123", created_at: "2026-01-01T00:00:00Z" },
      { producer_id: 5 },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts an empty list", () => {
    expect(FavoritesResponseSchema.safeParse([]).success).toBe(true);
  });

  it("fails when not an array", () => {
    expect(FavoritesResponseSchema.safeParse(null).success).toBe(false);
  });
});

describe("re-exported producer schemas", () => {
  it("ProducerSchema accepts a minimal producer", () => {
    expect(ProducerSchema.safeParse({ id: 1, name: "חווה" }).success).toBe(true);
  });

  it("ProducerSchema rejects a producer with no name", () => {
    expect(ProducerSchema.safeParse({ id: 1 }).success).toBe(false);
  });

  it("ProducersResponseSchema validates a list", () => {
    const result = ProducersResponseSchema.safeParse([
      { id: 1, name: "א" },
      { id: 2, name: "ב", lat: 32.5, lng: 34.7 },
    ]);
    expect(result.success).toBe(true);
  });
});
