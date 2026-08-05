/**
 * MEH-1752 — the Zod producer schemas mirror the backend inheritance.
 *
 * The server declares `class ProducerListOut(BaseModel)`
 * (backend/app/schemas/schemas.py:1907, as of 03/08/2026) and
 * `class ProducerDetailOut(ProducerListOut)` (:2128). `lib/schemas.js` now
 * expresses the same relation with `ProducerListSchema` +
 * `ProducerDetailSchema = ProducerListSchema.extend({...})`.
 *
 * Three assertions, deliberately different in kind:
 *   1. STRUCTURAL — detail ⊋ list, and list-only is EMPTY. The empty side is
 *      the load-bearing half: it is what makes `.extend()` the honest shape
 *      rather than two partially-overlapping schemas.
 *   2. BEHAVIOURAL — a list-shaped fixture (every detail-only field absent)
 *      parses clean. A detail field that leaked into the base as required
 *      would fail here and nowhere else.
 *   3. NO-OP — `ProducerSchema` still resolves to the exact field set it had
 *      before the split, so the six un-migrated call sites cannot have
 *      changed shape. This is the assertion that would catch a "tidy-up" that
 *      re-points the alias at the list schema and silently strips the four
 *      fields `ContactCard` renders (MEH-901 class).
 */
import { describe, it, expect } from "vitest";
import {
  ProducerListSchema,
  ProducerDetailSchema,
  ProducerSchema,
} from "@/lib/schemas";

// The four detail-only fields **currently expressed in Zod** — measured from
// the Pydantic classes, not copied from a ticket.
//
// NOT the whole backend delta: ProducerDetailOut adds **17** fields to
// ProducerListOut, and 13 of them are undeclared on either Zod schema (listed
// by name in lib/schemas.js § MEH-1752, audit D2). Read this constant as "the
// part of the delta the frontend models today", never as "the delta" — a field
// absent here may still be detail-only, so placing a new field in
// ProducerListSchema because it is missing from this list would be wrong.
// The Pydantic classes are the authority for placement; MEH-1891's parity
// guard checks the coverage.
const DETAIL_ONLY = ["website", "instagram", "facebook", "external_order_form"];

const listKeys = () => Object.keys(ProducerListSchema.shape);
const detailKeys = () => Object.keys(ProducerDetailSchema.shape);

describe("MEH-1752 — ProducerListSchema / ProducerDetailSchema", () => {
  it("detail is a strict superset of list", () => {
    const L = listKeys();
    const D = detailKeys();
    expect(D.length).toBeGreaterThan(L.length);
    expect(L.filter((k) => !D.includes(k))).toEqual([]); // list-only must be empty
  });

  it("the delta is exactly the four detail-only fields", () => {
    const L = listKeys();
    expect(detailKeys().filter((k) => !L.includes(k)).sort()).toEqual(
      [...DETAIL_ONLY].sort(),
    );
  });

  it("the base schema declares none of the detail-only fields", () => {
    for (const field of DETAIL_ONLY) {
      expect(listKeys()).not.toContain(field);
    }
  });

  it("parses a list payload that omits every detail-only field", () => {
    const fixture = {
      id: "11111111-1111-1111-1111-111111111111",
      name: "מאפיית רוח השדה",
      city: "כפר סבא",
      slug: "ruach-hasade",
      images: ["hero.jpg"],
      phone: "050-0000000",
      avg_rating: 4.5,
      reviews_count: 3,
      has_delivery: true,
      trust_tier: 4,
    };
    const parsed = ProducerListSchema.safeParse(fixture);
    expect(parsed.success).toBe(true);
    for (const field of DETAIL_ONLY) {
      expect(parsed.data).not.toHaveProperty(field);
    }
  });

  it("ProducerSchema stays the detail contract — the split is a runtime no-op", () => {
    expect(Object.keys(ProducerSchema.shape).sort()).toEqual(detailKeys().sort());
    for (const field of DETAIL_ONLY) {
      expect(Object.keys(ProducerSchema.shape)).toContain(field);
    }
  });
});
