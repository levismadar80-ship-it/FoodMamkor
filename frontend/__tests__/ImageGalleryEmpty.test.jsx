import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-475 PR-C4a chunk 4b: mock next-intl per established precedent.
// ImageGallery uses gallery.* keys for ARIA labels and image alts.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const flat = {
      open_aria: `הגדלו תמונה ${vars?.current ?? ""}`.trim(),
      image_alt: `תמונה ${vars?.current ?? ""}`.trim(),
      prev_aria: "תמונה קודמת",
      next_aria: "תמונה הבאה",
      thumb_aria: `עבור לתמונה ${vars?.n ?? ""}`.trim(),
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

// MEH-1334 (decision 6): the masthead corner overlay is now the mobile SHARE
// button — the heart moved to the header quiet-actions row.
vi.mock("@/components/ShareButton", () => ({
  default: (props) => (
    <div data-testid="share-overlay" data-variant={props.variant} data-url={props.url} />
  ),
}));

// MEH-1693: the hero corner is a PAIR now — the heart rejoined the share
// circle. Stubbed for the same reason ShareButton is: the real one pulls in
// auth + the favorites cache, and this suite asserts hero composition, not
// favoriting behaviour.
vi.mock("@/components/FavoriteButton", () => ({
  default: (props) => (
    <div data-testid="fav-overlay" data-variant={props.variant} />
  ),
}));

// Mock ImageWithFallback — only rendered in the non-empty branch
vi.mock("@/components/ImageWithFallback", () => ({
  default: () => <div data-testid="image" />,
}));

// Mock Phosphor icon
vi.mock("@phosphor-icons/react", () => ({
  Leaf: (props) => <span data-testid="leaf-icon" {...props} />,
  // MEH-2584: BadgeRow now imports lib/chip-icons.js (badge glyphs).
  SealCheck: () => null,
  Truck: () => null,
  Package: () => null,
  Storefront: () => null, // MEH-2598: chip-icons on_site
  Certificate: () => null,
  Carrot: () => null,
  GrainsSlash: () => null,
  Barn: () => null,
  Medal: () => null,
  HandHeart: () => null,
  DropSlash: () => null,
  Cube: () => null,
  Clock: () => null,
}));

