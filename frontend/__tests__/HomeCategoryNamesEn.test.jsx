import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { HomeCategoryGrid } from "@/app/[locale]/home/HomeCategoryGrid";
import { CATEGORY_CARDS } from "@/lib/home-categories";
import en from "@/messages/en.json";
import he from "@/messages/he.json";

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
      expect(en.home.categories.names[card.key], card.key).toBeTruthy();
      expect(he.home.categories.names[card.key]).toBe(card.name);
    }
  });

  it("/he shows the same Hebrew names as before", () => {
    renderIn("he", he);
    expect(screen.getByRole("heading", { level: 3, name: "ירקות" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "יין, בירה ומשקאות" })).toBeTruthy();
  });
});
