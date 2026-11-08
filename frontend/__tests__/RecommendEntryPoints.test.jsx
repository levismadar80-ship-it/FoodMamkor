import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

/**
 * MEH-2827 PR 4 — /recommend is reachable from more than the footer.
 *
 * Four entry points (search no-match, map city-zero, home empty, home after
 * the list) and the prefill they feed. next-intl reads the REAL he.json so
 * the link text is the approved label, not a key that would appear whether
 * or not a link rendered (same reasoning as HeroSearchNoResultsExit.test.jsx).
 */

vi.mock("next-intl", async () => {
  const he = (await import("../messages/he.json")).default;
  const lookup = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), he);
  const make = (ns) => {
    const fn = (key, vals) => {
      let s = lookup(ns ? `${ns}.${key}` : key) ?? (ns ? `${ns}.${key}` : key);
      if (typeof s === "string" && vals) for (const [k, v] of Object.entries(vals)) s = s.replace(`{${k}}`, v);
      return s;
    };
    fn.rich = fn;
    fn.raw = fn;
    return fn;
  };
  return { useTranslations: make, useLocale: () => "he" };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, prefetch, ...p }) => (
    <a href={typeof href === "string" ? href : href?.pathname} {...p}>{children}</a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/link", () => ({ default: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
vi.mock("framer-motion", () => ({
  motion: { div: ({ children, initial, whileInView, viewport, transition, ...p }) => <div {...p}>{children}</div> },
}));
vi.mock("@/components/ProducerCard", () => ({ default: () => <div data-testid="card" /> }));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => <div />, SkeletonStyles: () => null }));
vi.mock("@/components/SheetListSkeleton", () => ({ default: () => <div /> }));
vi.mock("@/components/ChipScrollRow", () => ({ default: () => null }));
vi.mock("@/components/CitySearch", () => ({
  default: ({ id, value, onChange }) => (
    <input data-testid="recommend-city-search" id={id} value={value} onChange={(e) => onChange(e.target.value, { known: true })} />
  ),
}));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn() } }));

import { FilterEmptyState } from "@/components/ProducersClient";
import MapBottomSheet from "@/components/MapBottomSheet";
import { HomeProducersGrid } from "@/app/[locale]/home/HomeProducersGrid";
import RecommendClient from "@/app/[locale]/recommend/RecommendClient";

const LABEL = "המליצו על בית עסק";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("search no-match (ProducersClient FilterEmptyState)", () => {
  it("a search that found nothing links to /recommend with the query as the name", () => {
    render(<FilterEmptyState onClear={() => {}} searchQ="גבינת עיזים" categories={[]} />);
    const link = screen.getByTestId("recommend-link-search");
    expect(link).toHaveTextContent(LABEL);
    expect(link.getAttribute("href")).toBe(`/recommend?name=${encodeURIComponent("גבינת עיזים")}`);
  });

  it("zero because of filters, not a search → no recommend link", () => {
    render(<FilterEmptyState onClear={() => {}} searchQ="" categories={[]} />);
    expect(screen.queryByTestId("recommend-link-search")).toBeNull();
  });
});

describe("map city-zero (MapBottomSheet peek row)", () => {
  const base = { snap: 50, onSnapChange: () => {}, children: <div /> };

  it("a town with no businesses links to /recommend with the town", () => {
    render(<MapBottomSheet {...base} count={6} zeroCity="בנימינה" />);
    expect(screen.getByTestId("sheet-city-zero")).toHaveTextContent("בנימינה");
    const link = screen.getByTestId("recommend-link-city-zero");
    expect(link).toHaveTextContent(LABEL);
    expect(link.getAttribute("href")).toBe(`/recommend?city=${encodeURIComponent("בנימינה")}`);
  });

  it("an ordinary count → no recommend link", () => {
    render(<MapBottomSheet {...base} count={6} />);
    expect(screen.queryByTestId("recommend-link-city-zero")).toBeNull();
  });
});

