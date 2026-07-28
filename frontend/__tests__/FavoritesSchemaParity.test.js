/**
 * MEH-1713 — the /favorites Zod parse must validate the row WITHOUT stripping
 * the nested producer.
 *
 * `FavoritesClient` consumed `GET /users/me/favorites` with no Zod parse at
 * all (Rule-19 gap, carved out of MEH-1704 on purpose). Closing that gap is a
 * two-sided trap, and both sides have to be guarded:
 *
 *   Side A — the one MEH-1704 named. Hand-writing a producer schema here
 *   would strip the badge fields on a THIRD surface, the sixth recurrence of
 *   the MEH-826 / MEH-901 / MEH-902 / MEH-766ch5 / MEH-1412 mechanism. The
 *   fix is to REUSE the exported `ProducerSchema`, never to redeclare it.
 *
 *   Side B — the one only measurement finds. Importing `ProducerSchema` is
 *   NOT sufficient. It is badge-complete, not a `ProducerListOut` mirror: it
 *   declares the 14 fields `badges.js::earnsBadge` reads and nothing more. A
 *   plain `z.object` parse therefore strips nine OTHER fields `ProducerCard`
 *   renders — `trust_tier`, `favorites_count`, `short_description`,
 *   `top_product_name`, `availability_state`, `availability_status`,
 *   `is_available_today`, `has_physical_location`, `offers_delivery` — every
 *   one of which `ProducerListOut` does serialize
 *   (`backend/app/schemas/schemas.py:1649-1738`). `/favorites` renders raw,
 *   unvalidated data today, so a stripping parse would REGRESS the page it is
 *   meant to harden. `.loose()` is what makes the parse structural-only.
 *
 * The discriminating construction (`.claude/rules/testing.md` → MEH-1619):
 * the self-test below feeds the SAME fixture through the naive schema (plain
 * `ProducerSchema`) and the shipped one, and asserts they sort differently.
 * That matters because a guard that merely says "the fields survived" would
 * also have passed on the pre-MEH-1713 tree — where there is no parse at all
 * and nothing can be stripped. Only the naive-vs-shipped contrast isolates
 * the condition this ticket actually changed. It runs FIRST: if the fixture
 * cannot tell a stripping parse from a preserving one, nothing below it is
 * worth reading.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ProducerSchema } from "@/lib/schemas";
import { FavoriteWithProducerSchema } from "@/lib/api-schemas";
import { FavoriteSchema } from "@/lib/api-schemas";
import { allBadges } from "@/lib/badges";

// A producer earning well past the 6-badge floor, carrying BOTH the badge
// inputs and the nine card fields ProducerSchema does not declare. Shapes
// mirror ProducerListOut (schemas.py:1645+).
const RICH_PRODUCER = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "משק הבוסתן",
  // --- badge inputs (declared on ProducerSchema after MEH-1704) ---
  verification_tier: "verified",
  has_producer_license: true,
  is_recommended: true,
  days_since_created: 3,
  grass_fed: true,
  has_gluten_free_products: true,
  has_vegan_products: true,
  has_delivery: true,
  delivery_count: 4,
  products_count: 12,
  // --- card fields NOT declared on ProducerSchema (Side B) ---
  trust_tier: 5,
  favorites_count: 42,
  short_description: "גבינות עיזים מהחווה",
  top_product_name: "לבנה בשמן זית",
  availability_state: "available_today",
  availability_status: "available",
  is_available_today: true,
  has_physical_location: false,
  offers_delivery: true,
};

// The nine ProducerListOut fields ProducerCard/TrustBadge read that
// ProducerSchema does not declare. Each is asserted individually so a
// failure message names the field that went missing.
const UNDECLARED_CARD_FIELDS = [
  "trust_tier",
  "favorites_count",
  "short_description",
  "top_product_name",
  "availability_state",
  "availability_status",
  "is_available_today",
  "has_physical_location",
  "offers_delivery",
];

const row = (producer, overrides = {}) => ({
  producer_id: producer.id,
  producer,
  created_at: "2026-07-01T00:00:00Z",
  ...overrides,
});

// The naive schema this ticket had to avoid: same reuse of ProducerSchema,
// but WITHOUT .loose(). Declared here only as the control arm of the
// self-test — it is not exported and nothing ships against it.
const NAIVE_SCHEMA = z.object({
  producer_id: z.union([z.string(), z.number()]),
  producer: ProducerSchema,
  created_at: z.string().nullable().optional(),
});

describe("MEH-1713 self-test — the fixture discriminates", () => {
  it("sorts the naive (stripping) schema apart from the shipped (.loose) one", () => {
    const naive = NAIVE_SCHEMA.parse(row(RICH_PRODUCER));
    const shipped = FavoriteWithProducerSchema.parse(row(RICH_PRODUCER));

    // Both parses SUCCEED — that is the whole danger. The difference is not
    // validity, it is what survives, which is why "does it parse?" is not an
    // assertion worth making here.
    const naiveKept = UNDECLARED_CARD_FIELDS.filter((f) => f in naive.producer);
    const shippedKept = UNDECLARED_CARD_FIELDS.filter((f) => f in shipped.producer);

    expect(naiveKept).toEqual([]); // the bug, reproduced
    expect(shippedKept).toEqual(UNDECLARED_CARD_FIELDS); // the fix
  });
});

describe("MEH-1713 — /favorites row parse", () => {
  it("keeps every undeclared card field the backend serializes", () => {
    const { producer } = FavoriteWithProducerSchema.parse(row(RICH_PRODUCER));
    for (const field of UNDECLARED_CARD_FIELDS) {
      expect(producer[field], `stripped: producer.${field}`).toEqual(RICH_PRODUCER[field]);
    }
  });

  // The MEH-1704 guard applied to this route.
  it("keeps 6+ badges alive through the parse", () => {
    expect(allBadges(RICH_PRODUCER).length).toBeGreaterThanOrEqual(6);
    const { producer } = FavoriteWithProducerSchema.parse(row(RICH_PRODUCER));
    expect(allBadges(producer).length).toBeGreaterThanOrEqual(6);
  });

  it("reuses ProducerSchema rather than redeclaring producer fields", () => {
    // Every key ProducerSchema accepts must also be accepted here — the
    // structural expression of "imported, not copied". A hand-written
    // producer schema would drift from this the moment ProducerSchema gains
    // a field, which is precisely the MEH-1704 failure mode.
    const declared = Object.keys(ProducerSchema.shape);
    const nested = Object.keys(FavoriteWithProducerSchema.shape.producer.shape);
    expect(nested).toEqual(declared);
  });

  it("drops only the malformed row, never the whole list", () => {
    const good = row(RICH_PRODUCER);
    const alsoGood = row({ ...RICH_PRODUCER, id: "22222222-2222-2222-2222-222222222222" });
    // `name` is the one required producer field; omitting it is a real
    // structural failure rather than a merely-unexpected shape.
    const bad = row({ id: "33333333-3333-3333-3333-333333333333" });

    const kept = [good, bad, alsoGood]
      .map((r) => FavoriteWithProducerSchema.safeParse(r))
      .filter((res) => res.success)
      .map((res) => res.data);

    expect(kept).toHaveLength(2);
    expect(kept.map((k) => k.producer.id)).toEqual([RICH_PRODUCER.id, alsoGood.producer.id]);
  });

  it("rejects a row whose producer is missing entirely", () => {
    expect(FavoriteWithProducerSchema.safeParse({ producer_id: "x" }).success).toBe(false);
  });

  // lib/favorites-cache.js is a different consumer with a different shape:
  // heart-state, no nested producer. MEH-1713 must not have widened it.
  it("leaves the heart-state FavoriteSchema untouched", () => {
    expect(Object.keys(FavoriteSchema.shape).sort()).toEqual(["id", "producer_id"]);
    const parsed = FavoriteSchema.parse({ producer_id: "abc", producer: RICH_PRODUCER });
    expect(parsed.producer).toBeUndefined();
  });
});
