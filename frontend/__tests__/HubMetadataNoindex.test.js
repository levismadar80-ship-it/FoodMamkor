/**
 * MEH-2369 — each hub page's generateMetadata wires hubRobots to its own
 * count: noindex when the hub is known-empty, no robots override otherwise.
 * The rule itself is unit-tested in HubSupplySitemap.test.js; this file proves
 * each of the three pages actually asks for ITS hub (a wrong key would read
 * another hub's count and pass the rule tests).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getHubCount = vi.fn();
vi.mock("@/lib/listing-supply", async (orig) => ({
  ...(await orig()),
  getHubCount: (...a) => getHubCount(...a),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key) => key,
}));
// The pages' client components are irrelevant to metadata and pull in
// next/navigation; stub them.
vi.mock("@/app/[locale]/events/EventsClient", () => ({ default: () => null }));
vi.mock("@/app/[locale]/group-buys/GroupBuysClient", () => ({ default: () => null }));
vi.mock("@/lib/env", () => ({
  SITE_URL: "https://mehamakor.co.il",
  API_URL: "https://api.example.test",
}));

import { generateMetadata as eventsMeta } from "@/app/[locale]/events/page";
import { generateMetadata as experiencesMeta } from "@/app/[locale]/experiences/page";
import { generateMetadata as groupBuysMeta } from "@/app/[locale]/group-buys/page";

const params = { params: Promise.resolve({ locale: "he" }) };

const CASES = [
  ["events", eventsMeta],
  ["experiences", experiencesMeta],
  ["groupBuys", groupBuysMeta],
];

beforeEach(() => getHubCount.mockReset());

describe.each(CASES)("%s page metadata", (hubKey, meta) => {
  it("asks for its own hub's count", async () => {
    getHubCount.mockResolvedValue(3);
    await meta(params);
    expect(getHubCount).toHaveBeenCalledWith(hubKey);
  });

  it("0 → noindex, follow", async () => {
    getHubCount.mockResolvedValue(0);
    expect((await meta(params)).robots).toEqual({ index: false, follow: true });
  });

  it("1 → no robots override (inherits the site default)", async () => {
    getHubCount.mockResolvedValue(1);
    expect((await meta(params)).robots).toBeUndefined();
  });

  it("many → no robots override", async () => {
    getHubCount.mockResolvedValue(40);
    expect((await meta(params)).robots).toBeUndefined();
  });

  it("unknown (API down) → stays indexable, and the rest of the metadata is intact", async () => {
    getHubCount.mockResolvedValue(null);
    const m = await meta(params);
    expect(m.robots).toBeUndefined();
    expect(m.alternates).toBeDefined();
  });
});
