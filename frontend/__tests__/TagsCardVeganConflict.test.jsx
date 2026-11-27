/**
 * MEH-3982 — the «טבעוני / צמחוני» questions say what the word means, and warn
 * (softly, never blocking the save) when «כן» contradicts the business's own
 * category. Matrix: categories (0 / 1 animal / many with 1 animal / plant only)
 * × answer (כן / לא).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import TagsCard from "@/app/[locale]/producer/dashboard/edit/TagsCard";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const D = he.dashboard.producer.dietaryScope;
const HONEY = { id: 1, slug: "honey", name: "דבש" };
const VEG = { id: 2, slug: "veg", name: "ירקות" };
const FISH = { id: 3, slug: "fish", name: "דגים" };

function renderCard(profile) {
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <TagsCard profile={profile} onSave={vi.fn()} reportDirty={() => {}} />
    </NextIntlClientProvider>,
  );
}
const radio = (name, label) =>
  screen.getAllByRole("radio", { name: label }).find((el) => el.getAttribute("name") === name);

beforeEach(() => {
  api.put.mockReset();
  api.put.mockResolvedValue({ data: {} });
});

describe("definitions (MEH-3982)", () => {
  it("shows what vegan and vegetarian mean, naming honey for vegan", () => {
    renderCard({ categories: [] });
    expect(screen.getByTestId("diet-definition-vegan").textContent).toBe(D.definition_vegan);
    expect(D.definition_vegan).toContain("דבש");
    expect(screen.getByTestId("diet-definition-vegetarian").textContent).toBe(D.definition_vegetarian);
  });
});

describe("conflict warning (MEH-3982)", () => {
  it.each([
    ["no categories, כן", [], "all", false],
    ["honey, כן", [HONEY], "all", true],
    ["honey, לא", [HONEY], "some", false],
    ["veg + honey, כן", [VEG, HONEY], "all", true],
    ["veg only, כן", [VEG], "all", false],
  ])("%s", (_label, categories, vegan_scope, shown) => {
    renderCard({ categories, vegan_scope });
    const warning = screen.queryByTestId("diet-conflict-vegan");
    expect(!!warning).toBe(shown);
    if (shown) expect(warning.textContent).toContain("דבש");
  });

  it("appears the moment the owner picks «כן», and disappears on «לא»", () => {
    renderCard({ categories: [HONEY] });
    expect(screen.queryByTestId("diet-conflict-vegan")).toBeNull();
    fireEvent.click(radio("vegan_scope", D.opt_yes));
    expect(screen.getByTestId("diet-conflict-vegan")).toBeTruthy();
    fireEvent.click(radio("vegan_scope", D.opt_no));
    expect(screen.queryByTestId("diet-conflict-vegan")).toBeNull();
  });

  it("is a warning only: the save still sends «כן»", async () => {
    renderCard({ categories: [HONEY] });
    fireEvent.click(radio("vegan_scope", D.opt_yes));
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/producers/me", { vegan_scope: "all" }));
  });

  it("vegetarian warns on fish, not on honey", () => {
    renderCard({ categories: [FISH, HONEY], vegetarian_scope: "all" });
    const w = screen.getByTestId("diet-conflict-vegetarian");
    expect(w.textContent).toContain("דגים");
    expect(w.textContent).not.toContain("דבש");
  });
});
