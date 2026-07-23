import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomeCategoryGrid } from "@/app/[locale]/home/HomeCategoryGrid";
import { CATEGORY_CARDS, matchCategoryId } from "@/lib/home-categories";

// MEH-1080 [T-A] (MEH-1077 DISC-01+03): homepage category cards become real
// <Link>s to /producers?category=<id>, 1:1 card↔DB-category (Sapir-locked
// 10-card set). These tests pin: anchor-with-href per resolved card, the
// unresolved-id placeholder (no dead link), and the exact-name matcher that
// structurally kills the old first-match bug.

vi.mock("next-intl", () => ({ useTranslations: () => (k, v) => (v?.name ? `${k}:${v.name}` : k) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, initial, whileInView, viewport, transition, ...p }) => (
      <div {...p}>{children}</div>
    ),
  },
}));
vi.mock("@/components/FadeInSection", () => ({ default: ({ children }) => <div>{children}</div> }));

const DB_CATEGORIES = [
  { id: 1, name: "בשר" },
  { id: 2, name: "דגים" },
  { id: 3, name: "חלב וגבינות" },
  { id: 5, name: "לחמים ואפייה" },
  { id: 6, name: "שמנים" },
  { id: 7, name: "ירקות" },
  { id: 8, name: "פירות" },
  { id: 12, name: "סבונים טבעיים" },
  // MEH-1104 (contract phase): production rename confirmed; the fixture tracks
  // the post-rename DB state — the "cream" card resolves on the new value only.
  { id: 13, name: "קוסמטיקה טבעית" },
  { id: 15, name: "יין, בירה ומשקאות" },
];

describe("homepage category cards → links (MEH-1080)", () => {
  it("every resolved card renders as a real anchor to /producers?category=<id>", () => {
    const cards = matchCategoryId(CATEGORY_CARDS, DB_CATEGORIES);
    render(<HomeCategoryGrid categoryCards={cards} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(10);
    const meat = links.find((a) => a.textContent.includes("בשר"));
    expect(meat).toHaveAttribute("href", "/producers?category=1");
    const fish = links.find((a) => a.textContent.includes("דגים"));
    expect(fish).toHaveAttribute("href", "/producers?category=2");
  });

  it("a card whose category id is unresolved renders without a link (no dead href)", () => {
    const cards = matchCategoryId(CATEGORY_CARDS, DB_CATEGORIES.slice(0, 3));
    render(<HomeCategoryGrid categoryCards={cards} />);
    // only the 3 resolvable cards become anchors; the rest render as inert cards
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByText("פירות")).toBeInTheDocument(); // still visible, just not a link
  });

  it("matchCategoryId is exact-name — the old first-match bug is structurally gone", () => {
    const cards = matchCategoryId(CATEGORY_CARDS, DB_CATEGORIES);
    const byName = Object.fromEntries(cards.map((c) => [c.name, c.categoryId]));
    expect(byName["בשר"]).toBe(1);
    expect(byName["דגים"]).toBe(2); // previously swallowed by the "בשר, עוף ודגים" first-match
    // every card maps to exactly one distinct category
    const ids = cards.map((c) => c.categoryId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the 10-card set matches the Sapir-approved labels verbatim", () => {
    expect(CATEGORY_CARDS.map((c) => c.name)).toEqual([
      "בשר",
      "ירקות",
      "חלב וגבינות",
      "לחמים ואפייה",
      "שמנים",
      "סבונים טבעיים",
      "דגים",
      "פירות",
      "יין, בירה ומשקאות",
      "קוסמטיקה טבעית",
    ]);
  });

  it("MEH-1104 (contract): the cream card resolves on the new DB name only", () => {
    const cream = CATEGORY_CARDS.find((c) => c.key === "cream");
    expect(cream.name).toBe("קוסמטיקה טבעית");
    // contract phase removed the transitional alias — no matchAliases remain
    expect(cream.matchAliases).toBeUndefined();
    // post-rename DB → primary name resolves it
    const [resolved] = matchCategoryId([cream], [{ id: 13, name: "קוסמטיקה טבעית" }]);
    expect(resolved.categoryId).toBe(13);
  });
});
