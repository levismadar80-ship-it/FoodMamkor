// MEH-3198 (27/11 prod incident): a hand-written response schema must accept
// every value the backend contract allows. Category emoji was `str | None` on
// the backend and `z.string().optional()` in lib/schemas.js; one admin-created
// category without an emoji emptied /map in production.
//
// This walks each hand-written schema next to its GENERATED twin
// (lib/generated/api.zod.js, built from backend/openapi.json) and fails on a
// field the backend may send as null, or omit, that the hand-written schema
// rejects. It runs the schemas (safeParse on null / undefined); it does not
// read source text.
import { describe, it, expect } from "vitest";
import * as H from "@/lib/schemas";
import * as G from "@/lib/generated/api.zod";

const WRAPPERS = new Set(["optional", "nullable", "default", "catch", "prefault", "readonly", "nonoptional"]);

function unwrap(schema) {
  let s = schema;
  for (let i = 0; i < 10 && s?._zod?.def; i += 1) {
    const def = s._zod.def;
    if (WRAPPERS.has(def.type)) s = def.innerType;
    else if (def.type === "pipe") s = def.in;
    else break;
  }
  return s;
}

const kind = (s) => unwrap(s)?._zod?.def?.type;

/** Every path where the backend allows null/absence and the frontend does not. */
function mismatches(hand, gen, path, out = []) {
  if (kind(hand) === "object" && kind(gen) === "object") {
    const hs = unwrap(hand)._zod.def.shape;
    const gs = unwrap(gen)._zod.def.shape;
    for (const key of Object.keys(hs)) {
      if (!(key in gs)) continue;
      if (gs[key].safeParse(null).success && !hs[key].safeParse(null).success) out.push(`${path}.${key} (null)`);
      if (gs[key].safeParse(undefined).success && !hs[key].safeParse(undefined).success) out.push(`${path}.${key} (absent)`);
      mismatches(hs[key], gs[key], `${path}.${key}`, out);
    }
  } else if (kind(hand) === "array" && kind(gen) === "array") {
    mismatches(unwrap(hand)._zod.def.element, unwrap(gen)._zod.def.element, `${path}[]`, out);
  }
  return out;
}

const PAIRS = [
  ["ProducerListSchema", H.ProducerListSchema, G.ListProducersProducersGetResponseItem],
  ["ProducerDetailSchema", H.ProducerDetailSchema, G.GetProducerBySlugProducersBySlugSlugGetResponse],
  ["EventMetadataSchema", H.EventMetadataSchema, G.GetEventEventsEventIdGetResponse],
  ["GroupBuyMetadataSchema", H.GroupBuyMetadataSchema, G.GetGroupBuyGroupBuysGroupBuyIdGetResponse],
  ["ExperienceMetadataSchema", H.ExperienceMetadataSchema, G.GetExperienceExperiencesExperienceIdGetResponse],
  ["OrganizerPageSchema", H.OrganizerPageSchema, G.GetOrganizerOrganizersSlugGetResponse],
];

describe("hand-written response schemas accept what the backend may send", () => {
  it("the walker is live: it finds the MEH-3198 case in a schema built like the old one", async () => {
    const { z } = await import("zod");
    const oldShape = z.object({ categories: z.array(z.object({ emoji: z.string().optional() })).optional() });
    expect(mismatches(oldShape, G.ListProducersProducersGetResponseItem, "old")).toEqual(["old.categories[].emoji (null)"]);
  });

  it.each(PAIRS)("%s has no field the backend may null or omit that it rejects", (_name, hand, gen) => {
    expect(gen, "generated twin missing — was it renamed in api.zod.js?").toBeDefined();
    expect(mismatches(hand, gen, _name)).toEqual([]);
  });
});
