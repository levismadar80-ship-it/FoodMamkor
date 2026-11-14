/**
 * MEH-3121 — the servings stepper on the recipe page.
 * Cells: no servings (no stepper) · servings set, untouched (no note, lines as
 * written) · changed (amounts follow, note shown) · back to the original (note
 * gone) · the 1 and 100 limits · lines with 0 / 1 / many leading amounts.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, fireEvent, within } from "@testing-library/react";
import RecipeDetail from "@/components/public/RecipeDetail";

vi.mock("@/i18n/navigation", () => ({ Link: ({ children, href }) => <a href={href}>{children}</a> }));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k, v) => `${ns}.${k}${v ? ` ${Object.values(v).join(" ")}` : ""}`,
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u, IMAGE_RATIOS: {} }));
vi.mock("@/components/PrimaryContactButton", () => ({ default: () => null }));
vi.mock("@/components/ImageWithFallback", () => ({ default: () => null }));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/components/ShareButton", () => ({ default: () => null }));

const base = {
  id: "r1",
  title: "עוגה",
  description: null,
  ingredients: "2 ביצים\n1/2 כוס סוכר\nמלח לפי הטעם",
  instructions: "מערבבים",
  prep_time_min: null,
  cook_time_min: null,
  servings: 4,
  image_url: null,
};
const mount = (extra = {}) =>
  render(<RecipeDetail recipe={{ ...base, ...extra }} producer={{ slug: "x", name: "x" }} relatedProducts={[]} />);
const lines = () => screen.getAllByRole("button", { pressed: false }).map((b) => b.textContent);
const less = () => screen.getByLabelText("recipes.detail.servings_less");
const more = () => screen.getByLabelText("recipes.detail.servings_more");

describe("recipe servings stepper", () => {
  it("a recipe with no servings has no stepper and no note", () => {
    mount({ servings: null });
    expect(screen.queryByTestId("servings-stepper")).toBeNull();
    expect(screen.queryByTestId("servings-note")).toBeNull();
    expect(lines()).toEqual(["2 ביצים", "1/2 כוס סוכר", "מלח לפי הטעם"]);
  });

  it("untouched: the recipe's own number, lines as written, no note", () => {
    mount();
    expect(screen.getByTestId("servings-value").textContent).toBe("4");
    expect(lines()).toEqual(["2 ביצים", "1/2 כוס סוכר", "מלח לפי הטעם"]);
    expect(screen.queryByTestId("servings-note")).toBeNull();
  });

  it("more servings: leading amounts follow, the line without a number stays, the note names the new number", () => {
    mount();
    fireEvent.click(more());
    fireEvent.click(more());
    expect(screen.getByTestId("servings-value").textContent).toBe("6");
    expect(lines()).toEqual(["3 ביצים", "¾ כוס סוכר", "מלח לפי הטעם"]);
    expect(screen.getByTestId("servings-note").textContent).toBe("recipes.detail.servings_note 6");
  });

  it("back to the recipe's number: the lines are the owner's own text again and the note goes", () => {
    mount();
    fireEvent.click(less());
    expect(lines()[0]).toBe("1½ ביצים");
    fireEvent.click(more());
    expect(lines()).toEqual(["2 ביצים", "1/2 כוס סוכר", "מלח לפי הטעם"]);
    expect(screen.queryByTestId("servings-note")).toBeNull();
  });

  it("a crossed-off line stays crossed off when the number changes", () => {
    mount();
    fireEvent.click(screen.getByText("2 ביצים"));
    fireEvent.click(more());
    expect(screen.getByRole("button", { pressed: true }).textContent).toBe("2½ ביצים");
  });

  it("stops at 1 and at 100", () => {
    const first = mount({ servings: 1 });
    expect(less().disabled).toBe(true);
    expect(more().disabled).toBe(false);
    first.unmount();
    mount({ servings: 100 });
    expect(more().disabled).toBe(true);
    expect(less().disabled).toBe(false);
  });

  it("no line starts with an amount: the stepper still works, nothing moves", () => {
    mount({ ingredients: "מלח\nפלפל" });
    fireEvent.click(more());
    expect(lines()).toEqual(["מלח", "פלפל"]);
    expect(within(screen.getByTestId("servings-stepper")).getByTestId("servings-value").textContent).toBe("5");
  });
});

describe("approved copy (Sapir 14/11)", () => {
  const he = JSON.parse(readFileSync("messages/he.json", "utf8")).recipes.detail;
  it("matches the card's table word for word", () => {
    expect(he.servings_stepper_label).toBe("מנות");
    expect(he.servings_less).toBe("פחות מנות");
    expect(he.servings_more).toBe("יותר מנות");
    expect(he.servings_note).toBe("הכמויות חושבו ל-{n} מנות. שורה בלי מספר נשארת כמו שנכתבה.");
  });
});
