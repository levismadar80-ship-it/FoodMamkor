import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, act } from "@testing-library/react";
import SeedBurst from "@/components/brand/SeedBurst";
import { SEEDS_DARK, SEEDS_LIGHT } from "@/lib/brand-seeds";

/**
 * MEH-2833 PR 6 (seed layer, board 5 v2) — the success moment: the logo at the
 * centre, two rings of single seeds pointing outward (outer at ~65%), opening
 * once from the centre; reduced motion → the final state, no movement.
 */

const mm = (reduce) => {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: reduce && q.includes("prefers-reduced-motion"),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
};
afterEach(() => vi.restoreAllMocks());

describe("SeedBurst", () => {
  it("dark: the on-dark bloom + two rings of on-dark seeds (7 + 10: open below); outer at 65%; aria-hidden", async () => {
    mm(false);
    window.requestAnimationFrame = (cb) => { cb(0); return 1; };
    window.cancelAnimationFrame = () => {};
    const { container } = render(<SeedBurst variant="dark" />);
    const box = container.querySelector('[data-testid="seed-burst"]');
    expect(box.getAttribute("aria-hidden")).toBe("true");
    expect(box.querySelector('svg[data-seed-mark="dark"]')).not.toBeNull();
    const inner = box.querySelectorAll('[data-burst-ring="0"]');
    const outer = box.querySelectorAll('[data-burst-ring="1"]');
    expect([inner.length, outer.length]).toEqual([7, 10]);
    const fills = new Set([...box.querySelectorAll("[data-burst-ring] svg")].map((s) => s.getAttribute("data-seed-color")));
    for (const f of fills) expect(SEEDS_DARK.map((s) => s.fill)).toContain(f);
    await act(async () => {});
    expect(box.getAttribute("data-open")).toBe("true");
    expect(outer[0].style.opacity).toBe("0.65");
    expect(inner[0].style.opacity).toBe("1");
    // each seed is rotated to its ring angle, so its round end points outward
    expect(inner[2].querySelector("svg g").getAttribute("transform")).toBe("rotate(90 0 -25)");
  });

  it("opens from the centre: first paint collapsed, then the rings move out (600ms transition)", () => {
    mm(false);
    let queued = null;
    window.requestAnimationFrame = (cb) => { queued = cb; return 1; };
    window.cancelAnimationFrame = () => {};
    const { container } = render(<SeedBurst />);
    const seed = container.querySelector('[data-burst-ring="0"]');
    expect(seed.style.transform).toBe("translate(0, 0)");
    expect(seed.style.opacity).toBe("0");
    expect(seed.style.transition).toContain("600ms");
    act(() => queued(0));
    expect(seed.style.transform).not.toBe("translate(0, 0)");
  });

  it("prefers-reduced-motion: the final state from the first paint (no collapsed frame)", () => {
    mm(true);
    window.requestAnimationFrame = vi.fn(() => 1);
    const { container } = render(<SeedBurst />);
    expect(container.querySelector('[data-testid="seed-burst"]').getAttribute("data-open")).toBe("true");
    expect(container.querySelector('[data-burst-ring="0"]').style.transform).not.toBe("translate(0, 0)");
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("open below the bloom, where the headline sits: no seed within 40° of straight down", () => {
    mm(true);
    const { container } = render(<SeedBurst />);
    const seeds = [...container.querySelectorAll("[data-burst-ring]")];
    expect(seeds).toHaveLength(17);
    for (const s of seeds) {
      const [x, y] = s.style.transform.match(/-?[\d.]+/g).map(Number);
      // the angle from straight down, measured on the rendered offset
      const fromDown = (Math.atan2(Math.abs(x), y) * 180) / Math.PI;
      expect(fromDown, s.getAttribute("data-angle")).toBeGreaterThanOrEqual(40);
    }
  });

  it("light variant uses the light set", () => {
    mm(true);
    const { container } = render(<SeedBurst variant="light" />);
    const fills = [...container.querySelectorAll("[data-burst-ring] svg")].map((s) => s.getAttribute("data-seed-color"));
    for (const f of fills) expect(SEEDS_LIGHT.map((s) => s.fill)).toContain(f);
  });
});

describe("placements", () => {
  const src = (rel) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
  it("group buy funded: SeedBurst dark in the funded banner; the canvas confetti is gone", () => {
    const s = src("app/[locale]/group-buys/[id]/GroupBuyDetailClient.jsx");
    expect(s).toMatch(/data-testid="group-buy-funded"[\s\S]{0,400}<SeedBurst variant="dark" \/>/);
    expect(s).not.toMatch(/Confetti|<canvas/);
  });
  it("/recommend: SeedBurst light above the success panel", () => {
    const s = src("app/[locale]/recommend/RecommendClient.jsx");
    expect(s).toMatch(/<SeedBurst variant="light"[^>]*\/>\s*<div className="text-center" data-testid="recommend-success">/);
  });
});
