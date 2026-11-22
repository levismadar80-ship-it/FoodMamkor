// MEH-3076 (Sapir 21/11, «צבע לקבוצה»): a map pin is coloured by its
// category's GROUP and drawn with its category's OWN glyph; the /map legend has
// one row per group, labelled in the reader's language.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import {
  CATEGORY_GROUP_STYLES,
  CATEGORY_LEGEND,
  CATEGORY_GLYPHS,
  styleForProducer,
} from "@/lib/category-registry";
import { CATEGORY_GROUPS, CATEGORY_TAXONOMY } from "@/lib/category-taxonomy";
import { CATEGORY_CHIPS } from "@/lib/map-chips";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/app/[locale]/map/components/MapKey", () => ({ default: () => null }));

const { default: MapPane } = await import("@/app/[locale]/map/components/MapPane");

const pinOf = (category) => styleForProducer({ categories: [category] });

describe("map pins — colour by group, glyph by category (MEH-3076)", () => {
  it("every category's pin wears its group's colour and its own glyph", () => {
    for (const c of CATEGORY_TAXONOMY) {
      const pin = pinOf({ slug: c.slug, name: "renamed" });
      expect(pin.color, c.slug).toBe(CATEGORY_GROUP_STYLES[c.group].color);
      expect(pin.icon, c.slug).toBe(CATEGORY_GLYPHS[c.slug]);
    }
  });

  it("a row without a slug finds the same pin by its Hebrew name", () => {
    const veg = CATEGORY_TAXONOMY.find((c) => c.slug === "veg");
    expect(pinOf({ name: veg.name })).toBe(pinOf({ slug: "veg" }));
    expect(pinOf({ name: veg.name }).color).toBe(CATEGORY_GROUP_STYLES.produce.color);
  });

  it("two categories of one group share the colour and differ by glyph", () => {
    for (const group of CATEGORY_GROUPS) {
      const members = CATEGORY_TAXONOMY.filter((c) => c.group === group);
      const glyphs = new Set(members.map((c) => pinOf({ slug: c.slug }).icon));
      expect(glyphs.size, group).toBe(members.length);
    }
  });

  it("oil moved onto the pantry honey colour", () => {
    expect(pinOf({ slug: "oil" }).color).toBe(pinOf({ slug: "honey" }).color);
  });

  it("an unknown category, and an object-prototype name, get the default pin", () => {
    expect(pinOf({ name: "קטגוריה חדשה" }).color).toBe(CATEGORY_GROUP_STYLES.produce.color);
    expect(typeof pinOf({ name: "constructor" }).icon).not.toBe("undefined");
    expect(pinOf({ name: "constructor" }).color).toMatch(/^#/);
  });

  it("the chip row's tints are the group colours (one palette, two surfaces)", () => {
    for (const chip of CATEGORY_CHIPS.filter((c) => c.iconColor)) {
      const style = CATEGORY_GROUP_STYLES[chip.key];
      expect(chip.iconColor, chip.key).toBe(style.textColor ?? style.color);
    }
  });
});

const PRODUCERS = [
  { id: "a", categories: [{ name: "ירקות", slug: "veg" }] },
  { id: "b", categories: [{ name: "פירות", slug: "fruit" }] },
  { id: "c", categories: [{ name: "בשר", slug: "meat" }] },
];

function renderLegend(locale, props = {}) {
  const messages = locale === "en" ? en : he;
  const toggleCategory = vi.fn();
  render(
    <NextIntlClientProvider locale={locale} messages={messages} onError={() => {}}>
      <MapPane
        producers={PRODUCERS}
        visibleProducers={PRODUCERS}
        allProducers={PRODUCERS}
        legendOpen
        onLegendToggle={() => {}}
        isCategoryActive={() => true}
        toggleCategory={toggleCategory}
        activeCategoryNames={null}
        setActiveCategoryNames={() => {}}
        viewportCategoryCounts={{ produce: 2, meat: 1 }}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { toggleCategory, rows: screen.getAllByTestId("map-legend-row") };
}

describe("/map legend — six groups, localized (MEH-3076)", () => {
  it("has one row per group, in chip-row order", () => {
    expect(CATEGORY_LEGEND.map((r) => r.key)).toEqual([...CATEGORY_GROUPS]);
    expect(CATEGORY_GROUPS).toEqual(CATEGORY_CHIPS.filter((c) => c.key !== "all").map((c) => c.key));
  });

  it("/en shows the English group names, no Hebrew", () => {
    const { rows } = renderLegend("en");
    expect(rows.map((r) => r.textContent)).toEqual(
      CATEGORY_GROUPS.map((g) => en.map_category_chips[g]),
    );
    expect(rows.some((r) => /[֐-׿]/.test(r.textContent))).toBe(false);
  });

  it("/he shows the Hebrew group names", () => {
    const { rows } = renderLegend("he");
    expect(rows.map((r) => r.textContent)).toEqual(
      CATEGORY_GROUPS.map((g) => he.map_category_chips[g]),
    );
  });

  it("a row toggles its whole group; a group with no business in view is muted", () => {
    const { rows, toggleCategory } = renderLegend("en");
    const produce = rows.find((r) => r.dataset.group === "produce");
    fireEvent.click(produce);
    expect(toggleCategory).toHaveBeenCalledWith("produce");
    const pantry = rows.find((r) => r.dataset.group === "pantry");
    expect(pantry.className).toMatch(/opacity-60/);
    expect(produce.className).toMatch(/opacity-100/);
    expect(within(produce).getByText(en.map_category_chips.produce)).toBeTruthy();
  });
});