describe("ImageGallery empty state — Tinted Masthead (MEH-815)", () => {
  // MEH-815: the imageless gallery slot renders the "Tinted Masthead" editorial
  // hero — green tint over cream + the producer name as the page <h1> + a
  // recessive מ·ה brand monogram. Replaces the MEH-76 emoji+initials box.
  it("renders the empty-state container when images array is empty", () => {
    render(<ImageGallery images={[]} />);
    expect(screen.getByTestId("gallery-empty-state")).toBeInTheDocument();
  });

  it("renders the producer name as the page <h1> (dominant element)", () => {
    render(<ImageGallery images={[]} producerName="חוות הדבש של מירי" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("חוות הדבש של מירי");
    expect(heading.className).toMatch(/font-headline-lg/);
    expect(heading.className).toMatch(/font-black/);
  });

  // MEH-2833 (seed layer, board 1): the מ·ה monogram is replaced by the logo
  // as a supergraphic — a 200px (phone) / 280px (md+) bloom at the end side,
  // half past the edge so the card crops it, never rotated.
  it("shows the seed supergraphic (intact logo, not rotated), no monogram, never the old leaf/emoji", () => {
    render(<ImageGallery images={[]} producerName="חוות הדבש" />);
    expect(screen.queryByText("מ·ה")).not.toBeInTheDocument();
    expect(screen.queryByTestId("leaf-icon")).not.toBeInTheDocument();
    const bloom = document.querySelector('[data-testid="gallery-tint-layer"] svg[data-seed-mark="light"]');
    expect(bloom).not.toBeNull();
    expect(bloom.getAttribute("width")).toBe("280");
    expect(bloom.getAttribute("aria-hidden")).toBe("true");
    const cls = bloom.getAttribute("class");
    // past the END edge at each size → cropped (MEH-2844 moved it below lg)
    expect(cls).toMatch(/(^|\s)w-\[200px\] h-\[200px\] /);
    expect(cls).toMatch(/md:w-\[280px\] md:h-\[280px\]/);
    expect(cls).toMatch(/lg:-end-\[140px\]/);
    expect(cls).not.toMatch(/rotate|scale-x/); // never rotated or mirrored
    expect(bloom.querySelectorAll("[data-seed]")).toHaveLength(5);
    // the card crops it
    expect(screen.getByTestId("gallery-empty-state").className).toMatch(/overflow-hidden/);
  });

  // MEH-2844 (Sapir 08/11): below lg the bell/share/heart circles sit in the
  // top-end corner (the lg:hidden cluster) and the green seed ran under the
  // bell. Below lg the bloom sits lower and further in: ≥12px from every
  // circle, ≥3 seeds visible (measured on staging — see ImageGallery.jsx).
  // From lg the circles leave the masthead and the board's centred bloom
  // returns. Old classes (-bottom-10 -end-[100px], md:top-1/2) fail here.
  it("below lg the bloom sits low and in, clear of the corner circles; centred only from lg", () => {
    render(<ImageGallery images={[]} producerName="חוות הדבש" />);
    const cls = document
      .querySelector('[data-testid="gallery-tint-layer"] svg[data-seed-mark="light"]')
      .getAttribute("class")
      .split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(["-bottom-[90px]", "-end-[70px]"]));
    expect(cls).toEqual(expect.arrayContaining(["md:-bottom-[135px]", "md:-end-[95px]"]));
    expect(cls).toEqual(
      expect.arrayContaining(["lg:bottom-auto", "lg:top-1/2", "lg:-translate-y-1/2", "lg:-end-[140px]"])
    );
    // no breakpoint below lg centres it again (the overlap at 768)
    expect(cls.filter((c) => /^(md:)?top-1\/2$|^(md:)?-translate-y-1\/2$/.test(c))).toEqual([]);
  });

  it("the name block stops short of the bloom, so the h1 never sits on a seed", () => {
    render(<ImageGallery images={[]} producerName="מאפיית רוח השדה של משפחת כהן בזכרון יעקב" />);
    const block = screen.getByTestId("masthead-name-block");
    // visible bloom + 12px gap: 130px on a phone, 185px at md, 140px from lg
    expect(block.className).toMatch(/(^|\s)max-w-\[calc\(100%-9rem\)\]/);
    expect(block.className).toMatch(/md:max-w-\[calc\(100%-12\.5rem\)\]/);
    expect(block.className).toMatch(/lg:max-w-\[calc\(100%-9\.5rem\)\]/);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(block).toContainElement(h1);
    // a long unbreakable word wraps inside the cap instead of overflowing it
    expect(h1.className).toContain("[overflow-wrap:anywhere]");
  });

  it("uses the cream background TOKEN + the sand (background-alt) layer, not inline hex", () => {
    render(<ImageGallery images={[]} producerName="חוות הדבש" />);
    const wrapper = screen.getByTestId("gallery-empty-state");
    // Outer surface is the cream token; MEH-2833: the inner layer is sand.
    expect(wrapper.className).toMatch(/bg-background/);
    expect(screen.getByTestId("gallery-tint-layer").className).toMatch(/\bbg-background-alt\b/);
    expect(screen.getByTestId("gallery-tint-layer").className).not.toMatch(/bg-primary/);
    // Regression guard: no inline raw hex / gradient.
    expect(wrapper.style.background || "").toBe("");
  });

  it("is text-led — no fixed h-[120px]/h-[180px] photo-box height", () => {
    render(<ImageGallery images={[]} producerName="חוות הדבש" />);
    const wrapper = screen.getByTestId("gallery-empty-state");
    // The old fixed-height placeholder box is gone; height is content-driven
    // (min-h on the inner tint layer), shorter than the imaged carousel.
    expect(wrapper.className).not.toMatch(/h-\[120px\]/);
    expect(wrapper.className).not.toMatch(/h-\[180px\]/);
  });

  it("shows the mobile share overlay when producerId is passed (MEH-1334)", () => {
    render(
      <ImageGallery images={[]} producerId={"p-123"} producerName="חוות הדבש" shareUrl="https://x/p" />,
    );
    const share = screen.getByTestId("share-overlay");
    expect(share).toHaveAttribute("data-variant", "overlay");
    expect(share.parentElement.className).toMatch(/lg:hidden/);
  });

  // MEH-1693: the heart returned to the hero (override of MEH-1334 decision 6).
  // Both circles, one cluster, exactly one of each — a second heart would mean
  // the imageless and imaged branches both mounted.
  it("shows the heart beside the share circle, one each (MEH-1693)", () => {
    render(
      <ImageGallery images={[]} producerId={"p-123"} producerName="חוות הדבש" shareUrl="https://x/p" />,
    );
    const hearts = screen.getAllByTestId("fav-overlay");
    expect(hearts).toHaveLength(1);
    expect(screen.getAllByTestId("share-overlay")).toHaveLength(1);
    // gallery variant = the white-circle anatomy the share overlay mirrors.
    expect(hearts[0]).toHaveAttribute("data-variant", "gallery");
    // Same parent ⇒ same cluster, so they share the corner and the gap.
    expect(hearts[0].parentElement).toBe(
      screen.getByTestId("share-overlay").parentElement
    );
    expect(hearts[0].parentElement.className).toMatch(/lg:hidden/);
    // MEH-2671: inline-END corner (top-left in RTL), heart first. (The
    // «מ·ה» start-corner mark it moved away from is gone — MEH-2833.)
    expect(hearts[0].parentElement.className).toMatch(/\bend-3\b/);
    expect(hearts[0].parentElement.className).not.toMatch(/\bstart-3\b/);
    expect(hearts[0].parentElement.firstElementChild).toBe(hearts[0]);
  });

  it("omits BOTH hero controls when no producerId", () => {
    render(<ImageGallery images={[]} producerName="חוות הדבש" />);
    expect(screen.queryByTestId("share-overlay")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fav-overlay")).not.toBeInTheDocument();
  });
});
