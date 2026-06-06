import { describe, it, expect } from "vitest";
import { buildRecipeSchema } from "@/components/public/RecipeJsonLd";

const RECIPE = {
  title: "חלת מחמצת",
  description: "מתכון פשוט לחלה",
  image_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
  ingredients: "500 גרם קמח\n10 גרם מלח\n350 מל מים",
  instructions: "ערבבי הכל\nלושי 10 דקות\nאפי 35 דקות ב-220",
  prep_time_min: 30,
  cook_time_min: 35,
  servings: 8,
};

describe("buildRecipeSchema (schema.org/Recipe JSON-LD)", () => {
  it("emits the @type and basic identity fields", () => {
    const s = buildRecipeSchema({
      recipe: RECIPE,
      producerName: "חוות הניסוי",
      canonicalUrl: "/test-slug/recipes/abc",
    });
    expect(s["@context"]).toBe("https://schema.org");
    expect(s["@type"]).toBe("Recipe");
    expect(s.name).toBe("חלת מחמצת");
    expect(s.url).toBe("/test-slug/recipes/abc");
    expect(s.inLanguage).toBe("he-IL");
  });

  it("splits ingredients by newline into recipeIngredient[]", () => {
    const s = buildRecipeSchema({ recipe: RECIPE });
    expect(s.recipeIngredient).toEqual([
      "500 גרם קמח",
      "10 גרם מלח",
      "350 מל מים",
    ]);
  });

  it("splits instructions into HowToStep[] objects", () => {
    const s = buildRecipeSchema({ recipe: RECIPE });
    expect(s.recipeInstructions).toHaveLength(3);
    expect(s.recipeInstructions[0]).toEqual({
      "@type": "HowToStep",
      text: "ערבבי הכל",
    });
  });

  it("emits ISO 8601 durations for prep/cook time", () => {
    const s = buildRecipeSchema({ recipe: RECIPE });
    expect(s.prepTime).toBe("PT30M");
    expect(s.cookTime).toBe("PT35M");
  });

  it("emits PT1H30M for 90 minutes", () => {
    const s = buildRecipeSchema({
      recipe: { ...RECIPE, prep_time_min: 90 },
    });
    expect(s.prepTime).toBe("PT1H30M");
  });

  // MEH-741: buildRecipeSchema now omits prep/cook duration keys (returns
  // undefined, not null) when minutes are 0 / missing / out-of-range, so
  // `"prepTime": null` no longer leaks into the JSON-LD. Un-skipped here.
  it("omits prep/cook duration when minutes are 0 or missing", () => {
    const s = buildRecipeSchema({
      recipe: { ...RECIPE, prep_time_min: null, cook_time_min: 0 },
    });
    expect(s.prepTime).toBeUndefined();
    expect(s.cookTime).toBeUndefined();
  });

  it("emits recipeYield as a string", () => {
    const s = buildRecipeSchema({ recipe: RECIPE });
    expect(s.recipeYield).toBe("8");
  });

  it("emits author as an Organization when producerName is given", () => {
    const s = buildRecipeSchema({
      recipe: RECIPE,
      producerName: "חוות הניסוי",
    });
    expect(s.author).toEqual({
      "@type": "Organization",
      name: "חוות הניסוי",
    });
  });

  // MEH-741: fixed alongside the test above — the final object no longer
  // carries a null-valued `prepTime`, so `"prepTime" in s` is now false.
  it("strips undefined fields from the final object", () => {
    const minimal = {
      title: "t",
      ingredients: "x",
      instructions: "y",
    };
    const s = buildRecipeSchema({ recipe: minimal });
    // No `image`, `description`, `prepTime`, etc. keys at all.
    expect("image" in s).toBe(false);
    expect("description" in s).toBe(false);
    expect("prepTime" in s).toBe(false);
    expect("author" in s).toBe(false);
  });
});
