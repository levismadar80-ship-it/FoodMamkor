import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import BrandLoader from "@/components/BrandLoader";

/**
 * MEH-2599 — BrandLoader contract.
 *
 * Shown failing (29/10) by rendering a `<p>` with the label as visible text:
 * "no visible text" went red; by dropping role="status": the a11y query went
 * red; by rendering one seed: the count went red. Restored → green.
 */
describe("BrandLoader", () => {
  it("announces the label to assistive tech only — no visible copy", () => {
    render(<BrandLoader label="טוען…" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    const announced = status.querySelector(".sr-only");
    expect(announced).toHaveTextContent("טוען…");
    // Everything outside the sr-only span is decorative markup, never words.
    const visible = Array.from(status.childNodes).filter((n) => n !== announced);
    expect(visible.map((n) => n.textContent).join("")).toBe("");
  });

  it("draws the five seeds of the mark, hidden from the a11y tree", () => {
    const { container } = render(<BrandLoader label="טוען…" />);
    const svg = container.querySelector("svg.brand-loader-mark");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".brand-loader-seed")).toHaveLength(5);
  });

  it("passes a data-testid through for specs that gate on the wait state", () => {
    render(<BrandLoader label="טוען…" testId="claim-loading" />);
    expect(screen.getByTestId("claim-loading")).toHaveTextContent("טוען…");
  });
});
