import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { HomeCategoryGrid } from "@/app/[locale]/home/HomeCategoryGrid";
import { CATEGORY_CARDS } from "@/lib/home-categories";

// MEH-2418: the rail's entrance is triggered ONCE by the rail itself entering
// the viewport; the cards stagger from that trigger. Before, every card had its
// own whileInView, so on iOS a card swiped in SIDEWAYS only then began its
// fade/slide (caught mid-animation in Sapir's screenshot, 27/10). Chromium does
// not reproduce the late start, so the mechanism is pinned instead: real
// framer-motion, and a counting IntersectionObserver — on the old markup the
// ten cards each register an observation target.

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("@/components/FadeInSection", () => ({ default: ({ children }) => <div>{children}</div> }));

let observed;
beforeEach(() => {
  observed = [];
  global.IntersectionObserver = class {
    observe(el) { observed.push(el); }
    unobserve() {}
    disconnect() {}
  };
});

describe("phone category rail — one entrance trigger (MEH-2418)", () => {
  it("only the rail is observed for the entrance, not each of the ten cards", () => {
    const cards = CATEGORY_CARDS.map((c, i) => ({ ...c, categoryId: i + 1 }));
    const { getByTestId } = render(<HomeCategoryGrid categoryCards={cards} />);
    const rail = getByTestId("home-category-rail");
    const cardWrappers = [...rail.children];
    expect(cardWrappers).toHaveLength(10);
    expect(observed).toContain(rail);
    expect(observed.filter((el) => cardWrappers.includes(el))).toHaveLength(0);
  });
});
