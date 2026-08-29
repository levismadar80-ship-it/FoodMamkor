import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-475 PR-C1: mock next-intl per Wave 3 precedent (ProducerCard.test.jsx).
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      minutes_suffix: "דקות",
      servings_suffix: "מנות",
    };
    return flat[key] ?? key;
  },
}));

import RecipeCard from "@/components/public/RecipeCard";

const BASE = {
  id: "abc-123",
  title: "חלת מחמצת",
  image_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
  prep_time_min: 30,
  cook_time_min: 35,
  servings: 8,
};

describe("RecipeCard", () => {
  it("renders the title and links to the recipe URL with the slug", () => {
    render(<RecipeCard slug="my-shop" recipe={BASE} />);
    expect(screen.getByText("חלת מחמצת")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/my-shop/recipes/abc-123");
  });

  it("shows total minutes + servings when both are present", () => {
    render(<RecipeCard slug="my-shop" recipe={BASE} />);
    // MEH-911: meta strip is now two icon-prefixed spans (Phosphor Clock +
    // Users), not one " · "-joined line. 30 + 35 = 65.
    expect(screen.getByText(/65 דקות/)).toBeInTheDocument();
    expect(screen.getByText(/8 מנות/)).toBeInTheDocument();
  });

  it("omits the minutes span but keeps servings when no prep/cook time is set", () => {
    render(
      <RecipeCard
        slug="my-shop"
        recipe={{ ...BASE, prep_time_min: 0, cook_time_min: 0 }}
      />
    );
    // MEH-911: time + servings render independently — no time hides only the
    // Clock/minutes span; the Users/servings span stays when servings is set.
    expect(screen.queryByText(/דקות/)).toBeNull();
    expect(screen.getByText(/8 מנות/)).toBeInTheDocument();
  });

  it("omits the whole meta strip when neither time nor servings is set", () => {
    render(
      <RecipeCard
        slug="my-shop"
        recipe={{ ...BASE, prep_time_min: 0, cook_time_min: 0, servings: null }}
      />
    );
    expect(screen.queryByText(/דקות/)).toBeNull();
    expect(screen.queryByText(/מנות/)).toBeNull();
  });

  it("shows the Leaf + brand-name placeholder when image_url is missing", () => {
    render(
      <RecipeCard slug="my-shop" recipe={{ ...BASE, image_url: null }} />
    );
    // MEH-911: no <img>; Assembly v2 no-image state = Phosphor Leaf glyph +
    // "מהמקור" brand name (replaces the 🍞 emoji, Emoji LOCK MEH-657).
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("recipe-image-missing")).toBeInTheDocument();
    expect(screen.getByText("מהמקור")).toBeInTheDocument();
  });

  // MEH-2190. This card renders in exactly one place — ProducerSections.jsx:487,
  // `grid grid-cols-2 md:grid-cols-3 gap-4`, inside ProducerDetail's
  // `max-w-6xl px-4` (:107) and its `lg:grid-cols-[1fr_320px] gap-8` (:226).
  // The grid is NEVER 1-column, so the old `(max-width: 640px) 100vw` claimed
  // roughly twice the real cell on mobile.
  //
  // Asserted per clause rather than as one string: a single `toBe` on the whole
  // attribute goes red for a stray space too, and its failure message would not
  // say WHICH range regressed.
  describe("MEH-2190: sizes matches the measured grid", () => {
    const sizesOf = () => {
      render(<RecipeCard slug="my-shop" recipe={BASE} />);
      return screen.getByRole("img").getAttribute("sizes");
    };

    // The regression itself. `100vw` is false at every width this card renders
    // at, and it is what the corrected attribute must not contain.
    it("never claims a full-viewport cell", () => {
      expect(sizesOf()).not.toMatch(/100vw/);
    });

    it.each([
      // range                    clause                       cell arithmetic
      ["2-col, W < 768", "(max-width: 767px) calc(50vw - 24px)", "(W - 32 - 16)/2"],
      ["3-col, 768..1023", "(max-width: 1023px) calc(33.33vw - 21.33px)", "(W - 32 - 32)/3"],
      ["3-col + lg sidebar, 1024..1151", "(max-width: 1151px) calc(33.33vw - 138.67px)", "(W - 384 - 32)/3"],
      ["3-col at the max-w-6xl cap", "246px", "(768 - 32)/3 = 245.33"],
    ])("carries the %s clause", (_range, clause) => {
      expect(sizesOf()).toContain(clause);
    });
  });
});
