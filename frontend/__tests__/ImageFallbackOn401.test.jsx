/**
 * MEH-1976 — a Cloudinary 401 must degrade to the surface's own no-photo cell,
 * not the browser's broken-image glyph.
 *
 * The bug this guards is narrow and easy to reintroduce, because the code that
 * has it looks complete: every surface already had `{src ? <Image/> : <cell/>}`.
 * That covers a MISSING url. It does not cover a url that resolves and then
 * fails — which is exactly what MEH-1925 was (the account was disabled, every
 * URL still existed, and every one of them 401'd).
 *
 * So the discriminating input is not "no src" — the old code passes that. It is
 * "a src that errors", and the only way to produce it in jsdom is to fire the
 * error event by hand, since jsdom never actually loads images.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import RecipeCard from "@/components/public/RecipeCard";
import { HomeRecentlyViewed } from "@/app/[locale]/home/HomeStaticBlocks";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

vi.mock("@/hooks/useScrollAffordance", () => ({
  default: () => ({ scrollRef: { current: null }, canScrollStart: false, canScrollEnd: false }),
  ScrollArrows: () => null,
}));

// Siblings of the code under test that drag in next-intl's navigation stack.
// Stubbed so this file exercises the image branch, not the router.
vi.mock("@/components/BusinessCtaLink", () => ({ default: () => null }));
vi.mock("@/components/FadeInSection", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock("next/image", () => ({
  default: ({ onError, alt, src }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} onError={onError} data-testid="real-img" />
  ),
}));

const recipe = {
  id: 7,
  title: "לחם מחמצת",
  image_url: "https://res.cloudinary.com/demo/image/upload/v1/bread.jpg",
};

describe("MEH-1976 — image fallback on load failure", () => {
  it("renders the image when it loads fine (control — proves the test can tell the states apart)", () => {
    render(<RecipeCard slug="bakery" recipe={recipe} />);
    expect(screen.getByTestId("real-img")).toBeTruthy();
    expect(screen.queryByTestId("recipe-image-missing")).toBeNull();
  });

  it("falls back to the no-photo cell when the image 401s", () => {
    render(<RecipeCard slug="bakery" recipe={recipe} />);
    // The MEH-1925 condition: the url exists, the fetch fails.
    fireEvent.error(screen.getByTestId("real-img"));

    expect(screen.getByTestId("recipe-image-missing")).toBeTruthy();
    expect(screen.queryByTestId("real-img")).toBeNull();
  });

  it("still renders the no-photo cell when there is no url at all (the case that always worked)", () => {
    render(<RecipeCard slug="bakery" recipe={{ ...recipe, image_url: null }} />);
    expect(screen.getByTestId("recipe-image-missing")).toBeTruthy();
  });
});

/**
 * The keyed-map surfaces are a genuinely different shape from RecipeCard, and the
 * difference is the part worth testing. RecipeCard owns ONE image, so a boolean
 * would have worked there. These render inside a .map(), where a single shared
 * flag is the obvious implementation and is WRONG: one 401 would blank every
 * sibling's photo too.
 *
 * That is the assertion below — not "the fallback appears" (which a shared flag
 * also satisfies) but "the sibling is untouched", which only a keyed map passes.
 * Swap `failedImgs[p.id]` for a single `useState(false)` and the second
 * expectation fails while the first still passes.
 */
describe("MEH-1976 — a failed image must not blank its siblings", () => {
  const items = [
    { id: 1, name: "מאפיית רוח השדה", slug: "ruach", images: ["https://res.cloudinary.com/demo/a.jpg"] },
    { id: 2, name: "גבינות תמר", slug: "tamar", images: ["https://res.cloudinary.com/demo/b.jpg"] },
  ];

  it("falls back only for the item whose image failed", () => {
    render(<HomeRecentlyViewed items={items} />);

    const first = screen.getByAltText("מאפיית רוח השדה");
    expect(screen.getByAltText("גבינות תמר")).toBeTruthy();

    fireEvent.error(first);

    // The failed one is gone...
    expect(screen.queryByAltText("מאפיית רוח השדה")).toBeNull();
    // ...and the one that never failed is still rendering its photo.
    expect(screen.getByAltText("גבינות תמר")).toBeTruthy();
  });

  it("renders every image when none fail (control)", () => {
    render(<HomeRecentlyViewed items={items} />);
    expect(screen.getByAltText("מאפיית רוח השדה")).toBeTruthy();
    expect(screen.getByAltText("גבינות תמר")).toBeTruthy();
  });
});
