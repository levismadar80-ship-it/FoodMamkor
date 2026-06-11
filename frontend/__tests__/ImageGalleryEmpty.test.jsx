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
  // MEH-76 chunk 3 (S6 state b): the emoji-avatar placeholder is replaced by
  // a typographic monogram — display-serif initials on the cream token
  // surface. No emoji, no leaf icon. Assertions follow the component.
  it("renders the empty-state container when images array is empty", () => {
    render(<ImageGallery images={[]} />);
    expect(screen.getByTestId("gallery-empty-state")).toBeInTheDocument();
  });

  it("shows the typographic monogram (S6 state b) — no emoji, no leaf icon", () => {
    render(<ImageGallery images={[]} producerInitials="ח · ש" />);
    const monogram = screen.getByText("ח · ש");
    expect(monogram).toBeInTheDocument();
    expect(monogram.className).toMatch(/font-headline-lg/);
    expect(screen.queryByTestId("leaf-icon")).not.toBeInTheDocument();
  });

  it("uses the cream background TOKEN, not inline hex or a green gradient", () => {
    render(<ImageGallery images={[]} />);
    const wrapper = screen.getByTestId("gallery-empty-state");
    expect(wrapper.className).toMatch(/bg-background/);
    // Regression guard: the old inline style (raw hex / gradient) is gone.
    expect(wrapper.style.background || "").toBe("");
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
