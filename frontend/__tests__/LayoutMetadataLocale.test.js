/**
 * MEH-2774 — the root layout's metadata is per locale: /en gets English
 * keywords and title, and no Hebrew SITE_TITLE leaks in as a fallback.
 */
import { describe, it, expect, vi } from "vitest";
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

const HEBREW = /[א-ת]/;

describe("root layout metadata per locale", () => {
  it("en: English title, keywords, og and twitter titles", async () => {
    const { generateMetadata } = await import("@/app/[locale]/layout");
    const m = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(m.title.default).toBe(en.seo.site.title);
    expect(m.title.template).toBe("%s | Mehamakor");
    // MEH-2853: the layout no longer carries og / twitter titles (a page that
    // inherits them would show the home title). Next fills both from the
    // page's <title>; on /en home that is the English title, equal to the
    // og_title / twitter_title strings, so the /en card stays English.
    expect(m.openGraph.title).toBeUndefined();
    expect(m.twitter.title).toBeUndefined();
    expect(m.title.default).toBe(en.seo.site.og_title);
    expect(m.title.default).toBe(en.seo.site.twitter_title);
    const nonBrand = m.keywords.filter((k) => k !== "מהמקור");
    expect(nonBrand.length).toBeGreaterThan(0);
    for (const k of nonBrand) expect(k, k).not.toMatch(HEBREW);
  });

  it("he: the same Hebrew keywords as before", async () => {
    const { generateMetadata } = await import("@/app/[locale]/layout");
    const m = await generateMetadata({ params: Promise.resolve({ locale: "he" }) });
    expect(m.title.default).toBe(he.seo.site.title);
    expect(m.title.template).toBe("%s | מהמקור");
    expect([...m.keywords].sort()).toEqual(
      ["מוצרים מקומיים", "grass-fed", "אוכל בריא", "אוכל אורגני", "בעלי עסק ישראלים", "מהמקור", "שוק איכרים"].sort(),
    );
  });
});
