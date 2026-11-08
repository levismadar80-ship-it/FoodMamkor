/**
 * MEH-2633 (Sapir's ruling 04/11) — /recommend is `noindex, follow` AND absent
 * from the sitemap. Both halves, because either alone is the wrong state:
 * a noindex page listed in the sitemap produces GSC "Submitted URL marked
 * 'noindex'" (the reason sitemap.js:65 keeps /register, /login and /contact
 * out), and an indexable form page is what the ruling rejected.
 *
 * Discrimination: the first test reds on `robots: {index: true}` or on the
 * directive being dropped altogether; the second reds the moment /recommend is
 * added to sitemap.js's staticDefs. The control in the second test is the
 * assertion that the sitemap is non-empty and DOES contain an indexable page —
 * without it, a sitemap that returned [] would pass as "recommend absent".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  SITE_URL: "https://mehamakor.co.il",
  API_URL: "https://api.example.test",
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key) => `seo.recommend.${key}`,
}));

import { generateMetadata } from "@/app/[locale]/recommend/page";
import sitemap from "@/app/sitemap";

describe("MEH-2633 — /recommend is noindex and out of the sitemap", () => {
  it("the page declares noindex with follow kept", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: "he" }) });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("still emits canonical + hreflang, which noindex does not remove", async () => {
    // noindex is not "unlist the page from everything": the alternates keep the
    // cross-locale signal, same as /contact.
    const meta = await generateMetadata({ params: Promise.resolve({ locale: "he" }) });
    expect(meta.alternates).toBeTruthy();
  });

  describe("sitemap", () => {
    beforeEach(() => {
      // Hub counts are fetched; an empty answer keeps the hubs out and leaves
      // the hand-maintained staticDefs, which is what this test is about.
      global.fetch = vi.fn(async () => ({ ok: true, json: async () => [] }));
    });

    it("lists no /recommend URL in any locale", async () => {
      const entries = await sitemap();
      const urls = entries.map((e) => e.url);

      // CONTROL FIRST: a sitemap that failed to build would also contain no
      // /recommend, and that null would read as a pass.
      //
      // `he` is the DEFAULT locale under localePrefix "as-needed"
      // (i18n/routing.js:4-6), so Hebrew URLs carry no prefix at all — an
      // earlier version of this control looked for "/he" and went red, which
      // is the control catching the test author rather than the code.
      expect(urls.length).toBeGreaterThan(0);
      expect(urls.some((u) => u.includes("/en/") || u.endsWith("/en"))).toBe(true);
      expect(urls.some((u) => !u.includes("/en"))).toBe(true);
      expect(urls.some((u) => u.includes("/terms"))).toBe(true);

      expect(urls.filter((u) => u.includes("/recommend"))).toEqual([]);
      // Also not smuggled in through an alternates block.
      const alt = entries.flatMap((e) => Object.values(e.alternates?.languages ?? {}));
      expect(alt.filter((u) => u.includes("/recommend"))).toEqual([]);
    });
  });
});
