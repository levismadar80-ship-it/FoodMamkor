/**
 * MEH-2594 — /register/producer is the link outreach sends to businesses.
 * Without its own openGraph it inherited the layout's, so a shared sign-up
 * link previewed as the homepage (og:title + og:url = root).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key) => `seo.register_producer.${key}`,
}));
vi.mock("@/app/[locale]/register/producer/RegisterProducerClient", () => ({ default: () => null }));
vi.mock("@/components/i18n/RouteMessagesProvider", () => ({ default: () => null }));
vi.mock("@/lib/env", () => ({
  SITE_URL: "https://mehamakor.co.il",
  API_URL: "https://api.example.test",
}));

import { generateMetadata } from "@/app/[locale]/register/producer/page";

describe.each(["he", "en"])("register/producer share metadata (%s)", (locale) => {
  it("og:url is this page's canonical, not the homepage", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale }) });
    expect(meta.openGraph.url).toBe(meta.alternates.canonical);
    expect(meta.openGraph.url).toMatch(/\/register\/producer$/);
  });

  it("og:title and twitter:title are the sign-up title", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale }) });
    expect(meta.openGraph.title).toBe("seo.register_producer.title");
    expect(meta.twitter.title).toBe("seo.register_producer.title");
  });
});
