// MEH-3824 — a switch that is gated on "is there a business it would match"
// can be hidden for ever by a field name. The gate (visibleAxisChips) counts
// businesses whose predicate is true; if the predicate reads a field the
// server never sends, or one the list's parse drops, it is false for every
// business and the switch never shows. No other test sees that: the gate
// tests feed hand-made objects that carry whatever field the predicate wants.
// Sapir 25/11: «האם יש דרך מסודרת לבדוק את המנגנון שיש ואין כדי לא לפספס».
//
// So, for EVERY count-gated axis (not a list written here — a new axis is
// covered the day it is added):
//   1. record which fields its predicate reads (a Proxy, so the predicate
//      runs; nothing parses its source);
//   2. each of those fields is a property of ProducerListOut in the
//      generated contract (backend/openapi.json — a generated file nothing
//      runs, read as data);
//   3. a real list row with those fields set, parsed by the schema the map
//      and the lists parse with, still makes the predicate true — so the
//      parse keeps the field — and the same row with them cleared makes it
//      false, so the predicate depends on them.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { FILTER_AXES } from "@/lib/filter-taxonomy";
import { GATED_AXIS_PREDICATES, GATED_DIET_KEYS } from "@/lib/producer-filters";
import { ProducersResponseSchema } from "@/lib/schemas";
import ROW from "./fixtures/producer-list-row.json";

const OPENAPI = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../backend/openapi.json"), "utf8"),
);
const SERVER_FIELDS = new Set(Object.keys(OPENAPI.components.schemas.ProducerListOut.properties));

// A value that is truthy for a boolean field and for an object field alike
// (rescue_today is an object: the bag's window and price).
const TRUTHY = {
  rescue_today: {
    offer_id: "00000000-0000-4000-8000-000000000001",
    pickup_start: "2026-11-25T17:00:00Z",
    pickup_end: "2026-11-25T19:00:00Z",
    price_agorot: 2500,
    value_min_agorot: 7500,
    qty_left: 2,
  },
};

/** The fields `predicate` reads from a producer. */
function fieldsRead(predicate) {
  const seen = new Set();
  const probe = new Proxy(
    {},
    {
      get(_, key) {
        if (typeof key === "string") seen.add(key);
        return undefined;
      },
    },
  );
  predicate(probe);
  return [...seen];
}

const parseRow = (row) => {
  const parsed = ProducersResponseSchema.safeParse([row]);
  expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);
  return parsed.data[0];
};

const COUNT_GATED = Object.keys(FILTER_AXES).filter((k) => FILTER_AXES[k].gate === "count");

describe("MEH-3824 — every count gate reads fields the server sends and the parse keeps", () => {
  it("self-test: the probe records a field, and catches a misspelt one", () => {
    expect(fieldsRead((p) => !!p.has_open_group_buy)).toEqual(["has_open_group_buy"]);
    const typo = fieldsRead((p) => !!p.has_open_groupbuy);
    expect(typo.every((f) => SERVER_FIELDS.has(f))).toBe(false);
    // Anchored to the real contract: a field we know is sent is in the set.
    expect(SERVER_FIELDS.has("sells_on_site")).toBe(true);
  });

  it("the walk covers every count-gated axis, the offer switches included", () => {
    expect(COUNT_GATED.sort()).toEqual([...GATED_DIET_KEYS].sort());
    for (const k of ["rescue_today", "group_buy", "event", "experience"]) {
      expect(COUNT_GATED).toContain(k);
    }
  });

  it.each(COUNT_GATED)("%s: its predicate reads only ProducerListOut fields", (key) => {
    const fields = fieldsRead(GATED_AXIS_PREDICATES[key]);
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) expect(SERVER_FIELDS, `${key} reads ${f}`).toContain(f);
  });

  it.each(COUNT_GATED)("%s: a parsed list row with the field set counts, cleared does not", (key) => {
    const predicate = GATED_AXIS_PREDICATES[key];
    const fields = fieldsRead(predicate);
    const on = { ...ROW };
    const off = { ...ROW };
    for (const f of fields) {
      on[f] = TRUTHY[f] ?? true;
      off[f] = typeof ROW[f] === "boolean" || TRUTHY[f] === undefined ? false : null;
    }
    expect(predicate(parseRow(on))).toBe(true);
    expect(predicate(parseRow(off))).toBe(false);
  });
});
