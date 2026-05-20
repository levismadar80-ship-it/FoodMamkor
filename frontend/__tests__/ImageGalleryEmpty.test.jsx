import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-475 PR-C4a chunk 4b: mock next-intl per established precedent.
// ImageGallery uses gallery.* keys for ARIA labels and image alts.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const flat = {
      open_aria: `הגדלי תמונה ${vars?.current ?? ""}`.trim(),
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

describe("ImageGallery empty state (MEH-25)", () => {
  it("renders the Hebrew caption when images array is empty", () => {
    render(<ImageGallery images={[]} />);
    expect(
      screen.getByText("בית עסק זה טרם הוסיף תמונות"),
    ).toBeInTheDocument();
  });

  it("shows the leaf Phosphor icon (no emoji)", () => {
    render(<ImageGallery images={[]} />);
    expect(screen.getByTestId("leaf-icon")).toBeInTheDocument();
  });

  it("uses #F5F0E8 warm-cream background, not a green gradient", () => {
    render(<ImageGallery images={[]} />);
    const wrapper = screen.getByTestId("gallery-empty-state");
    const bg = (wrapper.style.background || "").toLowerCase();
    // jsdom normalizes `#F5F0E8` → `rgb(245, 240, 232)`. Accept either.
    const isExpected = bg.includes("#f5f0e8") || bg.includes("rgb(245, 240, 232)");
    expect(isExpected).toBe(true);
    // Regression guard: no linear-gradient green
    expect(bg).not.toContain("linear-gradient");
  });

  it("has max-h/min-h constraints so it doesn't take over the viewport", () => {
    render(<ImageGallery images={[]} />);
    const wrapper = screen.getByTestId("gallery-empty-state");
    // Check both classes present — Tailwind min-h-[200px] + max-h-[280px]
    expect(wrapper.className).toMatch(/min-h-\[200px\]/);
    expect(wrapper.className).toMatch(/max-h-\[280px\]/);
  });

  it("still shows the gallery-variant FavoriteButton when producerId is passed", () => {
    render(<ImageGallery images={[]} producerId={"p-123"} />);
    const fav = screen.getByTestId("favorite-btn");
    expect(fav).toHaveAttribute("data-producer-id", "p-123");
  });

  it("omits the FavoriteButton when no producerId", () => {
    render(<ImageGallery images={[]} />);
    expect(screen.queryByTestId("favorite-btn")).not.toBeInTheDocument();
  });
});
