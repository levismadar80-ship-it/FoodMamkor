// @ts-check
/**
 * MEH-3113 — the «מה קורה» hero stays a low band so the list starts in the
 * first screen. Reads the source: any fixed or minimum height above 200px on
 * the hero section, or a fixed `h-` (which clips at 200% text), fails.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(path.join(__dirname, "..", "components", "HubShell.jsx"), "utf8");
const HERO_MAX_PX = 200;

function heroClass() {
  const m = SRC.match(/data-testid="hub-hero"\s+className="([^"]+)"/);
  if (!m) throw new Error("hub-hero section not found in HubShell.jsx");
  return m[1];
}

describe("HubShell hero height (MEH-3113)", () => {
  it("has no fixed height class (it must grow at 200% text)", () => {
    expect(heroClass()).not.toMatch(/(^|\s)(md:)?h-\[/);
  });
  it("keeps every min-height at or under 200px", () => {
    const sizes = [...heroClass().matchAll(/min-h-\[(\d+)px\]/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    for (const px of sizes) expect(px).toBeLessThanOrEqual(HERO_MAX_PX);
  });
});

describe("HubShell hero scrim (MEH-3113)", () => {
  it("never drops below 0.6 alpha, because the text now fills the low band", () => {
    const m = SRC.match(/const HERO_SCRIM =([\s\S]*?);/);
    if (!m) throw new Error("HERO_SCRIM not found in HubShell.jsx");
    const alphas = [...m[1].matchAll(/\/\s*([\d.]+)\)/g)].map((a) => Number(a[1]));
    expect(alphas.length).toBeGreaterThan(2);
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0.6);
  });
});
