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
// MEH-2558: the hero actions have their own tests (SaveButton.test.jsx,
// ShareButton.test.jsx); here they only need to render as markers.
vi.mock("@/components/SaveButton", () => ({
  default: ({ itemType, itemId }) => <button data-testid={`save-${itemType}`} data-id={itemId} />,
}));
vi.mock("@/components/ShareButton", () => ({
  default: ({ subject }) => <button data-testid={`share-${subject}`} />,
}));

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
  // MEH-2844 (Sapir 08/11): the strip carries the recipe card's seed (same
  // Seed, same props, the recipe's own colour) instead of the old Leaf, in
  // the start-top corner, opposite the share/save pair. Height unchanged.
  it("the no-photo strip carries the recipe's seed, not the Leaf", async () => {
    const { seedColorFor } = await import("@/lib/brand-seeds");
    renderRecipe();
    const strip = screen.getByTestId("recipe-hero-missing");
    const svgs = strip.querySelectorAll("svg");
    expect(svgs).toHaveLength(1); // the seed and nothing else (the Leaf was an svg too)
    const seed = svgs[0];
    expect(seed.getAttribute("data-seed-color")).toBe(seedColorFor("r1").fill);
    expect(seed.getAttribute("width")).toBe("70");
    expect(seed.querySelector("g").getAttribute("transform")).toMatch(/^rotate\(-36 /);
    const cls = seed.getAttribute("class").split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(["-start-[30px]", "rtl:-scale-x-100"]));
    expect(cls.filter((c) => /(^|:)-?end-/.test(c))).toEqual([]);
    expect(strip.className).toMatch(/\bh-24\b/);
    expect(strip.className).toMatch(/\bmd:h-28\b/);
    expect(strip.className).toMatch(/\boverflow-hidden\b/);
    // the actions it must stay clear of are at the END corner
    expect(screen.getByTestId("recipe-hero-actions").className).toMatch(/\bend-3\b/);
  });
  it("falls back to the strip when the photo fails to load", () => {
    renderRecipe({ image_url: "https://res.cloudinary.com/broken.jpg" });
    fireEvent.error(screen.getByAltText("ברוסקטה"));
    expect(screen.getByTestId("recipe-hero-missing")).toBeTruthy();
    expect(screen.queryByAltText("ברוסקטה")).toBeNull();
  });
});

describe("RecipeDetail hero actions (MEH-2558)", () => {
  it("puts share + save for this recipe in the photo's corner", () => {
    renderRecipe({ image_url: "https://res.cloudinary.com/x.jpg" });
    const actions = screen.getByTestId("recipe-hero-actions");
    expect(actions.querySelector('[data-testid="share-recipe"]')).toBeTruthy();
    expect(actions.querySelector('[data-testid="save-recipe"][data-id="r1"]')).toBeTruthy();
    // MEH-2671: the inline-END corner (top-left in RTL), heart first.
    expect(actions.className).toMatch(/\bend-3\b/);
    expect(actions.className).not.toMatch(/\bstart-3\b/);
    expect(actions.firstElementChild.getAttribute("data-testid")).toBe("save-recipe");
  });
  it("keeps them on the no-photo strip", () => {
    renderRecipe();
    expect(screen.getByTestId("recipe-hero-missing")).toBeTruthy();
    expect(screen.getByTestId("save-recipe").getAttribute("data-id")).toBe("r1");
    expect(screen.getByTestId("share-recipe")).toBeTruthy();
  });
});

describe("RecipeDetail eyebrow", () => {
  it("reads the eyebrow from the locale, so /en is not Hebrew", () => {
    renderRecipe();
    expect(screen.getByText("recipes.detail.eyebrow")).toBeTruthy();
  });
});

describe("RecipeDetail byline", () => {
  it("labels the business row «מאת» above the name", () => {
    renderRecipe();
    const row = screen.getByTestId("recipe-owner-row");
    expect(row.textContent).toContain("recipes.detail.by_label");
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

// MEH-2654 (Sapir 31/10): «המוצרים שלנו במתכון» rows were dead <li>s and read
// only the legacy price_range, so a product priced via price_min had no price.
describe("RecipeDetail related products (MEH-2654)", () => {
  const withProducts = (products) =>
    render(<RecipeDetail recipe={base} producer={producer} relatedProducts={products} />);

  it("renders no products section when there are none", () => {
    withProducts([]);
    expect(screen.queryAllByTestId("recipe-product-link")).toHaveLength(0);
  });

  it("one product: links to its sheet on the business page and shows the numeric price", () => {
    withProducts([{ id: "p-1", name: "לחם מחמצת", price_min: 32, price_max: null }]);
    const links = screen.getAllByTestId("recipe-product-link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/ruach-hasadeh?product=p-1");
    expect(links[0].textContent).toContain("32₪");
  });

  it("many products: each row links to its own product; legacy price_range still shows", () => {
    withProducts([
      { id: "p-1", name: "לחם", price_min: 38, price_max: 45 },
      { id: "p-2", name: "גבינה", price_min: null, price_range: "מ-40₪ למארז" },
      { id: "p-3", name: "עוגיות", price_min: null },
    ]);
    const hrefs = screen.getAllByTestId("recipe-product-link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/ruach-hasadeh?product=p-1",
      "/ruach-hasadeh?product=p-2",
      "/ruach-hasadeh?product=p-3",
    ]);
    expect(screen.getByText("38₪–45₪")).toBeTruthy();
    expect(screen.getByText("מ-40₪ למארז")).toBeTruthy();
  });
});
