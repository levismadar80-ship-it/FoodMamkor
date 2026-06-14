import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// StarRating reads common.star_rating.count_aria via next-intl.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, values = {}) => {
    if (key === "count_aria") return `(${values.count} ביקורות)`;
    return key;
  },
}));

import StarRating from "@/components/StarRating";

describe("StarRating", () => {
  it("renders nothing when count is 0", () => {
    const { container } = render(<StarRating avg={4.5} count={0} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when count is undefined", () => {
    const { container } = render(<StarRating avg={4.5} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the average to one decimal place", () => {
    render(<StarRating avg={4.25} count={12} />);
    expect(screen.getByText("4.3")).toBeInTheDocument();
  });

  it("renders an integer average with a trailing .0", () => {
    render(<StarRating avg={5} count={3} />);
    expect(screen.getByText("5.0")).toBeInTheDocument();
  });

  it("renders the localized review count", () => {
    render(<StarRating avg={4} count={7} />);
    expect(screen.getByText("(7 ביקורות)")).toBeInTheDocument();
  });

  it("shows the star glyph", () => {
    render(<StarRating avg={4} count={1} />);
    expect(screen.getByText("⭐")).toBeInTheDocument();
  });
});
