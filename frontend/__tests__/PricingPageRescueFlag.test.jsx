/**
 * MEH-3219 (B16) — the price list does not price rescue bags while the
 * rescue-bag pilot is off (production's default).
 *
 * The page is rendered with the real messages, once per flag state and
 * locale. The word list below is checked against the full copy first, so a
 * clean "off" render cannot mean "the word list matches nothing".
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import { RESCUE_COPY_KEYS, pricingCopyKey } from "../lib/pricing";

const MESSAGES = { he, en };
const BAG_WORDS = { he: /שקית|שקיות/, en: /\bbags?\b/i };

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async ({ locale, namespace }) =>
    createTranslator({ locale, namespace, messages: MESSAGES[locale] }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/BusinessCtaLink", () => ({ default: () => null }));
vi.mock("@/components/ClosingCtaBand", () => ({ default: () => null }));
vi.mock("@/components/ui/BackLink", () => ({ default: () => null }));
vi.mock("@/components/brand/SeedMark", () => ({ default: () => null }));

import PricingPage from "@/app/[locale]/join/pricing/page";

async function renderPage(locale, flag) {
  vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", flag);
  return renderToStaticMarkup(await PricingPage({ params: Promise.resolve({ locale }) }));
}

afterEach(() => vi.unstubAllEnvs());

describe("price list and the rescue-bag flag (MEH-3219)", () => {
  it.each(["he", "en"])("%s: bags on — the bag price is on the page", async (locale) => {
    const html = await renderPage(locale, "true");
    expect(html).toMatch(BAG_WORDS[locale]);
  });

  it.each(["he", "en"])("%s: bags off — no sentence on the page mentions a bag", async (locale) => {
    const html = await renderPage(locale, "false");
    expect(html.length).toBeGreaterThan(2000);
    expect(html).not.toMatch(BAG_WORDS[locale]);
  });

  it.each(["he", "en"])("%s: every bag sentence under pricing.page has a twin without bags", (locale) => {
    const page = MESSAGES[locale].pricing.page;
    const withBags = Object.keys(page).filter(
      (key) => !key.endsWith("_no_rescue") && BAG_WORDS[locale].test(page[key]),
    );
    // The one whole line that is only about bags is dropped, the rest are swapped.
    expect(withBags.sort()).toEqual([...RESCUE_COPY_KEYS, "fee_item_bag"].sort());
    for (const key of RESCUE_COPY_KEYS) {
      const twin = page[pricingCopyKey(key, false)];
      expect(twin, `${locale} ${key}_no_rescue`).toBeTypeOf("string");
      expect(twin).not.toMatch(BAG_WORDS[locale]);
      expect(pricingCopyKey(key, true)).toBe(key);
    }
    expect(pricingCopyKey("notice_body", false)).toBe("notice_body");
  });

  // The terms are one text for both flag states: they name the reduced
  // commission by what subscribers pay, never a per-bag fee.
  it.each(["he", "en"])("%s: the terms' pricing section names no bag fee", (locale) => {
    const section = MESSAGES[locale].terms.sections.pricing;
    expect(Object.keys(section).length).toBeGreaterThan(10);
    for (const [key, text] of Object.entries(section)) {
      expect(text, `${locale} terms.sections.pricing.${key}`).not.toMatch(BAG_WORDS[locale]);
    }
  });
});