describe("home grid", () => {
  const baseProps = {
    producersLoading: false,
    visibleProducers: [],
    hasMore: false,
    visibleCount: 8,
    chips: {},
    categories: [],
    showNewUserHint: false,
    fridayMode: false,
    onChipNavigate: () => {},
    onLoadMore: () => {},
  };
  const noFilters = { category: "", delivery_city: "", has_delivery: false, delivery_days: [] };

  it("0 businesses, no city → /recommend; the after-list line is absent", () => {
    render(<HomeProducersGrid {...baseProps} producers={[]} filters={noFilters} />);
    const link = screen.getByTestId("recommend-link-home-empty");
    expect(link).toHaveTextContent(LABEL);
    expect(link.getAttribute("href")).toBe("/recommend");
    expect(screen.queryByTestId("home-recommend-line")).toBeNull();
  });

  it("0 businesses with a city filter → the city rides along", () => {
    render(<HomeProducersGrid {...baseProps} producers={[]} filters={{ ...noFilters, delivery_city: "חיפה" }} />);
    expect(screen.getByTestId("recommend-link-home-empty").getAttribute("href"))
      .toBe(`/recommend?city=${encodeURIComponent("חיפה")}`);
  });

  it("1 business → one quiet line after the list, and no empty-state link", () => {
    const one = [{ id: 1, name: "א" }];
    render(<HomeProducersGrid {...baseProps} producers={one} visibleProducers={one} filters={noFilters} />);
    const line = screen.getByTestId("home-recommend-line");
    expect(line).toHaveTextContent("מכירים בית עסק שצריך להיות כאן?");
    expect(line.tagName).toBe("P");
    const link = screen.getByTestId("recommend-link-home");
    expect(line.contains(link)).toBe(true);
    expect(link).toHaveTextContent(LABEL);
    expect(link.getAttribute("href")).toBe("/recommend");
    expect(screen.queryByTestId("recommend-link-home-empty")).toBeNull();
  });
});

describe("RecommendClient prefill from the query", () => {
  const nameField = () => document.getElementById("recommend-name");
  const cityField = () => screen.getByTestId("recommend-city-search");

  it("?name= and ?city= fill the two fields", async () => {
    window.history.replaceState({}, "", `/recommend?name=${encodeURIComponent("  מאפיית  השדה ")}&city=${encodeURIComponent("חיפה")}`);
    render(<RecommendClient />);
    await waitFor(() => expect(nameField().value).toBe("מאפיית השדה"));
    expect(cityField().value).toBe("חיפה");
  });

  it("markup and control characters are reduced to plain text, length capped", async () => {
    const long = "א".repeat(300);
    window.history.replaceState({}, "", `/recommend?name=${encodeURIComponent("<b>גבינה</b>\u0007")}&city=${encodeURIComponent(long)}`);
    render(<RecommendClient />);
    await waitFor(() => expect(nameField().value).toBe("b גבינה /b"));
    expect(cityField().value).toHaveLength(80);
  });

  it("a query that is nothing but markup reduces to an empty field, not «< >»", async () => {
    window.history.replaceState({}, "", `/recommend?name=${encodeURIComponent("<>\u0001")}&city=${encodeURIComponent("חיפה")}`);
    render(<RecommendClient />);
    await waitFor(() => expect(cityField().value).toBe("חיפה"));
    expect(nameField().value).toBe("");
  });

  it("no query → empty fields", () => {
    render(<RecommendClient />);
    expect(nameField().value).toBe("");
    expect(cityField().value).toBe("");
  });

  it("the subtitle is copy row 8, word for word", () => {
    render(<RecommendClient />);
    expect(screen.getByText("ספרו לנו עליו. אנחנו בודקות כל המלצה, פונות לבית העסק, ומצרפות רק בתי עסק שפועלים כדין.")).toBeInTheDocument();
  });
});
