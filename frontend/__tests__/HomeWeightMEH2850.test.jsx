/**
 * MEH-2850 (Sapir 08/11: shrink the home page under the 1.30MB Lighthouse
 * budget, nothing visible may change).
 *  A) The hero photo: on /he below 640px an image-set gives every device at
 *     least the pixels it displays (1x w_828 · 2x w_1600 · 3x w_1920); 640px
 *     and up, and /en everywhere (taller band), keep the w_1920 url. Same
 *     Cloudinary transform (c_fill,g_auto,ar_16:9).
 *  B) Heebo-latin is no longer preloaded; every other face, Cormorant
 *     included, keeps next/font's default preload.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/components/EnSearchNotice", () => ({ default: () => null }));
vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("framer-motion", () => {
  const strip = ({ children, initial, animate, whileInView, viewport, transition, ...p }, Tag) => (
    <Tag {...p}>{children}</Tag>
  );
  return {
    MotionConfig: ({ children }) => <>{children}</>,
    motion: { div: (p) => strip(p, "div"), h1: (p) => strip(p, "h1"), p: (p) => strip(p, "p") },
  };
});
vi.mock("@/components/HeroSearch", () => ({ default: () => <div data-testid="hero-search" /> }));

import { HomeHero, HERO_IMAGE, HERO_IMAGE_SET_PHONE } from "@/app/[locale]/home/HomeHero";

const TRANSFORM = "f_auto,q_auto,c_fill,g_auto,ar_16:9";

describe("MEH-2850 A — hero photo sized to the phone, unchanged from 640px", () => {
  it("the wide image is the same w_1920 url as before", () => {
    expect(HERO_IMAGE).toContain(`/upload/${TRANSFORM},w_1920/home/hero-produce.jpg`);
  });

  it("the phone set: 1x w_828, 2x w_1600, 3x w_1920 — same image, same crop", () => {
    // Prefixed: inside a custom property an unsupported value computes to none.
    expect(HERO_IMAGE_SET_PHONE.startsWith("-webkit-image-set(")).toBe(true);
    const pairs = [...HERO_IMAGE_SET_PHONE.matchAll(/url\("([^"]+)"\)\s+(\d)x/g)].map((m) => [m[2], m[1]]);
    expect(pairs.map(([x]) => x)).toEqual(["1", "2", "3"]);
    const width = Object.fromEntries(pairs.map(([x, u]) => [x, Number(/,w_(\d+)\//.exec(u)[1])]));
    expect(width).toEqual({ 1: 828, 2: 1600, 3: 1920 });
    for (const [, u] of pairs) expect(u).toContain(`/upload/${TRANSFORM},w_`);
    for (const [, u] of pairs) expect(u).toMatch(/\/home\/hero-produce\.jpg$/);
    // Why these widths: on /he below 640px the photo is shown ≤746 CSS px
    // (704 cover width × 1.06 Ken Burns), measured 08/11 at 320–639px.
  });

  it("the layer reads both through CSS variables; the class picks the phone set below 640px, /he only", () => {
    render(<HomeHero onSubmit={() => {}} onNearMe={() => {}} />);
    const layer = screen.getByTestId("hero-image-layer");
    // No inline background-image: it would outrank the phone class.
    expect(layer.style.backgroundImage).toBe("");
    expect(layer.style.getPropertyValue("--hero-bg")).toBe(`url(${HERO_IMAGE})`);
    expect(layer.style.getPropertyValue("--hero-phone")).toBe(HERO_IMAGE_SET_PHONE);
    const cls = layer.className.split(/\s+/);
    expect(cls).toEqual(
      expect.arrayContaining([
        "[background-image:var(--hero-bg)]",
        "max-[639px]:[html[lang=he]_&]:[background-image:var(--hero-phone)]",
      ]),
    );
    // No ungated phone class: /en (lang="en") must keep --hero-bg.
    expect(cls).not.toContain("max-[639px]:[background-image:var(--hero-phone)]");
  });
});

describe("MEH-2850 B — only Heebo-latin, never requested on the home page, loses its preload", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../app/fonts.js"), "utf8");
  /** The `{...}` argument of `export const <name> = localFont(`. */
  const callOf = (name) => {
    const at = src.indexOf(`export const ${name} = localFont(`);
    expect(at, `control: ${name} is declared`).toBeGreaterThan(-1);
    let i = src.indexOf("{", at);
    let depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      if (src[i] === "}" && --depth === 0) break;
    }
    return src.slice(start, i + 1);
  };
  it.each(["heeboLatin"])("%s: preload false", (name) => {
    expect(callOf(name)).toMatch(/\bpreload:\s*false\b/);
  });
  // cormorantGaramond is drawn on `/` (event times, rescue prices, the account
  // sheet's language toggle): without its preload that text flashed in the
  // fallback face — a visible change, so it stays preloaded.
  it.each(["frankRuhlLibre", "frankRuhlLibreLatin", "dmSans", "heebo", "cormorantGaramond"])("%s: still preloaded (no preload: false)", (name) => {
    expect(callOf(name)).not.toMatch(/\bpreload:\s*false\b/);
  });
});
