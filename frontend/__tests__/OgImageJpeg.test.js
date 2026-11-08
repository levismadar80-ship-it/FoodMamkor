/**
 * MEH-2827 PR 6 — the share preview image is a light JPEG with explicit
 * width/height/type, so WhatsApp does not drop it (the PNG was 1.26 MB).
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
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
const MAX_BYTES = 300 * 1024;

describe("share preview image (MEH-2827 PR 6)", () => {
  for (const [locale, file] of [["he", "og-image.jpg"], ["en", "og-image-en.jpg"]]) {
    it(`${locale}: og:image is ${file}, 1200×630, image/jpeg, alt = the site title`, async () => {
      const { generateMetadata } = await import("@/app/[locale]/layout");
      const m = await generateMetadata({ params: Promise.resolve({ locale }) });
      const [img] = m.openGraph.images;
      expect(img.url.endsWith(`/${file}`), img.url).toBe(true);
      expect(img.width).toBe(1200);
      expect(img.height).toBe(630);
      expect(img.type).toBe("image/jpeg");
      expect(img.alt).toBe(MESSAGES[locale].seo.site.title);
      expect(m.twitter.images[0].endsWith(`/${file}`)).toBe(true);
    });

    it(`${file} is a real JPEG under 300 KB, 1200×630`, () => {
      const buf = fs.readFileSync(path.join(PUBLIC, file));
      expect(buf.length).toBeLessThan(MAX_BYTES);
      expect([...buf.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
      // Walk the JPEG markers to the first SOF frame header for the size.
      let i = 2;
      let size = null;
      while (i < buf.length) {
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc3) {
          size = { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
          break;
        }
        i += 2 + len;
      }
      expect(size).toEqual({ w: 1200, h: 630 });
    });
  }

  it("the PNGs stay, so previews already shared keep their image", () => {
    for (const f of ["og-image.png", "og-image-en.png"]) expect(fs.existsSync(path.join(PUBLIC, f)), f).toBe(true);
  });
});
