/**
 * MEH-1508 chunk 3ב-2 — the 100% diet layer reaches the consumer surfaces.
 *
 * Two halves the card rules inseparable (§5 "Chunk 3"):
 *
 *  (א) «100% טבעוני» / «100% צמחוני» — a filter chip on home, /producers and
 *      /map wired to the backend's standalone `?vegan_all` / `?vegetarian_all`
 *      (PR #3448, producer_listing._SCOPE_ALL_FILTERS), and a badge on the card
 *      and the business page. scope `business`, evidence `self-declared`,
 *      subtext «לפי הצהרת בית העסק», no checkmark (§6.4 — the MEH-1259
 *      pattern, never MEH-1087's). Data-gated at threshold 1.
 *  (ב) the rename of the exposed chips (§6.6) — «טבעוני» → «מתאים לטבעונים»,
 *      «צמחוני» → «מתאים לצמחונים». Without it «טבעוני» and «100% טבעוני» sit
 *      side by side and the reader has to infer that the bare term means
 *      "partial".
 *
 * Every assertion runs against the REAL modules — no stubbed config, or the
 * spec would pass against any shipped value at all.
 */
import { describe, it, expect } from "vitest";
import { Leaf, Carrot, SealCheck } from "@phosphor-icons/react";
import { FILTER_AXES, LISTING_CHIP_ORDER, MAP_CHIP_ORDER } from "@/lib/filter-taxonomy";
import {
  CHIPS_CONFIG,
  PRODUCERS_CHIPS_CONFIG,
  buildChipParams,
  visibleGatedDietKeys,
} from "@/lib/producer-filters";
import { TOGGLE_CHIPS, chipStateToParams, visibleMapToggleChips } from "@/lib/map-chips";
import { chipsFromQuery, chipsToQuery } from "@/lib/filter-url";
import { BADGE_CONFIG, allBadges } from "@/lib/badges";
import { badgeIcon, chipIcon } from "@/lib/chip-icons";
import { ProducerSchema } from "@/lib/schemas";

const LOCKED = {
  vegan: "מתאים לטבעונים",
  vegetarian: "מתאים לצמחונים",
  vegan_all: "100% טבעוני",
  vegetarian_all: "100% צמחוני",
};
const DECLARED = "לפי הצהרת בית העסק";
const SCOPE_ALL = ["vegan_all", "vegetarian_all"];

describe("§6.6 — the exposed diet chips carry their scope in the term", () => {
  it("renames vegan / vegetarian to the locked strings, on every surface", () => {
    for (const key of ["vegan", "vegetarian"]) {
      expect(FILTER_AXES[key].label).toBe(LOCKED[key]);
      for (const surface of [CHIPS_CONFIG, PRODUCERS_CHIPS_CONFIG, TOGGLE_CHIPS]) {
        expect(surface.find((c) => c.key === key)?.label).toBe(LOCKED[key]);
      }
    }
  });

  it("renames the twin badges too, so the card and the filter say the same", () => {
    expect(BADGE_CONFIG.vegan.label).toBe(LOCKED.vegan);
    expect(BADGE_CONFIG.vegetarian.label).toBe(LOCKED.vegetarian);
  });

  it("leaves gluten-free / lactose-free untouched (they have no 100% layer)", () => {
    expect(FILTER_AXES.gluten_free.label).toBe("ללא גלוטן");
    expect(FILTER_AXES.lactose_free.label).toBe("ללא לקטוז");
    expect(BADGE_CONFIG.gluten_free.label).toBe("ללא גלוטן");
    expect(BADGE_CONFIG.lactose_free.label).toBe("ללא לקטוז");
  });
});

describe("§6.4 — the 100% chips", () => {
  it.each(SCOPE_ALL)("%s is a business-scope self-declaration with the locked copy", (key) => {
    const axis = FILTER_AXES[key];
    expect(axis, `FILTER_AXES.${key}`).toBeDefined();
    expect(axis.label).toBe(LOCKED[key]);
    expect(axis.scope).toBe("business");
    expect(axis.evidence).toBe("self-declared");
    expect(axis.subtext).toBe(DECLARED);
    expect(axis.group).toBe("diet");
    expect([...axis.surfaces].sort()).toEqual(["home", "map", "producers"]);
  });

  it.each(SCOPE_ALL)("%s is offered on home, /producers and /map", (key) => {
    expect(CHIPS_CONFIG.map((c) => c.key)).toContain(key);
    expect(PRODUCERS_CHIPS_CONFIG.map((c) => c.key)).toContain(key);
    expect(TOGGLE_CHIPS.map((c) => c.key)).toContain(key);
  });

  it("each 100% chip sits directly after its partial twin on every surface", () => {
    for (const order of [LISTING_CHIP_ORDER, MAP_CHIP_ORDER]) {
      expect(order.indexOf("vegan_all")).toBe(order.indexOf("vegan") + 1);
      expect(order.indexOf("vegetarian_all")).toBe(order.indexOf("vegetarian") + 1);
    }
  });

  it("emits the backend's own param name on every surface (PR #3448)", () => {
    expect(buildChipParams({ vegan_all: true, vegetarian_all: true })).toEqual({
      vegan_all: true,
      vegetarian_all: true,
    });
    expect(chipStateToParams({ vegan_all: true }, [])).toEqual({ vegan_all: true });
    expect(chipStateToParams({ vegetarian_all: true }, [])).toEqual({ vegetarian_all: true });
    // The list↔map handoff carries it and reads it back.
    expect(chipsToQuery({ vegan_all: true })).toBe("?vegan_all=1");
    expect(chipsFromQuery(new URLSearchParams("vegetarian_all=1"), SCOPE_ALL)).toEqual({
      vegetarian_all: true,
    });
  });

  it("does not turn the partial filter into the 100% one (distinct params)", () => {
    expect(buildChipParams({ vegan: true })).toEqual({ vegan: true });
    expect(chipStateToParams({ vegetarian: true }, [])).toEqual({ vegetarian: true });
  });

  it("carries a glyph that is not a checkmark", () => {
    expect(chipIcon("vegan_all")?.type).toBe(Leaf);
    expect(chipIcon("vegetarian_all")?.type).toBe(Carrot);
    for (const key of SCOPE_ALL) {
      expect(chipIcon(key)?.type).not.toBe(SealCheck);
      expect(LOCKED[key]).not.toMatch(/[✓✔☑]/u);
    }
  });
});

