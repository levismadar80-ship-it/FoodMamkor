/**
 * MEH-3638 — the business page wires buildUntranslatedEntityMeta into its
 * metadata: /en is `noindex, follow` with no hreflang pair, the Hebrew page is
 * indexable with no `en` alternate, and a stricter robots of the page's own
 * (a seeded test business, a 404) still wins.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const SITE = "https://mehamakor.co.il";
let producerResponse;

vi.mock("@/lib/env", () => ({ SITE_URL: "https://mehamakor.co.il", API_URL: "http://api" }));
vi.mock("@/lib/server-fetch", () => ({
  serverFetch: vi.fn(async () => producerResponse),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/app/[locale]/producer/[id]/ProducerDetail", () => ({ default: () => null }));
vi.mock("@/app/[locale]/[slug]/ProducerGone", () => ({ default: () => null }));
vi.mock("../app/[locale]/[slug]/ProducerGone", () => ({ default: () => null }));

const PRODUCER = {
  id: 7,
  slug: "shikui-herbals",
  name: "שיקוי",
  city: "תל אביב-יפו",
  description: "תערובות צמחים",
  categories: [],
};

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

async function metaFor(locale) {
  const { generateMetadata } = await import("@/app/[locale]/[slug]/page");
  return generateMetadata({
    params: Promise.resolve({ locale, slug: "shikui-herbals" }),
  });
}

describe("business page metadata (MEH-3638)", () => {
  beforeEach(() => {
    producerResponse = ok(PRODUCER);
  });

  it("control: the metadata object is populated", async () => {
    const m = await metaFor("he");
    expect(m.alternates.canonical).toBe(`${SITE}/shikui-herbals`);
  });

  it("/en: noindex but follow, self canonical, no languages map", async () => {
    const m = await metaFor("en");
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.alternates).toEqual({ canonical: `${SITE}/en/shikui-herbals` });
  });

  it("Hebrew: no robots override, no languages map", async () => {
    const m = await metaFor("he");
    expect(m).not.toHaveProperty("robots");
    expect(m.alternates).not.toHaveProperty("languages");
  });

  it("a seeded test business stays index:false, follow:false on /en too", async () => {
    producerResponse = ok({ ...PRODUCER, noindex: true });
    const m = await metaFor("en");
    expect(m.robots).toEqual({ index: false, follow: false });
  });

  it("a missing business keeps index:false, follow:false", async () => {
    producerResponse = { ok: false, status: 404, json: async () => ({}) };
    const m = await metaFor("en");
    expect(m.robots).toEqual({ index: false, follow: false });
  });
});
