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

  it("omits the time line entirely when no prep/cook time is set", () => {
    render(
      <RecipeCard
        slug="my-shop"
        recipe={{ ...BASE, prep_time_min: 0, cook_time_min: 0 }}
      />
    );
    expect(screen.queryByText(/דקות/)).toBeNull();
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
});
