import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SectionHeading, { SECTION_HEADING_CLASSES } from "@/components/ui/SectionHeading";

describe("SectionHeading (MEH-3020)", () => {
  it("renders an h2 at the headline-lg step", () => {
    render(<SectionHeading>כותרת</SectionHeading>);
    const h = screen.getByRole("heading", { level: 2, name: "כותרת" });
    for (const c of ["font-headline-lg", "text-headline-lg", "font-black"]) expect(h.className).toContain(c);
    expect(h.className).toBe(SECTION_HEADING_CLASSES);
  });
  it("appends layout classes and forwards props", () => {
    render(<SectionHeading id="s" className="mb-4">x</SectionHeading>);
    const h = document.getElementById("s");
    expect(h.className).toBe(`${SECTION_HEADING_CLASSES} mb-4`);
  });
});

describe("SectionHeading roles (MEH-3020)", () => {
  it("content role is the 24px / 700 step", () => {
    render(<SectionHeading size="content" id="c">x</SectionHeading>);
    expect(document.getElementById("c").className).toBe("font-headline-md text-2xl font-bold text-text");
  });
  it("a colour class replaces the default ink; a size-looking class does not", () => {
    render(<SectionHeading size="content" id="m" className="text-fg-muted mb-4">x</SectionHeading>);
    expect(document.getElementById("m").className).toBe("font-headline-md text-2xl font-bold text-fg-muted mb-4");
    render(<SectionHeading id="k" className="text-center">x</SectionHeading>);
    expect(document.getElementById("k").className).toContain("text-text");
  });
});