describe("data gate — threshold 1 (06/09), absent rather than disabled", () => {
  const declared = (field, n, value = "all") =>
    Array.from({ length: n }, (_, i) => ({ id: i, [field]: value }));

  it("shows the chip as soon as ONE business declared 100%", () => {
    const shown = visibleGatedDietKeys(declared("vegan_scope", 1), {});
    expect(shown).toContain("vegan_all");
    expect(shown).not.toContain("vegetarian_all");
    expect(visibleGatedDietKeys(declared("vegetarian_scope", 1), {})).toContain("vegetarian_all");
  });

  it("hides it at zero, and `some` / `unknown` do not count", () => {
    expect(visibleGatedDietKeys([], {})).not.toContain("vegan_all");
    const partial = [
      ...declared("vegan_scope", 4, "some"),
      ...declared("vegan_scope", 4, "unknown"),
      // a business with vegan PRODUCTS but no declaration: the partial axis,
      // never the 100% one.
      { id: 99, has_vegan_products: true },
    ];
    expect(visibleGatedDietKeys(partial, {})).not.toContain("vegan_all");
  });

  it("an active 100% filter keeps its chip at zero (no stranded deep link)", () => {
    expect(visibleGatedDietKeys([], { vegetarian_all: true })).toContain("vegetarian_all");
  });

  it("/map gates the same way, from the mount snapshot", () => {
    const keys = (chips) => chips.map((c) => c.key);
    const one = keys(visibleMapToggleChips({ catalogSnapshot: declared("vegan_scope", 1) }));
    expect(one).toContain("vegan_all");
    expect(one).not.toContain("vegetarian_all");
    const none = keys(visibleMapToggleChips({ catalogSnapshot: declared("vegan_scope", 3, "some") }));
    expect(none).not.toContain("vegan_all");
    const active = keys(
      visibleMapToggleChips({ catalogSnapshot: [], chipState: { vegetarian_all: true } }),
    );
    expect(active).toContain("vegetarian_all");
  });
});

describe("§6.4 — the 100% badges", () => {
  it.each(SCOPE_ALL)("%s badge: locked label, declared tooltip, muted, business scope", (key) => {
    const b = BADGE_CONFIG[key];
    expect(b, `BADGE_CONFIG.${key}`).toBeDefined();
    expect(b.key).toBe(key);
    expect(b.label).toBe(LOCKED[key]);
    expect(b.tooltip).toBe(DECLARED);
    // `primary` is the verified seal's colour — a self-declaration never wears it.
    expect(b.color).toBe("muted");
    expect(b.scope).toBe("business");
    expect(b.evidence).toBe("self-declared");
    expect(badgeIcon(key)?.type).not.toBe(SealCheck);
  });

  it("lights on the declaration alone", () => {
    expect(allBadges({ vegan_scope: "all" }).map((b) => b.key)).toEqual(["vegan_all"]);
    expect(allBadges({ vegetarian_scope: "all" }).map((b) => b.key)).toEqual(["vegetarian_all"]);
    for (const v of ["some", "unknown", null, undefined]) {
      expect(allBadges({ vegan_scope: v, vegetarian_scope: v })).toEqual([]);
    }
  });

  it("the 100% badge supersedes its partial twin on the same business (MEH-1841 shape)", () => {
    expect(
      allBadges({ vegan_scope: "all", has_vegan_products: true }).map((b) => b.key),
    ).toEqual(["vegan_all"]);
    expect(
      allBadges({ vegetarian_scope: "all", has_vegetarian_products: true }).map((b) => b.key),
    ).toEqual(["vegetarian_all"]);
    // Without the declaration the partial badge is unchanged.
    expect(allBadges({ has_vegan_products: true }).map((b) => b.key)).toEqual(["vegan"]);
  });

  it("the two Zod-parsed feeds keep the fields the badge reads", () => {
    const parsed = ProducerSchema.parse({
      id: "p-1",
      name: "עסק",
      vegan_scope: "all",
      vegetarian_scope: "some",
    });
    expect(parsed.vegan_scope).toBe("all");
    expect(parsed.vegetarian_scope).toBe("some");
  });
});
