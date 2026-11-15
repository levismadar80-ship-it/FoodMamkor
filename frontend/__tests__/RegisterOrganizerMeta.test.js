/**
 * MEH-2988 — /register/organizer is the link Sapir sends to market and event
 * organizers. Its tab and share preview used to carry the business route's
 * title («רישום בית עסק»).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }) => (key) => `${namespace}.${key}`,
}));
vi.mock("@/app/[locale]/register/producer/RegisterProducerClient", () => ({ default: () => null }));
vi.mock("@/components/i18n/RouteMessagesProvider", () => ({ default: () => null }));
vi.mock("@/lib/env", () => ({
  SITE_URL: "https://mehamakor.co.il",
  API_URL: "https://api.example.test",
}));

import { generateMetadata } from "@/app/[locale]/register/organizer/page";

describe.each(["he", "en"])("register/organizer metadata (%s)", (locale) => {
  it("tab title is the organizer title, not the business one", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale }) });
    expect(meta.title).toBe("seo.register_organizer.title");
  });

  it("share preview names the organizer flow and points at this route", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale }) });
    const brand = locale === "en" ? "Mehamakor" : "מהמקור";
    expect(meta.openGraph.title).toBe(`seo.register_organizer.title | ${brand}`);
    expect(meta.twitter.title).toBe(`seo.register_organizer.title | ${brand}`);
    expect(meta.openGraph.description).toBe("auth.register.producer.organizer_heading");
    expect(meta.openGraph.url).toMatch(/\/register\/organizer$/);
  });

  it("stays out of search (a link Sapir sends, not a landing page)", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale }) });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
