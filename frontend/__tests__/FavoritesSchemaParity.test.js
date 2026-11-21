/**
 * MEH-1713 → MEH-1748 — the /favorites row parse keeps every field the
 * backend serializes.
 *
 * MEH-1713 had to keep a hand-written ProducerSchema from stripping the card
 * fields it did not declare, and did it with `.loose()`. Since MEH-1748 the
 * row schema IS the generated FavoriteOut (lib/generated/api.zod.js, from
 * backend/openapi.json), whose nested producer is the whole ProducerListOut —
 * so nothing the backend sends can be stripped, and nothing is loose either.
 *
 * The fixture is one real ProducerListOut row from staging (seeded demo data,
 * contact fields replaced), with the badge inputs and card fields set. The
 * self-test below proves it is a valid response before anything else reads
 * it, and proves that the old hand-written schema WOULD have stripped it — so
 * the "nothing stripped" assertion is shown to discriminate.
 */
import { describe, it, expect } from "vitest";
import { ProducerSchema } from "@/lib/schemas";
import { FavoriteWithProducerSchema, FavoritesResponseSchema } from "@/lib/api-responses";
import { ListProducersProducersGetResponseItem } from "@/lib/generated/api.zod";
import { allBadges } from "@/lib/badges";
import PRODUCER from "./fixtures/producer-list-row.json";

// The card fields ProducerCard / TrustBadge read that the old ProducerSchema
// did not declare (MEH-1713). Named one by one so a failure names the field.
const CARD_FIELDS = [
  "trust_tier",
  "favorites_count",
  "short_description",
  "top_product_name",
  "availability_state",
  "has_physical_location",
  "offers_delivery",
];

const row = (producer, overrides = {}) => ({
  producer_id: producer.id,
  producer,
  created_at: "2026-07-01T00:00:00Z",
  ...overrides,
});

describe("self-test — the fixture is a real response and discriminates", () => {
  it("parses as a ProducerListOut row", () => {
    const parsed = ListProducersProducersGetResponseItem.safeParse(PRODUCER);
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);
  });

  it("loses keys through the old hand-written ProducerSchema", () => {
    const lost = Object.keys(PRODUCER).filter((k) => !(k in ProducerSchema.parse(PRODUCER)));
    expect(lost.length).toBeGreaterThan(0);
  });
});

describe("/favorites row parse (FavoriteWithProducerSchema)", () => {
  it("keeps every key of the producer the backend sent", () => {
    const { producer } = FavoriteWithProducerSchema.parse(row(PRODUCER));
    expect(Object.keys(producer).sort()).toEqual(Object.keys(PRODUCER).sort());
  });

  it("keeps each card field with its value", () => {
    const { producer } = FavoriteWithProducerSchema.parse(row(PRODUCER));
    for (const field of CARD_FIELDS) {
      expect(producer[field], `stripped: producer.${field}`).toEqual(PRODUCER[field]);
    }
  });

  // The MEH-1704 guard applied to this route.
  it("keeps 6+ badges alive through the parse", () => {
    expect(allBadges(PRODUCER).length).toBeGreaterThanOrEqual(6);
    const { producer } = FavoriteWithProducerSchema.parse(row(PRODUCER));
    expect(allBadges(producer).length).toBeGreaterThanOrEqual(6);
  });

  it("drops only the malformed row, never the whole list", () => {
    const other = { ...PRODUCER, id: "7a9b8c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" };
    const bad = row({ id: "9c8b7a6d-1e2f-4a3b-9c4d-5e6f7a8b9c0d" });
    const kept = [row(PRODUCER), bad, row(other)]
      .map((r) => FavoriteWithProducerSchema.safeParse(r))
      .filter((res) => res.success)
      .map((res) => res.data.producer.id);
    expect(kept).toEqual([PRODUCER.id, other.id]);
  });

  it("rejects a row whose producer is missing entirely", () => {
    expect(
      FavoriteWithProducerSchema.safeParse({ producer_id: PRODUCER.id }).success,
    ).toBe(false);
  });
});

// lib/favorites-cache.js is a different consumer: the hearts need producer_id
// only, so a bad nested producer must not empty every heart on the site.
describe("hearts cache (FavoritesResponseSchema)", () => {
  it("keeps producer_id only", () => {
    const [first] = FavoritesResponseSchema.parse([row(PRODUCER)]);
    expect(Object.keys(first)).toEqual(["producer_id"]);
  });

  it("does not read the nested producer", () => {
    expect(
      FavoritesResponseSchema.safeParse([row({ id: PRODUCER.id, name: 1 })]).success,
    ).toBe(true);
  });

  it("rejects a row with no producer_id", () => {
    expect(FavoritesResponseSchema.safeParse([{}]).success).toBe(false);
  });
});
