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
  it("accepts FavoriteOut rows (UUID producer_id, real backend shape)", () => {
    const result = FavoritesResponseSchema.safeParse([
      {
        producer_id: "550e8400-e29b-41d4-a716-446655440000",
        created_at: "2026-01-01T00:00:00Z",
      },
      { producer_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts an empty list", () => {
    expect(FavoritesResponseSchema.safeParse([]).success).toBe(true);
  });

  it("fails when a row is missing producer_id (toothless-guard regression)", () => {
    // [{}] used to pass when producer_id was nullable+optional; the tightened
    // schema must reject it so a malformed payload hits the empty-cache fallback.
    expect(FavoritesResponseSchema.safeParse([{}]).success).toBe(false);
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

  // MEH-901 regression: z.object strips undeclared keys, so any field the
  // /map consumers read but the schema didn't declare was silently dropped
  // (categories, slug, starting_price_label, …) — root cause of the MEH-798
  // chip never rendering. This guard fails the moment a future refactor
  // re-strips any of the 4 spot-checked fields before consumers read them.
  // Spot-check covers categories + 3 representative sibling fields (a string,
  // a number, a contact-method routing field); the bug class is uniform
  // across all 12 MEH-901 fields, so 4 assertions vs 12 trades coverage for
  // signal density.
  it("ProducerSchema preserves MEH-901 fields (strip regression)", () => {
    const parsed = ProducerSchema.safeParse({
      id: 1,
      name: "תסס",
      categories: [{ id: 8, name: "מותססים וכבושים", emoji: "🥒" }],
      slug: "tases-ferments",
      avg_rating: 4.7,
      primary_contact_method: "whatsapp",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.categories?.[0]?.name).toBe("מותססים וכבושים");
    expect(parsed.data?.slug).toBe("tases-ferments");
    expect(parsed.data?.avg_rating).toBe(4.7);
    expect(parsed.data?.primary_contact_method).toBe("whatsapp");
  });

  // MEH-902 regression: the rich delivery relation reaches MapProducerCard.
  // Mirrors the MEH-901 strip pattern — Zod would silently drop the array
  // before the "delivers to your city" pill could read `city` / `delivery_day`.
  it("ProducerSchema preserves delivery_areas (MEH-902 strip regression)", () => {
    const parsed = ProducerSchema.safeParse({
      id: 1,
      name: "תסס",
      delivery_areas: [
        { id: "65fd60b1-f305-4aeb-b747-ad8a58b80d80", city: "ירושלים", min_order: 80, delivery_day: "ראשון" },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.delivery_areas?.[0]?.city).toBe("ירושלים");
    expect(parsed.data?.delivery_areas?.[0]?.delivery_day).toBe("ראשון");
  });

  it("ProducerSchema preserves locations[] (MEH-1412 chunk 3 strip regression)", () => {
    // Before MEH-1412 the non-strict z.object stripped locations (undeclared),
    // so the map could never fan a producer into per-location markers. Assert
    // the full 7-field shape survives the parse.
    const parsed = ProducerSchema.safeParse({
      id: 1,
      name: "הלחם של גל",
      locations: [
        {
          kind: "branch",
          label: "הסניף המרכזי",
          city: "קריית טבעון",
          lat: 32.7194,
          lng: 35.118,
          is_primary: true,
          precision: "exact",
        },
        { kind: "pickup", label: "נקודת איסוף", precision: "approximate" },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.locations).toHaveLength(2);
    expect(parsed.data?.locations?.[0]?.kind).toBe("branch");
    expect(parsed.data?.locations?.[0]?.is_primary).toBe(true);
    expect(parsed.data?.locations?.[0]?.lat).toBe(32.7194);
    expect(parsed.data?.locations?.[1]?.precision).toBe("approximate");
  });

  it("ProducerSchema defaults locations[] to [] when absent (no-crash guard)", () => {
    const parsed = ProducerSchema.safeParse({ id: 1, name: "חווה" });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.locations).toEqual([]);
  });
});
