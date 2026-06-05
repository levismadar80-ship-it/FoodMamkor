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
  // MEH-729: the v4 redesign (PR #890) replaced the caption + Leaf icon empty
  // state with a category-emoji + producer-initials placeholder. Assertions
  // updated to the v4 component (component = source of truth).
  it("renders the empty-state container when images array is empty", () => {
    render(<ImageGallery images={[]} />);
    expect(screen.getByTestId("gallery-empty-state")).toBeInTheDocument();
  });

  it("shows the category emoji and producer initials (v4), not a leaf icon", () => {
    render(
      <ImageGallery images={[]} categoryEmoji="🧀" producerInitials="חש" />,
    );
    expect(screen.getByText("🧀")).toBeInTheDocument();
    expect(screen.getByText("חש")).toBeInTheDocument();
    expect(screen.queryByTestId("leaf-icon")).not.toBeInTheDocument();
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

  it("has fixed-height constraints so it doesn't take over the viewport", () => {
    render(<ImageGallery images={[]} />);
    const wrapper = screen.getByTestId("gallery-empty-state");
    // MEH-729: v4 uses fixed h-[120px] / md:h-[180px] (was min-h/max-h).
    expect(wrapper.className).toMatch(/h-\[120px\]/);
    expect(wrapper.className).toMatch(/md:h-\[180px\]/);
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
