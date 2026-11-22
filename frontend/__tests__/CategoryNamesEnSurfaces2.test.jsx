import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import he from "@/messages/he.json";

// MEH-3076: every public surface that prints a category name shows the
// locale's name on /en and the unchanged DB name on /he. One render per
// surface with the real messages (reviewer finding: the wiring was untested).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, prefetch: _p, ...rest }) => <a href={String(href)} {...rest}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("next/link", () => ({ default: ({ children, href, prefetch: _p, ...rest }) => <a href={String(href)} {...rest}>{children}</a> }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }) => <img alt={alt} src={typeof src === "string" ? src : ""} />,
}));
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: () => ({ children, initial: _i, animate: _a, whileInView: _w, viewport: _v, transition: _t, exit: _e, ...p }) => <div {...p}>{children}</div> }),
  AnimatePresence: ({ children }) => <>{children}</>,
  useReducedMotion: () => true,
}));
vi.mock("@/components/FadeInSection", () => ({ default: ({ children }) => <div>{children}</div>, REVEAL_PRESET: {} }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, loading: false }) }));

import { buildTitle, buildDescription } from "@/lib/seo";
import { HomeFeaturedProducer } from "@/app/[locale]/home/HomeStaticBlocks";
import CategorySelector from "@/components/CategorySelector";
import MapProducerCard from "@/components/MapProducerCard";

const BREAD = { id: 7, name: "לחמים ואפייה", slug: "bread" };
const wrap = (locale, ui) => (
  <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : he} timeZone="Asia/Jerusalem">
    {ui}
  </NextIntlClientProvider>
);

describe("business page <title> and description (lib/seo)", () => {
  const p = { name: "מאפיית בדיקה", city: "חיפה", categories: [BREAD] };
  it("/en uses the English category name", () => {
    expect(buildTitle(p, "en")).toContain("Bread & Baking");
    expect(buildTitle(p, "en")).not.toContain("לחמים ואפייה");
    expect(buildDescription(p, "en")).toContain("Bread & Baking");
  });
  it("/he keeps the DB name", () => {
    expect(buildTitle(p, "he")).toContain("לחמים ואפייה");
    expect(buildDescription(p, "he")).toContain("לחמים ואפייה");
  });
  it("an unknown slug falls back to the DB name", () => {
    const q = { ...p, categories: [{ id: 9, name: "חדשה", slug: "brand-new" }] };
    expect(buildTitle(q, "en")).toContain("חדשה");
  });
});

describe("home featured business", () => {
  const featured = { name: "מאפיית בדיקה", city: "חיפה", category: BREAD.name, categorySlug: "bread", quote: "שורה" };
  it("/en", () => {
    render(wrap("en", <HomeFeaturedProducer featured={featured} />));
    expect(screen.getByTestId("home-featured").textContent).toContain("Bread & Baking");
  });
  it("/he", () => {
    render(wrap("he", <HomeFeaturedProducer featured={featured} />));
    expect(screen.getByTestId("home-featured").textContent).toContain("לחמים ואפייה");
  });
});

describe("category selector (register / edit)", () => {
  const props = { categories: [BREAD], selectedIds: [], onChange: () => {}, onRequestCategory: () => {} };
  it("/en", () => {
    render(wrap("en", <CategorySelector {...props} />));
    expect(screen.getAllByText("Bread & Baking").length).toBeGreaterThan(0);
    expect(screen.queryByText("לחמים ואפייה")).toBeNull();
  });
  it("/he", () => {
    render(wrap("he", <CategorySelector {...props} />));
    expect(screen.getAllByText("לחמים ואפייה").length).toBeGreaterThan(0);
  });
});

describe("map business card", () => {
  const producer = { id: "p1", name: "מאפיית בדיקה", slug: "biz", images: [], categories: [BREAD], lat: 32.8, lng: 35 };
  it("/en", () => {
    render(wrap("en", <MapProducerCard producer={producer} />));
    expect(screen.getByText("Bread & Baking")).toBeTruthy();
  });
  it("/he", () => {
    render(wrap("he", <MapProducerCard producer={producer} />));
    expect(screen.getByText("לחמים ואפייה")).toBeTruthy();
  });
});

describe("business card (ProducerCard)", async () => {
  const { default: ProducerCard } = await import("@/components/ProducerCard");
  const producer = { id: "11111111-1111-4111-8111-111111111111", name: "מאפיית בדיקה", slug: "biz", images: [], categories: [BREAD], city: "חיפה" };
  it("/en", () => {
    render(wrap("en", <ProducerCard producer={producer} />));
    expect(screen.getAllByText(/Bread & Baking/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/לחמים ואפייה/)).toBeNull();
  });
  it("/he", () => {
    render(wrap("he", <ProducerCard producer={producer} />));
    expect(screen.getAllByText(/לחמים ואפייה/).length).toBeGreaterThan(0);
  });
});
