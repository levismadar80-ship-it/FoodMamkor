import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import he from "@/messages/he.json";

// MEH-3076 (Sapir 21/11): on /en a category reads in English wherever a
// visitor sees it; /he keeps the DB name. The slug picks the name.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/producers",
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, prefetch: _p, ...rest }) => <a href={String(href)} {...rest}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/producers",
}));

import { FilterEmptyState } from "@/components/ProducersClient";

const CATS = [
  { id: 1, name: "לחמים ואפייה", slug: "bread" },
  { id: 2, name: "קטגוריה חדשה", slug: "brand-new" },
];
const renderIn = (locale, messages) =>
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <FilterEmptyState onClear={() => {}} onPickCategory={() => {}} searchQ="x" categories={CATS} />
    </NextIntlClientProvider>,
  );

describe("search-empty category chips — names per locale (MEH-3076)", () => {
  it("/en shows the English name, and the DB name for a category with no entry", () => {
    renderIn("en", en);
    const chips = screen.getAllByTestId("producers-empty-category").map((b) => b.textContent);
    expect(chips).toEqual(["Bread & Baking", "קטגוריה חדשה"]);
  });

  it("/he shows the DB names", () => {
    renderIn("he", he);
    const chips = screen.getAllByTestId("producers-empty-category").map((b) => b.textContent);
    expect(chips).toEqual(["לחמים ואפייה", "קטגוריה חדשה"]);
  });
});
