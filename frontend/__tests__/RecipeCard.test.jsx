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

  it("no image → a sand tile with one seed in the recipe's colour, no <img> (MEH-2833 → MEH-3006)", async () => {
    const { seedColorFor } = await import("@/lib/brand-seeds");
    render(
      <RecipeCard slug="my-shop" recipe={{ ...BASE, image_url: null }} />
    );
    expect(screen.queryByRole("img")).toBeNull();
    const tile = screen.getByTestId("recipe-image-missing");
    expect(tile.getAttribute("aria-hidden")).toBe("true");
    expect(tile.className).toMatch(/\bbg-background-alt\b/);
    const seed = tile.querySelector("svg[data-seed-color]");
    expect(seed.getAttribute("data-seed-color")).toBe(seedColorFor(BASE.id).fill);
    // the title is beside the tile, so it appears exactly once
    expect(screen.getAllByText(BASE.title)).toHaveLength(1);
  });

  // MEH-3006: a compact row (80px thumbnail), the same size for one recipe or
  // many — no longer an image-first card that fills a phone screen.
  it("is a compact row: an 80px thumbnail, not a full-width image", () => {
    render(<RecipeCard slug="my-shop" recipe={BASE} />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("sizes")).toBe("80px");
    expect(screen.getByTestId("recipe-row").className).toMatch(/\bflex\b/);
    expect(document.querySelector(".aspect-square")).toBeNull();
  });

  it("does not repeat the «מתכון» eyebrow under the section heading", () => {
    render(<RecipeCard slug="my-shop" recipe={BASE} />);
    expect(screen.queryByText("eyebrow")).toBeNull();
  });
});
