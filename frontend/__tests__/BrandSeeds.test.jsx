/**
 * MEH-2833 PR 1 — the seed layer's one source (lib/brand-seeds.js) and its two
 * marks. The light set is checked against public/logo.svg itself, so the
 * module cannot drift from the logo; BrandLoader must render exactly what it
 * rendered before (the logo's fills + highlights at the logo's rotations).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import {
  SEED_PATH,
  SEED_ORDER,
  SEED_ROTATIONS,
  SEEDS_LIGHT,
  SEEDS_DARK,
  SEED_FILLS,
  seedColorFor,
} from "@/lib/brand-seeds";
import SeedMark from "@/components/brand/SeedMark";
import Seed from "@/components/brand/Seed";
import BrandLoader from "@/components/BrandLoader";

const LOGO = fs.readFileSync(path.resolve(__dirname, "../public/logo.svg"), "utf8");
// Each <g transform="rotate(N)"> in logo.svg → [N, fill, highlight fill, highlight opacity]
const LOGO_SEEDS = [...LOGO.matchAll(/rotate\((\d+)\)[\s\S]*?fill="(#[0-9A-Fa-f]{6})"[\s\S]*?<ellipse[^>]*fill="(#[0-9A-Fa-f]{6})" opacity="([\d.]+)"/g)].map(
  (m) => [Number(m[1]), m[2], m[3], Number(m[4])],
);

describe("lib/brand-seeds", () => {
  it("the light set, order and rotations are the logo's, verbatim", () => {
    expect(LOGO_SEEDS).toHaveLength(5);
    expect(LOGO.split(SEED_PATH).length - 1).toBe(5);
    expect(SEED_ORDER).toEqual(["green", "terracotta", "gold", "sand", "sage"]);
    expect(SEEDS_LIGHT.map((s) => s.name)).toEqual(SEED_ORDER);
    expect(SEEDS_LIGHT.map((s, i) => [SEED_ROTATIONS[i], s.fill, s.highlight, s.highlightOpacity])).toEqual(LOGO_SEEDS);
    expect(SEED_FILLS).toEqual(LOGO_SEEDS.map((s) => s[1]));
  });

  it("the on-dark set is the approved table (DESIGN.md «Seed layer»), same order", () => {
    expect(SEEDS_DARK.map((s) => [s.name, s.fill])).toEqual([
      ["green", "#F5F0E8"],
      ["terracotta", "#E8823A"],
      ["gold", "#E0B266"],
      ["sand", "#D9C8B0"],
      ["sage", "#8FB89F"],
    ]);
    const design = fs.readFileSync(path.resolve(__dirname, "../../docs/DESIGN.md"), "utf8");
    for (const s of SEEDS_DARK) expect(design).toContain(`\`${s.fill}\``);
  });

  it("seedColorFor: stable per id, always a light seed, never sand", () => {
    const ids = ["", null, undefined, 0, 1, "a", "b", "ruach-hasadeh", "48a62a03-58c4-463b-82f4-cdba3b4701c9", "מאפיית רוח השדה"];
    for (let i = 0; i < 200; i += 1) ids.push(`id-${i}`);
    const seen = new Set();
    for (const id of ids) {
      const a = seedColorFor(id);
      expect(seedColorFor(id)).toBe(a);
      expect(SEEDS_LIGHT).toContain(a);
      expect(a.name).not.toBe("sand");
      seen.add(a.name);
    }
    // 210 ids spread over all four pickable seeds, not one.
    expect([...seen].sort()).toEqual(["gold", "green", "sage", "terracotta"]);
  });
});

describe("SeedMark (the bloom)", () => {
  it("light: five seeds in logo order at the logo's rotations, aria-hidden", () => {
    const { container } = render(<SeedMark size={30} />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("30");
    const seeds = [...svg.querySelectorAll("[data-seed]")];
    expect(seeds.map((p) => p.getAttribute("data-seed"))).toEqual(SEED_ORDER);
    expect(seeds.map((p) => p.getAttribute("fill"))).toEqual(SEED_FILLS);
    expect([...svg.querySelectorAll("g")].map((g) => g.getAttribute("transform"))).toEqual(SEED_ROTATIONS.map((d) => `rotate(${d})`));
  });

  it("dark: the on-dark fills, same order and rotations (the logo is never rearranged)", () => {
    const { container } = render(<SeedMark variant="dark" />);
    const fills = [...container.querySelectorAll("[data-seed]")].map((p) => p.getAttribute("fill"));
    expect(fills).toEqual(SEEDS_DARK.map((s) => s.fill));
  });
});

describe("Seed (one seed)", () => {
  it("2:3, rotated about its own centre, aria-hidden", () => {
    const { container } = render(<Seed color="#C8632E" size={40} rotate={-36} />);
    const svg = container.querySelector("svg");
    expect([svg.getAttribute("width"), svg.getAttribute("height")]).toEqual(["40", "60"]);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("g").getAttribute("transform")).toBe("rotate(-36 0 -25)");
    expect(svg.querySelector("path").getAttribute("fill")).toBe("#C8632E");
    expect(svg.querySelector("ellipse")).toBeNull();
  });

  it("highlight draws the logo's inner highlight for a light seed", () => {
    const { container } = render(<Seed color="#5A8F73" highlight />);
    const e = container.querySelector("ellipse");
    expect(e.getAttribute("fill")).toBe("#A3C7B3");
  });
});

describe("BrandLoader — unchanged", () => {
  it("renders the logo's five seeds: rotations, fills and highlights exactly as public/logo.svg", () => {
    const { container } = render(<BrandLoader label="טוען" />);
    const groups = [...container.querySelectorAll(".brand-loader-mark > g")];
    const got = groups.map((g) => {
      const deg = Number(g.getAttribute("transform").match(/rotate\((\d+)\)/)[1]);
      const fill = g.querySelector("path").getAttribute("fill");
      const e = g.querySelector("ellipse");
      return [deg, fill, e.getAttribute("fill"), Number(e.getAttribute("opacity"))];
    });
    expect(got).toEqual(LOGO_SEEDS);
    expect(container.querySelectorAll(".brand-loader-seed")).toHaveLength(5);
  });
});
