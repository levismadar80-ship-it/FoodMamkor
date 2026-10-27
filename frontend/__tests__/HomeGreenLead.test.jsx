import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * MEH-2441 — home page, design-distinct pass (Sapir 27/10).
 *
 * 1. The featured business ("היכרות") is a full-bleed brand-green band: the
 *    place (city · category) leads in gold, then the name, then the quote.
 *    The "מאחורי הקלעים" sub-heading and the long description are gone.
 * 2. "איך זה עובד" and the comparison teaser left home — the module no longer
 *    exports them (HomeClient can't mount what doesn't exist).
 * 3. Category grid: no 01–10 numerals; the two large tiles are ירקות and
 *    לחמים ואפייה.
 *
 * Featured cells (5-state rule): null → nothing · photo → <img> · failed photo
 * → tonal plate · no city/category → no place line.
 */
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k, v) => {
    const key = ns ? `${ns}.${k}` : k;
    return v?.name ? `${key}:${v.name}` : key;
  },
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  default: ({ alt, src, onError, className }) => (
    <img alt={alt} src={src} onError={onError} className={className} />
  ),
}));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, initial, whileInView, viewport, transition, variants, ...p }) => <div {...p}>{children}</div>,
  },
}));
vi.mock("@/components/FadeInSection", () => ({
  default: ({ children, className }) => <div className={className}>{children}</div>,
}));
vi.mock("@/components/BusinessCtaLink", () => ({ default: ({ children }) => <a href="#">{children}</a> }));
vi.mock("@/hooks/useScrollAffordance", () => ({
  default: () => ({ ref: { current: null } }),
  ScrollArrows: () => null,
}));

import * as Blocks from "@/app/[locale]/home/HomeStaticBlocks";
import { HomeCategoryGrid } from "@/app/[locale]/home/HomeCategoryGrid";
import { CATEGORY_CARDS } from "@/lib/home-categories";

const { HomeFeaturedProducer } = Blocks;

const FEATURED = {
  name: "מאפיית השדה",
  city: "בנימינה",
  category: "לחמים ואפייה",
  photo: "https://res.cloudinary.com/demo/image/upload/v1/bread.jpg",
  quote: "לחם מחמצת שנאפה כל בוקר",
  story: "סיפור ארוך על המאפייה שמתחיל לפני עשרים שנה",
  href: "/maafiyat-hasade",
};

const classes = (el) => el.className.split(/\s+/);

describe("MEH-2441 — featured business on the green band", () => {
  it("is a full-bleed brand-green section", () => {
    render(<HomeFeaturedProducer featured={FEATURED} />);
    const band = screen.getByTestId("home-featured");
    expect(band.tagName).toBe("SECTION");
    expect(classes(band)).toEqual(expect.arrayContaining(["bg-primary", "text-background"]));
  });

  it("leads with the place in gold, above the name", () => {
    render(<HomeFeaturedProducer featured={FEATURED} />);
    const place = screen.getByTestId("home-featured-place");
    expect(place.textContent).toBe("בנימינה · לחמים ואפייה");
    expect(classes(place)).toContain("text-gold-on-dark");
    const name = screen.getByText(FEATURED.name);
    expect(place.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("drops the sub-heading and the long description; keeps the quote and the meet link", () => {
    render(<HomeFeaturedProducer featured={FEATURED} />);
    expect(screen.queryByText("home.featured.heading")).not.toBeInTheDocument();
    expect(screen.queryByText(FEATURED.story)).not.toBeInTheDocument();
    expect(screen.getByText(FEATURED.quote)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `home.featured.cta_meet:${FEATURED.name}` })).toHaveAttribute(
      "href",
      FEATURED.href,
    );
  });

  it("renders nothing without a featured business", () => {
    const { container } = render(<HomeFeaturedProducer featured={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("a failed photo falls back to the tonal plate, never a broken image", () => {
    render(<HomeFeaturedProducer featured={FEATURED} />);
    fireEvent.error(screen.getByRole("img", { name: FEATURED.name }));
    expect(screen.queryByRole("img", { name: FEATURED.name })).not.toBeInTheDocument();
    expect(screen.getByTestId("home-featured-plate")).toBeInTheDocument();
  });

  it("no city and no category → no place line", () => {
    render(<HomeFeaturedProducer featured={{ ...FEATURED, city: null, category: null }} />);
    expect(screen.queryByTestId("home-featured-place")).not.toBeInTheDocument();
    expect(screen.getByText(FEATURED.name)).toBeInTheDocument();
  });
});

describe("MEH-2441 — blocks that left home", () => {
  it("HomeStaticBlocks no longer exports how-it-works or the comparison teaser", () => {
    expect(Blocks.HomeHowItWorks).toBeUndefined();
    expect(Blocks.HomeComparisonTeaser).toBeUndefined();
  });
});

describe("MEH-2441 — category grid", () => {
  it("leads with ירקות and לחמים ואפייה as the two large tiles", () => {
    expect(CATEGORY_CARDS.slice(0, 2).map((c) => c.name)).toEqual(["ירקות", "לחמים ואפייה"]);
    expect(CATEGORY_CARDS).toHaveLength(10);
  });

  it("captions carry the name only — no 01–10 numerals", () => {
    render(<HomeCategoryGrid categoryCards={CATEGORY_CARDS} />);
    const captions = screen.getAllByTestId("home-category-caption");
    expect(captions).toHaveLength(10);
    captions.forEach((c, i) => {
      expect(c.textContent).toBe(CATEGORY_CARDS[i].name);
    });
  });
});
