/**
 * MEH-1508 chunk 3ב-2 — the 100% diet layer reaches the consumer surfaces.
 *
 * Two halves the card rules inseparable (§5 "Chunk 3"):
 *
 *  MEH-2677: (א) is now badge-only — the chip left every filter surface.
 *  (א) «טבעוני» / «צמחוני» — a filter chip on home, /producers and
 *      /map wired to the backend's standalone `?vegan_all` / `?vegetarian_all`
 *      (PR #3448, producer_listing._SCOPE_ALL_FILTERS), and a badge on the card
 *      and the business page. scope `business`, evidence `self-declared`,
 *      subtext «לפי הצהרת בית העסק», no checkmark (§6.4 — the MEH-1259
 *      pattern, never MEH-1087's). Data-gated at threshold 1.
 *  (ב) the rename of the exposed chips (§6.6) — «טבעוני» → «מתאים לטבעונים»,
 *      «צמחוני» → «מתאים לצמחונים». Without it the partial and the whole-business
 *      chip (then «100% טבעוני», since MEH-2677 the bare «טבעוני») sit
 *      side by side and the reader has to infer that the bare term means
 *      "partial".
 *
 * Every assertion runs against the REAL modules — no stubbed config, or the
 * spec would pass against any shipped value at all.
 */
import { heBadgeCopy } from "./helpers/he-badge-copy";
import { describe, it, expect } from "vitest";
import { Leaf, Carrot, SealCheck } from "@phosphor-icons/react";
import { FILTER_AXES, LISTING_CHIP_ORDER, MAP_CHIP_ORDER } from "@/lib/filter-taxonomy";
import {
  CHIPS_CONFIG,
  PRODUCERS_CHIPS_CONFIG,
  visibleGatedDietKeys,
} from "@/lib/producer-filters";
import { TOGGLE_CHIPS, visibleMapToggleChips } from "@/lib/map-chips";
import { BADGE_CONFIG, allBadges } from "@/lib/badges";
import { badgeIcon } from "@/lib/chip-icons";
import { ProducerSchema } from "@/lib/schemas";
import { heChipCopy } from "./helpers/he-chip-copy";

const LOCKED = {
  vegan: "מתאים לטבעונים",
  vegetarian: "מתאים לצמחונים",
  vegan_all: "טבעוני",
  vegetarian_all: "צמחוני",
};
const DECLARED = "לפי הצהרת בית העסק";
// MEH-2748: chip words come from messages — read them as a renderer does.
const heLabel = (key) => heChipCopy({ key }).label;
const SCOPE_ALL = ["vegan_all", "vegetarian_all"];

describe("§6.6 — the exposed diet chips carry their scope in the term", () => {
  it("renames vegan / vegetarian to the locked strings, on every surface", () => {
    for (const key of ["vegan", "vegetarian"]) {
      expect(heLabel(key)).toBe(LOCKED[key]);
      for (const surface of [CHIPS_CONFIG, PRODUCERS_CHIPS_CONFIG, TOGGLE_CHIPS]) {
        expect(heChipCopy(surface.find((c) => c.key === key))?.label).toBe(LOCKED[key]);
      }
    }
  });

  it("renames the twin badges too, so the card and the filter say the same", () => {
    expect(heBadgeCopy(BADGE_CONFIG.vegan).label).toBe(LOCKED.vegan);
    expect(heBadgeCopy(BADGE_CONFIG.vegetarian).label).toBe(LOCKED.vegetarian);
  });

  it("leaves gluten-free / lactose-free untouched (they have no 100% layer)", () => {
    expect(heLabel("gluten_free")).toBe("ללא גלוטן");
    expect(heLabel("lactose_free")).toBe("ללא לקטוז");
    expect(heBadgeCopy(BADGE_CONFIG.gluten_free).label).toBe("ללא גלוטן");
    expect(heBadgeCopy(BADGE_CONFIG.lactose_free).label).toBe("ללא לקטוז");
  });
});

describe("MEH-2677 — the whole-business axes are a card badge, not a filter chip", () => {
  // Sapir 05/11: «מתאים לצמחונים» + «צמחוני» side by side in the sheet read as
  // a duplicate. One chip per diet (the Uber Eats pattern); the declaration
  // stays visible as the card badge below.
  it.each(SCOPE_ALL)("%s keeps its declaration (label, scope, evidence) for the badge pairing", (key) => {
    expect(FILTER_AXES[key], `FILTER_AXES.${key}`).toBeDefined();
    const axis = heChipCopy({ key, ...FILTER_AXES[key] });
    expect(axis.label).toBe(LOCKED[key]);
    expect(axis.scope).toBe("business");
    expect(axis.evidence).toBe("self-declared");
    expect(axis.subtext).toBe(DECLARED);
    expect(axis.surfaces).toEqual([]);
  });

  it.each(SCOPE_ALL)("%s is offered on no filter surface", (key) => {
    expect(CHIPS_CONFIG.map((c) => c.key)).not.toContain(key);
    expect(PRODUCERS_CHIPS_CONFIG.map((c) => c.key)).not.toContain(key);
    expect(TOGGLE_CHIPS.map((c) => c.key)).not.toContain(key);
    expect(LISTING_CHIP_ORDER).not.toContain(key);
    expect(MAP_CHIP_ORDER).not.toContain(key);
  });

  it("the partial chips are still offered everywhere, with their locked copy", () => {
    for (const key of ["vegan", "vegetarian"]) {
      expect(CHIPS_CONFIG.map((c) => c.key)).toContain(key);
      expect(PRODUCERS_CHIPS_CONFIG.map((c) => c.key)).toContain(key);
      expect(TOGGLE_CHIPS.map((c) => c.key)).toContain(key);
    }
  });

  it("is never data-gated any more (no chip to gate)", () => {
    const declared = Array.from({ length: 3 }, (_, i) => ({ id: i, vegan_scope: "all", vegetarian_scope: "all" }));
    expect(visibleGatedDietKeys(declared, {})).not.toContain("vegan_all");
    expect(visibleGatedDietKeys(declared, {})).not.toContain("vegetarian_all");
    const map = visibleMapToggleChips({ catalogSnapshot: declared }).map((c) => c.key);
    expect(map).not.toContain("vegan_all");
    expect(map).not.toContain("vegetarian_all");
  });

  it("the badge keeps a glyph that is not a checkmark", () => {
    expect(badgeIcon("vegan_all")?.type).toBe(Leaf);
    expect(badgeIcon("vegetarian_all")?.type).toBe(Carrot);
    for (const key of SCOPE_ALL) expect(badgeIcon(key)?.type).not.toBe(SealCheck);
  });
});

describe("§6.4 — the 100% badges", () => {
  it.each(SCOPE_ALL)("%s badge: locked label, declared tooltip, muted, business scope", (key) => {
    const b = heBadgeCopy(BADGE_CONFIG[key]);
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

  it("a business 100% vegan AND 100% vegetarian wears only «טבעוני» (vegan ⊆ vegetarian)", () => {
    const keys = allBadges({ vegan_scope: "all", vegetarian_scope: "all" }).map((b) => b.key);
    expect(keys).toContain("vegan_all");
    expect(keys).not.toContain("vegetarian_all");
    expect(keys).toEqual(["vegan_all"]);
    // 100% vegetarian alone is untouched.
    expect(
      allBadges({ vegan_scope: "some", vegetarian_scope: "all" }).map((b) => b.key),
    ).toEqual(["vegetarian_all"]);
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
