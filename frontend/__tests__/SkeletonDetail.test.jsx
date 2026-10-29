import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SkeletonDetail } from "@/components/Skeleton";

/**
 * MEH-2606 — detail-page skeleton. Shown failing (29/10): `hero={false}`
 * still rendered the hero band → red; sr-only label dropped → red; restored
 * → green.
 */
describe("SkeletonDetail", () => {
  it("draws the hero band by default and keeps the label sr-only", () => {
    const { container } = render(<SkeletonDetail label="טעינת החוויה..." />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status").querySelector(".sr-only")).toHaveTextContent("טעינת החוויה...");
    expect(container.querySelector('[data-skeleton="hero"]')).not.toBeNull();
  });

  it("hero={false} drops the band and nothing else", () => {
    const { container } = render(<SkeletonDetail hero={false} label="טעינת הרכישה..." />);
    expect(container.querySelector('[data-skeleton="hero"]')).toBeNull();
    expect(container.querySelectorAll(".skeleton-box")).toHaveLength(6);
  });
});
