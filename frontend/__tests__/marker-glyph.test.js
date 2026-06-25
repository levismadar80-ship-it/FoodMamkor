import { describe, it, expect } from "vitest";
import { Leaf, Cow, Cheese } from "@phosphor-icons/react";
import { categoryGlyphSvg } from "@/lib/marker-glyph";

// MEH-936: guards the no-image marker glyph path. A Phosphor icon rename or a
// broken map-categories `icon` field would otherwise silently blank every
// no-image pin with no automated signal (the divIcon renders in the browser,
// invisible to CI). Pure util — no Leaflet import needed.
describe("categoryGlyphSvg (MEH-936)", () => {
  it("renders a Phosphor icon to non-empty <svg> markup", () => {
    const svg = categoryGlyphSvg(Leaf);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.length).toBeGreaterThan(0);
  });

  it("applies the white fill colour", () => {
    expect(categoryGlyphSvg(Cheese)).toContain("#ffffff");
  });

  it("memoizes by component reference (identical string instance per icon)", () => {
    expect(categoryGlyphSvg(Cow)).toBe(categoryGlyphSvg(Cow));
  });

  it("returns distinct markup for distinct icons", () => {
    expect(categoryGlyphSvg(Leaf)).not.toBe(categoryGlyphSvg(Cow));
  });
});
