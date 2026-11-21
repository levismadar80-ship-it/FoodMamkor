import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { HomeCategoryGrid } from "@/app/[locale]/home/HomeCategoryGrid";
import { CATEGORY_CARDS } from "@/lib/home-categories";
import en from "@/messages/en.json";
import he from "@/messages/he.json";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { categoryLabel } from "@/lib/category-label";

// MEH-3076 (Sapir 21/11): /en shows the home category tiles in English; the
// Hebrew page shows the same names as before; the DB name stays the match key.
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, initial, whileInView, viewport, transition, ...p }) => <div {...p}>{children}</div>,
  },
}));
vi.mock("@/components/FadeInSection", () => ({ default: ({ children }) => <div>{children}</div> }));

const cards = CATEGORY_CARDS.map((c, i) => ({ ...c, categoryId: i + 1 }));
const renderIn = (locale, messages) =>
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HomeCategoryGrid categoryCards={cards} />
    </NextIntlClientProvider>,
  );

describe("home category tiles — names per locale (MEH-3076)", () => {
  it("/en shows the approved English names, not the Hebrew DB names", () => {
    renderIn("en", en);
    expect(screen.getByRole("heading", { level: 3, name: "Vegetables" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Wine, Beer & Drinks" })).toBeTruthy();
    expect(screen.queryByText("ירקות")).toBeNull();
    expect(screen.getByRole("link", { name: "Show category: Bread & Baking" })).toBeTruthy();
  });

  it("every card has a name in both locales", () => {
    for (const card of CATEGORY_CARDS) {
      expect(en.category_names[card.slug], card.key).toBeTruthy();
      expect(he.category_names[card.slug]).toBe(card.name);
    }
  });

  // Source text on purpose: nothing in JS runs the backend's slug table, and it
  // is the one list every category on the site is keyed by.
  it("every backend category slug has a name in both locales, and he = the DB name", () => {
    const py = readFileSync(resolve(__dirname, "../../backend/app/services/category_slug.py"), "utf8");
    const block = py.slice(py.indexOf("NAME_TO_SLUG = {"), py.indexOf("}", py.indexOf("NAME_TO_SLUG = {")));
    const pairs = [...block.matchAll(/"([^"]+)":\s*"([a-z]+)"/g)].map((m) => [m[1], m[2]]);
    expect(pairs.length).toBe(18);
    for (const [name, slug] of pairs) {
      expect(en.category_names[slug], slug).toBeTruthy();
      expect(en.category_names[slug]).not.toMatch(/[\u0590-\u05FF]/);
      expect(he.category_names[slug], slug).toBe(name);
    }
    expect(Object.keys(en.category_names).sort()).toEqual(pairs.map((p) => p[1]).sort());
  });

  it("categoryLabel falls back to the DB name when the slug is missing or unknown", () => {
    const t = Object.assign((k) => `T:${k}`, { has: (k) => k === "category_names.veg" });
    expect(categoryLabel(t, { name: "ירקות", slug: "veg" })).toBe("T:category_names.veg");
    expect(categoryLabel(t, { name: "חדש", slug: "new-one" })).toBe("חדש");
    expect(categoryLabel(t, { name: "בלי", slug: null })).toBe("בלי");
  });

  it("/he shows the same Hebrew names as before", () => {
    renderIn("he", he);
    expect(screen.getByRole("heading", { level: 3, name: "ירקות" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "יין, בירה ומשקאות" })).toBeTruthy();
  });
});
