import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
    // 30 + 35 = 65 → "65 דקות · 8 מנות"
    expect(screen.getByText(/65 דקות · 8 מנות/)).toBeInTheDocument();
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

  it("uses the placeholder emoji when image_url is missing", () => {
    render(
      <RecipeCard slug="my-shop" recipe={{ ...BASE, image_url: null }} />
    );
    // No <img> rendered; emoji span is aria-hidden so we look for it by text.
    expect(screen.getByText("🍞")).toBeInTheDocument();
  });
});
