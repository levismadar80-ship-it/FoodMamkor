import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-3395: every gallery image's alt names the business, so search, AI
// answers and screen readers know whose photo it is. Mocks copied from
// ImageGalleryGrid.test.jsx (same component, same stubs).
// (MEH-1047 note kept from the source file:) the imaged state renders a desktop editorial grid (Direction B) —
// hero at inline-start + a tall stacked secondary column (≤2 cells), with the
// single "כל התמונות (N)" pill on the bottom stacked cell. Mobile keeps the
// swipeable carousel (chunk 2). This file covers the desktop grid densities.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const flat = {
      open_aria: `הגדלו תמונה ${vars?.current ?? ""}`.trim(),
      image_alt: `תמונה ${vars?.current ?? ""}`.trim(),
      image_alt_named: `${vars?.name}, תמונה ${vars?.current}`,
      prev_aria: "תמונה קודמת",
      next_aria: "תמונה הבאה",
      thumb_aria: `עבור לתמונה ${vars?.n ?? ""}`.trim(),
      view_all: `כל התמונות (${vars?.n ?? ""})`.trim(),
    };
    return flat[key] ?? key;
  },
}));

// MEH-1358: ImageGallery now imports LocaleLink (masthead seal popover link);
// mock the i18n wrapper directly (BadgeRow.test / BottomNav.test precedent).
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import ImageGallery from "@/components/ImageGallery";

// MEH-1334 (decision 6): the hero corner overlay is now the mobile SHARE
// button — the heart moved to the header quiet-actions row.
vi.mock("@/components/ShareButton", () => ({
  default: (props) => (
    <div data-testid="share-overlay" data-variant={props.variant} data-url={props.url} />
  ),
}));

// MEH-1693: the hero corner is a PAIR now — the heart rejoined the share
// circle. Stubbed for the same reason ShareButton is: the real one pulls in
// auth + the favorites cache, and this suite asserts hero composition.
vi.mock("@/components/FavoriteButton", () => ({
  default: (props) => (
    <div data-testid="fav-overlay" data-variant={props.variant} />
  ),
}));

// Forward the props we assert on (priority for LCP, src for identity).
vi.mock("@/components/ImageWithFallback", () => ({
  default: (props) => (
    <div data-testid="image" data-alt={props.alt} data-src={props.src} />
  ),
}));

vi.mock("@/components/Lightbox", () => ({
  default: () => <div data-testid="lightbox" />,
}));

vi.mock("@phosphor-icons/react", () => ({
  Images: (props) => <span data-testid="images-icon" {...props} />,
  // MEH-2584: BadgeRow now imports lib/chip-icons.js (badge glyphs).
  SealCheck: () => null,
  Truck: () => null,
  Package: () => null,
  Storefront: () => null, // MEH-2598: chip-icons on_site
  Certificate: () => null,
  Leaf: () => null,
  Carrot: () => null,
  GrainsSlash: () => null,
  Barn: () => null,
  Medal: () => null,
  HandHeart: () => null,
  DropSlash: () => null,
  Cube: () => null,
  Clock: () => null,
}));

const urls = (n) => Array.from({ length: n }, (_, i) => `https://res.cloudinary.com/x/img${i}.jpg`);

describe("ImageGallery alt text names the business (MEH-3395)", () => {
  it("every rendered image's alt carries the business name and its number", () => {
    render(<ImageGallery images={urls(3)} producerName="סנדרה פירות איכותיים" />);
    const alts = screen.getAllByTestId("image").map((el) => el.getAttribute("data-alt"));
    expect(alts.length).toBeGreaterThan(0);
    for (const alt of alts) expect(alt).toMatch(/^סנדרה פירות איכותיים, תמונה \d+$/);
    expect(alts).toContain("סנדרה פירות איכותיים, תמונה 1");
  });

  it("without a name it falls back to the numbered alt, never «undefined»", () => {
    render(<ImageGallery images={urls(2)} />);
    const alts = screen.getAllByTestId("image").map((el) => el.getAttribute("data-alt"));
    expect(alts).toContain("תמונה 1");
    for (const alt of alts) expect(alt).not.toMatch(/undefined/);
  });
});
