/**
 * MEH-2834 PR 1 — the mark outside the page: an SVG favicon first, the iPhone
 * icon on the brand cream (opaque), and a one-colour silhouette for Android's
 * notification badge + the manifest's "monochrome" icon.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { createTranslator } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

const MESSAGES = { he, en };
vi.mock("../app/globals.css", () => ({}));
vi.mock("@/app/fonts", () => ({ FONT_VARIABLES: "" }));
vi.mock("../app/fonts", () => ({ FONT_VARIABLES: "" }));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }) => createTranslator({ locale, messages: MESSAGES[locale], namespace }),
  getMessages: async () => ({}),
  setRequestLocale: () => {},
}));
for (const m of [
  "@/components/Header", "@/components/VerifyBanner", "@/components/FooterSlot", "@/components/BottomNav",
  "@/components/Toaster", "@/components/CookieBanner", "@/components/IosViewportPin",
  "@/components/SmoothScrollProvider", "@/components/CustomCursor", "@/components/ChatWidgetLazy",
  "@/components/InstallPrompt", "@/components/PrehydrationInputReplay", "@/components/ClarityScript",
  "@/components/SpeedInsightsRedacted",
]) vi.doMock(m, () => ({ default: () => null }));

const PUBLIC = path.resolve(__dirname, "../public");
const png = (f) => PNG.sync.read(fs.readFileSync(path.join(PUBLIC, f)));
const SEED_PATH = "M 0,-44 C 10,-44 13,-32 11,-20 C 9,-12 5,-8 0,-6 C -5,-8 -9,-12 -11,-20 C -13,-32 -10,-44 0,-44 Z";

describe("favicon (SVG first)", () => {
  it("layout serves /favicon.svg first, and keeps the ICO + PNGs", async () => {
    const { generateMetadata } = await import("@/app/[locale]/layout");
    const m = await generateMetadata({ params: Promise.resolve({ locale: "he" }) });
    const urls = m.icons.icon.map((i) => i.url);
    expect(m.icons.icon[0]).toEqual({ url: "/favicon.svg", type: "image/svg+xml" });
    expect(urls).toEqual(expect.arrayContaining(["/favicon.ico", "/icon-192.png", "/icon-512.png"]));
  });

  it("favicon.svg is the logo mark: same viewBox and the five seeds, no text", () => {
    const svg = fs.readFileSync(path.join(PUBLIC, "favicon.svg"), "utf8");
    expect(svg).toContain('viewBox="-60 -60 120 120"');
    expect(svg.split(SEED_PATH).length - 1).toBe(5);
    for (const c of ["#2E6853", "#C8632E", "#C99846", "#D9C8B0", "#5A8F73"]) expect(svg).toContain(c);
    expect(svg).not.toMatch(/<text|<title|<desc/);
  });
});

describe("iPhone home-screen icon", () => {
  it("is 180×180, opaque, on the brand cream #F5F0E8 (the same cream as icon-512)", () => {
    const img = png("apple-touch-icon.png");
    expect([img.width, img.height]).toEqual([180, 180]);
    let transparent = 0;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 255) transparent++;
    expect(transparent).toBe(0);
    expect([...img.data.subarray(0, 3)]).toEqual([0xf5, 0xf0, 0xe8]);
    const ref = png("icon-512.png");
    expect([...ref.data.subarray(0, 3)]).toEqual([0xf5, 0xf0, 0xe8]);
  });
});

describe("notification badge + monochrome icon", () => {
  it("badge-96.png: 96×96, only white or fully transparent pixels, a drawn silhouette, an empty frame", () => {
    const img = png("badge-96.png");
    expect([img.width, img.height]).toEqual([96, 96]);
    let drawn = 0;
    let offWhite = 0;
    let frame = 0;
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 96; x++) {
        const i = (y * 96 + x) * 4;
        const a = img.data[i + 3];
        if (a === 0) continue;
        drawn++;
        if (img.data[i] !== 255 || img.data[i + 1] !== 255 || img.data[i + 2] !== 255) offWhite++;
        // ~10% padding: nothing drawn in the outer 4px frame
        if (x < 4 || x >= 92 || y < 4 || y >= 92) frame++;
      }
    }
    expect(offWhite).toBe(0);
    expect(frame).toBe(0);
    expect(drawn).toBeGreaterThan(96 * 96 * 0.15);
  });

  it("icon-monochrome.svg is the five seeds in one colour, listed in the manifest as monochrome", () => {
    const svg = fs.readFileSync(path.join(PUBLIC, "icon-monochrome.svg"), "utf8");
    expect(svg.split(SEED_PATH).length - 1).toBe(5);
    expect([...new Set(svg.match(/#[0-9A-Fa-f]{6}/g))]).toEqual(["#FFFFFF"]);
    const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, "manifest.json"), "utf8"));
    expect(manifest.icons).toContainEqual({ src: "/icon-monochrome.svg", sizes: "any", type: "image/svg+xml", purpose: "monochrome" });
  });

  it("the service worker uses the badge, and keeps the colour icon", () => {
    const sw = fs.readFileSync(path.join(PUBLIC, "sw.js"), "utf8");
    expect(sw).toMatch(/badge:\s*"\/badge-96\.png"/);
    expect(sw).toMatch(/icon:\s*"\/icon-192\.png"/);
    expect(sw).not.toMatch(/badge:\s*"\/icon-192\.png"/);
  });
});
