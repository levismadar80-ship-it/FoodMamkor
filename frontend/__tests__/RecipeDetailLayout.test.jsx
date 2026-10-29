/**
 * MEH-2543 — recipe page layout (NYT Cooking / BBC Good Food shape).
 * Cells: photo / no photo / photo that fails to load · facts 0 / 1 / 2 / 3 ·
 * ingredients 0 / many (cross-off toggles) · the business row links home.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RecipeDetail from "@/components/public/RecipeDetail";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k, v) => `${ns}.${k}${v ? ` ${Object.values(v).join(" ")}` : ""}`,
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt, onError }) => <img src={src} alt={alt} onError={onError} />,
}));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u, IMAGE_RATIOS: {} }));
vi.mock("@/components/PrimaryContactButton", () => ({ default: () => null }));
vi.mock("@/components/ImageWithFallback", () => ({ default: () => null }));

const producer = { slug: "ruach-hasadeh", name: "מאפיית רוח השדה" };
const base = {
  id: "r1",
  title: "ברוסקטה",
  description: null,
  ingredients: "- לחם\n- עגבניות",
  instructions: "1. קולים\n2. מגישים",
  prep_time_min: null,
  cook_time_min: null,
  servings: null,
  image_url: null,
};
const renderRecipe = (extra = {}) =>
  render(<RecipeDetail recipe={{ ...base, ...extra }} producer={producer} relatedProducts={[]} />);

describe("RecipeDetail hero", () => {
  it("shows the photo when there is one", () => {
    renderRecipe({ image_url: "https://res.cloudinary.com/x.jpg" });
    expect(screen.getByAltText("ברוסקטה")).toBeTruthy();
    expect(screen.queryByTestId("recipe-hero-missing")).toBeNull();
  });
  it("shows the low strip with no photo", () => {
    renderRecipe();
    expect(screen.getByTestId("recipe-hero-missing")).toBeTruthy();
  });
  it("falls back to the strip when the photo fails to load", () => {
    renderRecipe({ image_url: "https://res.cloudinary.com/broken.jpg" });
    fireEvent.error(screen.getByAltText("ברוסקטה"));
    expect(screen.getByTestId("recipe-hero-missing")).toBeTruthy();
    expect(screen.queryByAltText("ברוסקטה")).toBeNull();
  });
});

describe("RecipeDetail eyebrow", () => {
  it("reads the eyebrow from the locale, so /en is not Hebrew", () => {
    renderRecipe();
    expect(screen.getByText("recipes.detail.eyebrow")).toBeTruthy();
  });
});

describe("RecipeDetail facts", () => {
  it("renders no tile row when nothing is set", () => {
    renderRecipe();
    expect(screen.queryByTestId("recipe-facts")).toBeNull();
  });
  it("renders one tile in one column", () => {
    renderRecipe({ servings: 6 });
    const row = screen.getByTestId("recipe-facts");
    expect(row.children).toHaveLength(1);
    expect(row.className).toContain("grid-cols-1");
  });
  it("renders two tiles in two columns", () => {
    renderRecipe({ prep_time_min: 10, servings: 6 });
    const row = screen.getByTestId("recipe-facts");
    expect(row.children).toHaveLength(2);
    expect(row.className).toContain("grid-cols-2");
  });
  it("renders three tiles in three columns", () => {
    renderRecipe({ prep_time_min: 10, cook_time_min: 5, servings: 6 });
    const row = screen.getByTestId("recipe-facts");
    expect(row.children).toHaveLength(3);
    expect(row.className).toContain("grid-cols-3");
  });
});

describe("RecipeDetail ingredients", () => {
  it("toggles an ingredient crossed off and back", () => {
    renderRecipe();
    const btn = screen.getByRole("button", { name: "לחם" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "עגבניות" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });
  it("hides the ingredients section when there are none", () => {
    renderRecipe({ ingredients: "" });
    expect(screen.queryByText("recipes.detail.ingredients_heading")).toBeNull();
    expect(screen.getByText("recipes.detail.instructions_heading")).toBeTruthy();
  });
});

describe("RecipeDetail business row", () => {
  it("links the business name to its page, under the title", () => {
    renderRecipe();
    const row = screen.getByTestId("recipe-owner-row");
    expect(row.getAttribute("href")).toBe("/ruach-hasadeh");
    expect(row.textContent).toContain("מאפיית רוח השדה");
  });
});
