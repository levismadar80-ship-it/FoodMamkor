import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import { FILTER_AXES, chipsForKeys } from "@/lib/filter-taxonomy";
import { CATEGORY_CHIPS, TOGGLE_CHIPS } from "@/lib/map-chips";
import { resolveChipCopy } from "@/lib/chip-copy";
import { useChipCopy } from "@/lib/use-chip-copy";

/**
 * MEH-2748 — filter-chip words live in messages/{he,en}.json, not in code.
 * The registries (FILTER_AXES, map CATEGORY_CHIPS) keep keys and wiring only;
 * lib/chip-copy.js attaches `label` / `subtext` at render time.
 */
const HEBREW = /[֐-׿]/;
const AXIS_KEYS = Object.keys(FILTER_AXES).sort();
const CAT_KEYS = CATEGORY_CHIPS.map((c) => c.key).sort();

describe("MEH-2748 — chip registries carry no words", () => {
  it("no axis stores a label or subtext", () => {
    for (const [key, axis] of Object.entries(FILTER_AXES)) {
      expect(axis.label, `${key}.label`).toBeUndefined();
      expect(axis.subtext, `${key}.subtext`).toBeUndefined();
    }
  });

  it("no map category chip stores a label", () => {
    for (const chip of CATEGORY_CHIPS) expect(chip.label, chip.key).toBeUndefined();
  });

  it.each([
    ["he", he],
    ["en", en],
  ])("%s.json has a label for exactly the registry keys", (_, msgs) => {
    expect(Object.keys(msgs.filter_axes).sort()).toEqual(AXIS_KEYS);
    expect(Object.keys(msgs.map_category_chips).sort()).toEqual(CAT_KEYS);
    for (const key of AXIS_KEYS) {
      expect(msgs.filter_axes[key].label, key).toBeTruthy();
      // subtext exists exactly where the axis says it does
      expect(Boolean(msgs.filter_axes[key].subtext), `${key}.subtext`).toBe(FILTER_AXES[key].hasSubtext);
    }
  });

  it("en.json chip copy holds no Hebrew", () => {
    const flat = JSON.stringify([en.filter_axes, en.map_category_chips]);
    expect(flat).not.toMatch(HEBREW);
  });
});

describe("MEH-2748 — the resolver", () => {
  const t = (k) => `T(${k})`;

  it("adds label and subtext to an axis chip", () => {
    const [chip] = chipsForKeys(["pickup_points"]);
    expect(resolveChipCopy(t, chip)).toMatchObject({
      key: "pickup_points",
      label: "T(filter_axes.pickup_points.label)",
      subtext: "T(filter_axes.pickup_points.subtext)",
    });
  });

  it("gives an axis without a subtext null (the FilterSheet badge-tooltip fallback)", () => {
    const [chip] = chipsForKeys(["kosher"]);
    expect(resolveChipCopy(t, chip).subtext).toBeNull();
  });

  it("labels a /map aggregate category chip", () => {
    expect(resolveChipCopy(t, CATEGORY_CHIPS[1]).label).toBe(`T(map_category_chips.${CATEGORY_CHIPS[1].key})`);
  });

  it("leaves a chip that already has a label untouched (DB category, city, translated all)", () => {
    const own = { key: "all", label: "own" };
    expect(resolveChipCopy(t, own)).toBe(own);
    const db = { key: "17", label: "db name" };
    expect(resolveChipCopy(t, db)).toBe(db);
  });
});

describe("MEH-2748 — through the real next-intl provider", () => {
  const run = (locale, messages) =>
    renderHook(() => useChipCopy(), {
      wrapper: ({ children }) => (
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      ),
    }).result.current;

  it("renders the Sapir-locked Hebrew in he", () => {
    const withCopy = run("he", he);
    const vegan = withCopy(TOGGLE_CHIPS.find((c) => c.key === "vegan"));
    expect(vegan.label).toBe("מתאים לטבעונים");
    expect(vegan.subtext).toBe("עסקים עם מוצרים טבעוניים בקטלוג");
    expect(withCopy(CATEGORY_CHIPS[0]).label).toBe("כל");
  });

  it("renders English in en", () => {
    const withCopy = run("en", en);
    for (const chip of [...TOGGLE_CHIPS, ...CATEGORY_CHIPS].map(withCopy)) {
      expect(chip.label, chip.key).toBeTruthy();
      expect(chip.label, chip.key).not.toMatch(HEBREW);
    }
  });
});
