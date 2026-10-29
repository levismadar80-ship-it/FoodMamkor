/**
 * MEH-2594 — a business page's og:url is the page's own canonical. It used to
 * be buildProducerMetadata's url, always the Hebrew one, so /en/<slug> shared
 * as the Hebrew page.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/server-fetch", () => ({ serverFetch: vi.fn() }));
vi.mock("@/app/[locale]/producer/[id]/ProducerDetail", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

import { generateMetadata } from "@/app/[locale]/[slug]/page";
import { serverFetch } from "@/lib/server-fetch";

const SLUG = "meshek-barak";
const producer = { id: "p1", slug: SLUG, name: "משק ברק", images: [] };

describe.each(["he", "en"])("[slug] og:url (%s)", (locale) => {
  it("equals the page canonical", async () => {
    serverFetch.mockResolvedValue({ status: 200, ok: true, json: async () => producer });
    const meta = await generateMetadata({ params: Promise.resolve({ slug: SLUG, locale }) });
    expect(meta.openGraph.url).toBe(meta.alternates.canonical);
    expect(meta.openGraph.url.endsWith(locale === "en" ? `/en/${SLUG}` : `/${SLUG}`)).toBe(true);
  });
});
