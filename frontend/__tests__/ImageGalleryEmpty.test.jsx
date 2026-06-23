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

import ImageGallery from "@/components/ImageGallery";

// Mock FavoriteButton so we don't need auth context + api
vi.mock("@/components/FavoriteButton", () => ({
  default: (props) => <div data-testid="favorite-btn" data-producer-id={props.producerId} />,
}));

// Mock ImageWithFallback — only rendered in the non-empty branch
vi.mock("@/components/ImageWithFallback", () => ({
  default: () => <div data-testid="image" />,
}));

// Mock Phosphor icon
vi.mock("@phosphor-icons/react", () => ({
  Leaf: (props) => <span data-testid="leaf-icon" {...props} />,
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

  it("shows the recessive מ·ה brand monogram, never the old leaf/emoji", () => {
    render(<ImageGallery images={[]} producerName="חוות הדבש" />);
    expect(screen.getByText("מ·ה")).toBeInTheDocument();
    expect(screen.queryByTestId("leaf-icon")).not.toBeInTheDocument();
  });

  it("uses the cream background TOKEN + a green tint layer, not inline hex", () => {
    render(<ImageGallery images={[]} producerName="חוות הדבש" />);
    const wrapper = screen.getByTestId("gallery-empty-state");
    // Outer surface is the cream token; the tint is opacity-on-cream (ADR-019).
    expect(wrapper.className).toMatch(/bg-background/);
    expect(screen.getByTestId("gallery-tint-layer").className).toMatch(/bg-primary\/\[0\.06\]/);
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

  it("still shows the gallery-variant FavoriteButton when producerId is passed", () => {
    render(<ImageGallery images={[]} producerId={"p-123"} producerName="חוות הדבש" />);
    const fav = screen.getByTestId("favorite-btn");
    expect(fav).toHaveAttribute("data-producer-id", "p-123");
  });

  it("omits the FavoriteButton when no producerId", () => {
    render(<ImageGallery images={[]} producerName="חוות הדבש" />);
    expect(screen.queryByTestId("favorite-btn")).not.toBeInTheDocument();
  });
});
