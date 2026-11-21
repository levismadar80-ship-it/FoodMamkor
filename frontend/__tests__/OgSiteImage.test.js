/**
 * MEH-3590 — a page with its own openGraph still shares an image, and the
 * site image is the light JPEG per locale. Behaviour: calls generateMetadata.
 */
import { describe, it, expect, vi } from "vitest";
import { createTranslator } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import { siteOgImageUrl } from "@/lib/og-site-image";

const MESSAGES = { he, en };
vi.mock("next-intl/server", () => ({
  getTranslations: async (arg) => {
    const namespace = typeof arg === "string" ? arg : arg?.namespace;
    const locale = (typeof arg === "object" && arg?.locale) || globalThis.__ogLocale || "he";
    return createTranslator({ locale, messages: MESSAGES[locale], namespace });
  },
  setRequestLocale: () => {},
}));

const GUIDES = ["business-story", "customer-messages", "product-photography"];

describe("siteOgImageUrl (MEH-3590)", () => {
  it("he → the Hebrew JPEG, en → the English JPEG, anything else → Hebrew", () => {
    expect(siteOgImageUrl("he")).toBe("/og-image.jpg");
    expect(siteOgImageUrl("en")).toBe("/og-image-en.jpg");
    expect(siteOgImageUrl(undefined)).toBe("/og-image.jpg");
  });
});

describe("business guides share with an image (MEH-3590)", () => {
  for (const guide of GUIDES) {
    for (const locale of ["he", "en"]) {
      it(`${guide} (${locale}): og:image is the ${locale} site image`, async () => {
        globalThis.__ogLocale = locale;
        const mod = await import(`@/app/[locale]/about/for-businesses/guides/${guide}/page.js`);
        const m = await mod.generateMetadata({ params: Promise.resolve({ locale }) });
        expect(m.openGraph.images).toEqual([siteOgImageUrl(locale)]);
      });
    }
  }
});
