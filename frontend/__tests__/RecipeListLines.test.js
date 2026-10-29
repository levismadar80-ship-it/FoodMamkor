// MEH-2540: owners type their own list markers («- 6 פרוסות», «1. קולים…»).
// The page adds list-disc / list-decimal and the JSON-LD lists each line, so a
// kept marker rendered «• – 6 פרוסות» and «1. 1. קולים» (staging, ruach-hasadeh).
import { describe, it, expect } from "vitest";
import { splitRecipeLines } from "@/lib/recipe-lines";
import { buildRecipeSchema } from "@/components/public/RecipeJsonLd";

describe("splitRecipeLines", () => {
  it("drops a typed bullet or dash", () => {
    expect(splitRecipeLines("- 6 פרוסות\n– שן שום\n• מלח\n* פלפל")).toEqual([
      "6 פרוסות",
      "שן שום",
      "מלח",
      "פלפל",
    ]);
  });

  it("drops a typed step number", () => {
    expect(splitRecipeLines("1. קולים\n2) משפשפים\n10. מגישים")).toEqual([
      "קולים",
      "משפשפים",
      "מגישים",
    ]);
  });

  it("keeps a leading quantity", () => {
    expect(splitRecipeLines("1/2 כוס סוכר\n2 כפות שמן\n1.5 ליטר מים\n-1 מעלות")).toEqual([
      "1/2 כוס סוכר",
      "2 כפות שמן",
      "1.5 ליטר מים",
      "-1 מעלות",
    ]);
  });

  it("drops blank lines and a line that was only a marker", () => {
    expect(splitRecipeLines("  \n- \nקמח\n\n")).toEqual(["קמח"]);
    expect(splitRecipeLines(null)).toEqual([]);
  });

  it("feeds the JSON-LD the same clean lines", () => {
    const s = buildRecipeSchema({
      recipe: { title: "ברוסקטה", ingredients: "- לחם", instructions: "1. קולים" },
      producerName: "מאפייה",
      canonicalUrl: "/x/recipes/1",
    });
    expect(s.recipeIngredient).toEqual(["לחם"]);
    expect(s.recipeInstructions[0].text).toBe("קולים");
  });
});
