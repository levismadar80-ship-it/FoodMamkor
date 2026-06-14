import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Heading from "@/components/ui/Heading";

// ui/Heading maps a numeric level to a semantic h1–h4 tag (MEH-602).
describe("ui/Heading", () => {
  it("renders an <h2> by default", () => {
    render(<Heading>כותרת</Heading>);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "כותרת",
    );
  });

  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
  ])("level=%i renders an h%i", (level, expected) => {
    render(<Heading level={level}>x</Heading>);
    expect(screen.getByRole("heading", { level: expected })).toBeInTheDocument();
  });

  it("falls back to h2 for an out-of-range level", () => {
    render(<Heading level={9}>x</Heading>);
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  it("applies the editorial font by default", () => {
    render(<Heading>x</Heading>);
    expect(screen.getByRole("heading").className).toContain("font-headline-md");
  });

  it("hero variant uses the display size regardless of level but keeps the semantic tag", () => {
    render(
      <Heading level={3} variant="hero">
        מהמקור
      </Heading>,
    );
    const h = screen.getByRole("heading", { level: 3 });
    expect(h.className).toContain("text-headline-display");
    expect(h.className).toContain("font-headline-display");
  });

  it("sans variant uses the body font face", () => {
    render(<Heading variant="sans">x</Heading>);
    expect(screen.getByRole("heading").className).toContain("font-body-lg");
  });

  it("merges a custom className", () => {
    render(<Heading className="tint-gold">x</Heading>);
    expect(screen.getByRole("heading").className).toContain("tint-gold");
  });

  it("forwards arbitrary props (e.g. id) to the tag", () => {
    render(<Heading id="section-title">x</Heading>);
    expect(screen.getByRole("heading")).toHaveAttribute("id", "section-title");
  });
});
