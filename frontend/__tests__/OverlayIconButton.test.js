/**
 * MEH-3115 — every icon-only button that sits on a photo shares ONE anatomy:
 * a 44px button with a 32px face inside it (lib/overlay-icon-button.js).
 *
 * Before this card each component carried its own copy of a 44px
 * `shadow-lg` circle string, and the bell beside the heart was green while
 * off. The source walk below fails if any of the photo variants stops
 * importing the shared anatomy, or if that exact old class string comes back
 * under components/ or app/. It does NOT catch a new circle written with a
 * different class string — review still owns that.
 *
 * Corpus control: the walk must find the five owners by name, so a
 * mis-rooted walk cannot pass as clean.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  OVERLAY_ICON_BUTTON,
  OVERLAY_ICON_FACE,
  overlayIconInk,
} from "@/lib/overlay-icon-button";

const ROOT = path.resolve(__dirname, "..");
const OWNERS = [
  "components/FavoriteButton.jsx",
  "components/ShareButton.jsx",
  "components/ProducerUpdatesButton.jsx",
  "components/SaveButton.jsx",
];
const OLD_CIRCLE = /bg-surface\/95 hover:bg-surface rounded-full w-11 h-11[^"`]*shadow-lg/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("MEH-3115 · overlay icon anatomy", () => {
  it("button is the 44px hit area, face is the 32px circle", () => {
    expect(OVERLAY_ICON_BUTTON).toMatch(/\bw-11 h-11\b/);
    expect(OVERLAY_ICON_FACE).toMatch(/\bw-8 h-8\b/);
    expect(OVERLAY_ICON_FACE).toMatch(/\brounded-full\b/);
    expect(OVERLAY_ICON_FACE).not.toMatch(/shadow-lg/);
  });

  it("off ink is the text colour, on ink is primary", () => {
    expect(overlayIconInk(false)).toBe("text-text");
    expect(overlayIconInk(true)).toBe("text-primary");
  });

  it.each(OWNERS)("%s imports the shared anatomy", (rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    expect(src).toMatch(/from "@\/lib\/overlay-icon-button"/);
    expect(src).toMatch(/OVERLAY_ICON_FACE/);
  });

  it("the old heavy 44px circle is gone from components/ and app/", () => {
    const files = [...walk(path.join(ROOT, "components")), ...walk(path.join(ROOT, "app"))];
    const names = files.map((f) => path.relative(ROOT, f));
    for (const o of OWNERS) expect(names).toContain(o); // corpus control
    const hits = files.filter((f) => OLD_CIRCLE.test(fs.readFileSync(f, "utf8")));
    expect(hits.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});
