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
