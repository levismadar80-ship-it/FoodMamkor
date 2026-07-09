import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1047: the imaged state renders a desktop editorial grid (Direction B) —
// hero at inline-start + a tall stacked secondary column (≤2 cells), with the
// single "כל התמונות (N)" pill on the bottom stacked cell. Mobile keeps the
// swipeable carousel (chunk 2). This file covers the desktop grid densities.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const flat = {
      open_aria: `הגדלו תמונה ${vars?.current ?? ""}`.trim(),
      image_alt: `תמונה ${vars?.current ?? ""}`.trim(),
      prev_aria: "תמונה קודמת",
      next_aria: "תמונה הבאה",
      thumb_aria: `עבור לתמונה ${vars?.n ?? ""}`.trim(),
      view_all: `כל התמונות (${vars?.n ?? ""})`.trim(),
    };
    return flat[key] ?? key;
  },
}));

import ImageGallery from "@/components/ImageGallery";

vi.mock("@/components/FavoriteButton", () => ({
  default: (props) => <div data-testid="favorite-btn" data-producer-id={props.producerId} />,
}));

// Forward the props we assert on (priority for LCP, src for identity).
vi.mock("@/components/ImageWithFallback", () => ({
  default: (props) => (
    <div data-testid="image" data-priority={props.priority ? "1" : "0"} data-src={props.src} />
  ),
}));

vi.mock("@/components/Lightbox", () => ({
  default: () => <div data-testid="lightbox" />,
}));

vi.mock("@phosphor-icons/react", () => ({
  Images: (props) => <span data-testid="images-icon" {...props} />,
}));

const urls = (n) => Array.from({ length: n }, (_, i) => `https://res.cloudinary.com/x/img${i}.jpg`);

describe("ImageGallery imaged state — desktop editorial grid (MEH-1047)", () => {
  it("1 image: no grid — keeps the full-width banner", () => {
    render(<ImageGallery images={urls(1)} />);
    expect(screen.queryByTestId("gallery-grid")).not.toBeInTheDocument();
  });

  it("2 images: hero + single companion, no stacked-pair rows, no pill", () => {
    render(<ImageGallery images={urls(2)} />);
    expect(screen.getByTestId("gallery-grid")).toBeInTheDocument();
    expect(screen.getByTestId("gallery-grid-hero")).toBeInTheDocument();
    expect(screen.getAllByTestId("gallery-grid-cell")).toHaveLength(1);
    expect(screen.queryByTestId("gallery-grid-pill-cell")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gallery-all-pill")).not.toBeInTheDocument();
    // single companion → no 2-row template, hero does not span rows
    expect(screen.getByTestId("gallery-grid")).not.toHaveClass("grid-rows-2");
    expect(screen.getByTestId("gallery-grid-hero")).not.toHaveClass("row-span-2");
  });

  it("3 images: hero (row-span-2) + 2 stacked, pill shows total count", () => {
    render(<ImageGallery images={urls(3)} />);
    const grid = screen.getByTestId("gallery-grid");
    expect(grid).toHaveClass("grid-rows-2");
    expect(screen.getByTestId("gallery-grid-hero")).toHaveClass("row-span-2");
    expect(screen.getAllByTestId("gallery-grid-cell")).toHaveLength(1); // images[1]
    expect(screen.getByTestId("gallery-grid-pill-cell")).toBeInTheDocument(); // images[2]
    expect(screen.getByTestId("gallery-all-pill")).toHaveTextContent("כל התמונות (3)");
  });

  it("5 images (4+): only 2 secondary cells rendered, pill counts total (5)", () => {
    render(<ImageGallery images={urls(5)} />);
    // hero + exactly 2 secondary cells (one plain, one pill)
    expect(screen.getAllByTestId("gallery-grid-cell")).toHaveLength(1);
    expect(screen.getByTestId("gallery-grid-pill-cell")).toBeInTheDocument();
    expect(screen.getByTestId("gallery-all-pill")).toHaveTextContent("כל התמונות (5)");
  });

  it("grid hero image is eager/priority for LCP; secondary images are not", () => {
    render(<ImageGallery images={urls(4)} />);
    const heroImg = screen.getByTestId("gallery-grid-hero").querySelector('[data-testid="image"]');
    expect(heroImg).toHaveAttribute("data-priority", "1");
    // every non-hero grid image must not be priority
    const secondaryImgs = [
      ...screen.getByTestId("gallery-grid-cell").querySelectorAll('[data-testid="image"]'),
      ...screen.getByTestId("gallery-grid-pill-cell").querySelectorAll('[data-testid="image"]'),
    ];
    secondaryImgs.forEach((img) => expect(img).toHaveAttribute("data-priority", "0"));
  });

  it("renders exactly one FavoriteButton, pinned top-start (shared across grid + carousel)", () => {
    // Regression guard: the favorite must not be trapped inside the md:hidden
    // carousel (it would vanish on desktop for 2+ images) nor mounted twice
    // (double /users/me/favorites fetch). One instance, hoisted to the wrapper.
    render(<ImageGallery images={urls(4)} producerId="p-1" />);
    const favs = screen.getAllByTestId("favorite-btn");
    expect(favs).toHaveLength(1);
    expect(favs[0]).toHaveAttribute("data-producer-id", "p-1");
    expect(favs[0].parentElement.className).toMatch(/start-3/);
    expect(favs[0].parentElement.className).toMatch(/top-3/);
    expect(favs[0].parentElement.className).toMatch(/z-20/);
  });
});

describe("ImageGallery imaged state — mobile carousel (MEH-1047 chunk 2)", () => {
  it("shows a counter chip (current/total) and a gold progress bar, no dots", () => {
    render(<ImageGallery images={urls(5)} />);
    expect(screen.getByTestId("gallery-counter")).toHaveTextContent("1/5");
    const progress = screen.getByTestId("gallery-progress");
    expect(progress).toBeInTheDocument();
    // gold fill child present
    expect(progress.querySelector(".bg-accent")).not.toBeNull();
    // dots + arrows removed — their aria-labels must no longer exist
    expect(screen.queryByLabelText(/עבור לתמונה/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("תמונה קודמת")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("תמונה הבאה")).not.toBeInTheDocument();
  });

  it("omits counter + progress bar for a single image", () => {
    render(<ImageGallery images={urls(1)} />);
    expect(screen.queryByTestId("gallery-counter")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gallery-progress")).not.toBeInTheDocument();
  });
});
