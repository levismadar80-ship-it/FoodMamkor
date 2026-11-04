/**
 * MEH-1687 batch D (ruling «⚖️ 03/11» §2) — holiday glyphs are Phosphor icons,
 * not colour emoji. Zero emoji in the holiday UI.
 *
 * lib/holidays.js sits outside NoEmojiInComponents' scan (lib/ is "data"), and
 * its emoji reached the home banner and the dashboard hint through `.emoji`.
 * This guard closes that path: no emoji in the data file, no `.emoji` read in
 * the two consumers, no {emoji} slot in the banner string, and every holiday
 * names an icon that resolves to a real Phosphor component (not the fallback).
 *
 * Controls: the emoji regex must match a known emoji (so a broken matcher
 * cannot pass as clean), and HOLIDAYS must be non-empty.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { HOLIDAYS } from "../lib/holidays";
import HolidayIcon, { HOLIDAY_ICONS } from "../components/HolidayIcon";
import he from "../messages/he.json";
import en from "../messages/en.json";

const ROOT = path.resolve(__dirname, "..");
const EMOJI = /\p{Extended_Pictographic}/u;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("MEH-1687 D — holiday icons are Phosphor, not emoji", () => {
  it("controls: the matcher sees an emoji and HOLIDAYS is populated", () => {
    expect(EMOJI.test("🫓"), "matcher control").toBe(true);
    expect(Object.keys(HOLIDAYS).length).toBeGreaterThanOrEqual(6);
  });

  it("lib/holidays.js carries no emoji and no `emoji` field", () => {
    const src = code(read("lib/holidays.js"));
    expect(EMOJI.test(src), "emoji codepoint in lib/holidays.js").toBe(false);
    for (const [key, h] of Object.entries(HOLIDAYS)) {
      expect(h.emoji, `${key}.emoji`).toBeUndefined();
    }
  });

  it("every holiday names an icon that resolves (no silent Sparkle by typo)", () => {
    for (const [key, h] of Object.entries(HOLIDAYS)) {
      expect(HOLIDAY_ICONS[h.icon], `${key}.icon = ${h.icon}`).toBeTruthy();
    }
  });

  it("the consumers no longer read `.emoji`, and the banner string has no {emoji} slot", () => {
    for (const rel of ["components/HolidayBanner.jsx", "app/[locale]/producer/dashboard/page.js"]) {
      expect(code(read(rel)), rel).not.toMatch(/\.emoji\b/);
    }
    expect(he.group_buys.holiday_banner.approaching).not.toMatch(/\{emoji\}/);
    expect(en.group_buys.holiday_banner.approaching).not.toMatch(/\{emoji\}/);
  });

  it("HolidayIcon renders a regular-weight svg in text-primary, Sparkle on an unknown name", () => {
    const { container, rerender } = render(<HolidayIcon name="Cheese" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("class")).toMatch(/\btext-primary\b/);
    expect(svg.dataset.holidayIcon).toBe("Cheese");
    rerender(<HolidayIcon name="NoSuchIcon" />);
    expect(container.querySelector("svg").dataset.holidayIcon).toBe("Sparkle");
  });
});
