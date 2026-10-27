/**
 * MEH-2311 — the footer links all four Mehamakor profiles, and they are the
 * same four the Organization JSON-LD declares in `sameAs`.
 *
 * Renders the real Footer under the real he/en messages, so the accessible
 * names asserted are the strings a screen reader announces. The expected
 * hrefs come from BRAND_SAME_AS (one owner), and the copy is pinned verbatim
 * because it was approved word for word (workflow rule 22).
 */
import { describe, it, expect, vi } from "vitest";
import { render, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import { BRAND_SAME_AS } from "@/lib/constants";
import Footer from "@/components/Footer";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => new Promise(() => {})), post: vi.fn() } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({ default: (props) => <img alt={props.alt ?? ""} {...props} /> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

const PROFILES = {
  instagram: "https://www.instagram.com/meha_makor",
  facebook: "https://www.facebook.com/mehamakor",
  tiktok: "https://www.tiktok.com/@mehamakor",
  youtube: "https://www.youtube.com/@Mehamakor",
};

const APPROVED = {
  he: {
    instagram_aria: "עמוד האינסטגרם של מהמקור — נפתח בחלון חדש",
    facebook_aria: "עמוד הפייסבוק של מהמקור — נפתח בחלון חדש",
    tiktok_aria: "עמוד הטיקטוק של מהמקור — נפתח בחלון חדש",
    youtube_aria: "ערוץ היוטיוב של מהמקור — נפתח בחלון חדש",
  },
  en: {
    instagram_aria: "Mehamakor's Instagram page — opens in new tab",
    facebook_aria: "Mehamakor's Facebook page — opens in new tab",
    tiktok_aria: "Mehamakor's TikTok page — opens in new tab",
    youtube_aria: "Mehamakor's YouTube channel — opens in new tab",
  },
};

function outboundLinks(locale, messages) {
  const { container } = render(
    <NextIntlClientProvider locale={locale} messages={messages} onError={() => {}}>
      <Footer />
    </NextIntlClientProvider>,
  );
  return [...container.querySelectorAll('footer a[href^="https://"]')];
}

describe("Footer social links (MEH-2311)", () => {
  it("sameAs holds the four canonical profiles, in order", () => {
    expect(BRAND_SAME_AS).toEqual([
      PROFILES.instagram,
      PROFILES.facebook,
      PROFILES.tiktok,
      PROFILES.youtube,
    ]);
  });

  it("the footer links exactly those four, each opening safely in a new tab", () => {
    const links = outboundLinks("he", he);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(BRAND_SAME_AS);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  // MEH-2417: Instagram joined the icon row — it no longer shows the handle,
  // and is named by its own approved sr-only label like the other three.
  it.each(["he", "en"])("%s: each link is a bare icon named by its approved sr-only label", (locale) => {
    const messages = locale === "he" ? he : en;
    for (const [key, text] of Object.entries(APPROVED[locale])) {
      expect(messages.nav.footer[key]).toBe(text);
    }
    const links = outboundLinks(locale, messages);
    const byHref = Object.fromEntries(links.map((a) => [a.getAttribute("href"), a]));
    expect(byHref[PROFILES.instagram].textContent).not.toContain("@meha_makor");
    for (const [name, key] of [
      ["instagram", "instagram_aria"],
      ["facebook", "facebook_aria"],
      ["tiktok", "tiktok_aria"],
      ["youtube", "youtube_aria"],
    ]) {
      const a = byHref[PROFILES[name]];
      expect(a, `${name} link missing`).toBeTruthy();
      expect(a.textContent.trim()).toBe(APPROVED[locale][key]);
      // The icon is decorative; the name comes from the sr-only text alone.
      expect(within(a).getByText(APPROVED[locale][key])).toHaveClass("sr-only");
      const svg = a.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
