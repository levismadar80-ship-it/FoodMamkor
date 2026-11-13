import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { HomeCategoryGrid } from "@/app/[locale]/home/HomeCategoryGrid";
import { CATEGORY_CARDS } from "@/lib/home-categories";

// MEH-3061: on desktop the ten categories used to be a 2-hero + 8 grid that
// pushed the first business ~2,100px down at 1440. The approved layout is the
// phone's card row on every width: all ten cards the same size, one row of ten
// from lg, 5×2 on tablet. This pins the class contract of the rail and cards.

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("@/components/FadeInSection", () => ({ default: ({ children }) => <div>{children}</div> }));

beforeEach(() => {
  global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
});

const renderRail = () => {
  const cards = CATEGORY_CARDS.map((c, i) => ({ ...c, categoryId: i + 1 }));
  const { getByTestId, getAllByTestId } = render(<HomeCategoryGrid categoryCards={cards} />);
  return { rail: getByTestId("home-category-rail"), frames: getAllByTestId("home-category-image-frame") };
};

describe("home categories — one row on desktop (MEH-3061)", () => {
  it("the rail is ten columns from lg and five from md", () => {
    const cls = renderRail().rail.className.split(/\s+/);
    expect(cls).toContain("lg:grid-cols-10");
    expect(cls).toContain("md:grid-cols-5");
    expect(cls).not.toContain("lg:grid-cols-4");
  });

  it("no card spans two columns — the two hero cards are gone", () => {
    const { rail } = renderRail();
    const wrappers = [...rail.children];
    expect(wrappers).toHaveLength(10);
    for (const w of wrappers) expect(w.className).not.toMatch(/col-span-2/);
  });

  it("cards carry no frame — the photo is a rounded square, not a circle", () => {
    const cards = CATEGORY_CARDS.map((c, i) => ({ ...c, categoryId: i + 1 }));
    const { getAllByTestId } = render(<HomeCategoryGrid categoryCards={cards} />);
    for (const c of getAllByTestId("home-category-card")) {
      expect(c.className).not.toMatch(/(^|\s)border(\s|$)/);
      expect(c.className).not.toMatch(/bg-surface-card/);
    }
    for (const f of getAllByTestId("home-category-image-frame")) {
      expect(f.className).toMatch(/(^|\s)rounded-md(\s|$)/);
      expect(f.className).not.toMatch(/rounded-full/);
    }
  });

  it("every image frame is square at every width", () => {
    const { frames } = renderRail();
    expect(frames).toHaveLength(10);
    for (const f of frames) {
      expect(f.className).toMatch(/(^|\s)aspect-square(\s|$)/);
      expect(f.className).not.toMatch(/(md|lg):aspect-\[/);
    }
  });
});
