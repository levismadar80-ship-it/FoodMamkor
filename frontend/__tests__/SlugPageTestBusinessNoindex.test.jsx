/**
 * MEH-2952 chunk 3 — a seeded test business is served by by-slug with
 * `noindex: true` (Sapir 11/11 ruling 2). Its page must carry robots noindex
 * and no JSON-LD; an ordinary business (`noindex: false`) keeps both.
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/server-fetch", () => ({ serverFetch: vi.fn() }));
vi.mock("@/app/[locale]/producer/[id]/ProducerDetail", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

import ProducerSlugPage, { generateMetadata } from "@/app/[locale]/[slug]/page";
import { serverFetch } from "@/lib/server-fetch";

const SLUG = "meh2952-test-row";
const base = { id: "p1", slug: SLUG, name: "משק בדיקה", city: "חיפה", images: [] };

function serve(producer) {
  serverFetch.mockResolvedValue({ status: 200, ok: true, json: async () => producer });
}
const props = () => ({ params: Promise.resolve({ slug: SLUG, locale: "he" }) });

describe("[slug] page × noindex", () => {
  it("a test business: robots noindex, no JSON-LD", async () => {
    serve({ ...base, noindex: true });
    const meta = await generateMetadata(props());
    expect(meta.robots).toEqual({ index: false, follow: false });
    const html = renderToStaticMarkup(await ProducerSlugPage(props()));
    expect(html).not.toContain("application/ld+json");
  });

  it("an ordinary business (control): indexable, JSON-LD present", async () => {
    serve({ ...base, noindex: false });
    const meta = await generateMetadata(props());
    expect(meta.robots).toBeUndefined();
    const html = renderToStaticMarkup(await ProducerSlugPage(props()));
    expect(html).toContain("application/ld+json");
  });
});
