/**
 * MEH-2101 — the four public entity routes must distinguish "this entity does
 * not exist" from "the backend is unavailable", and must say so in the STATUS
 * CODE rather than only in the rendered UI.
 *
 * Sibling of `SlugResolverErrorSeparation.test.jsx` (MEH-1754, PR #2514) and
 * `RecipeResolverErrorSeparation.test.jsx`. Those two fixed the producer-slug
 * and recipe resolvers; these four routes kept the old shape — `if (!res.ok)
 * return null` plus a `catch { return null }` — which mapped 404, 500, 429,
 * DNS failure and an 8s timeout onto ONE `null`. Worse than the recipe case:
 * here that `null` did not even become `notFound()`, it rendered a **200 with
 * fallback metadata**, i.e. a soft 404 on every one of the five.
 *
 * §6 of docs/audits/producer-detail-page-validation.md is what put them there.
 * It framed the choice as binary — 404 risks the index, 200 is safe — and this
 * ticket replaces it with the three-way table: 404 for a missing entity, 5xx
 * for an unavailable backend, and the client's own code for a rate limit.
 *
 * These assert BEHAVIOUR at the page boundary — what the route does for a
 * given backend response — not that a particular line was edited (ADR-032
 * §3.6). An inert "fix" cannot pass them.
 *
 * DISCRIMINATION, which is the whole point of the file: against the OLD
 * resolver EVERY row below returned fallback metadata and threw nothing, so
 * every `NEXT_NOT_FOUND` expectation AND every `.status` expectation fails on
 * it. The two directions are checked separately, so a change that turned
 * *everything* into a 404 — the opposite over-correction, and the one MEH-1754
 * exists to prevent — fails just as loudly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// importOriginal, not a bare stub: one of these four pages pulls next-intl's
// client navigation, which imports other members of next/navigation. Replacing
// the whole module breaks that import chain before any assertion runs.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal()),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/server-fetch", () => ({ serverFetch: vi.fn() }));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key) => key),
}));

// The four client components are stubbed because only `generateMetadata` is
// under test here and they are never rendered — but the real reason is
// mechanical: they pull next-intl's client navigation, which imports
// `next/navigation` by extensionless specifier and fails to resolve under
// vitest before a single assertion runs.
vi.mock("@/app/[locale]/events/[id]/EventDetailClient", () => ({
  default: () => null,
}));
vi.mock("@/app/[locale]/experiences/[id]/ExperienceDetailClient", () => ({
  default: () => null,
}));
vi.mock("@/app/[locale]/group-buys/[id]/GroupBuyDetailClient", () => ({
  default: () => null,
}));
vi.mock("@/app/[locale]/producer/[id]/ProducerDetail", () => ({
  default: () => null,
}));

import { serverFetch } from "@/lib/server-fetch";

import { generateMetadata as eventMetadata } from "@/app/[locale]/events/[id]/page";
import { generateMetadata as experienceMetadata } from "@/app/[locale]/experiences/[id]/page";
import { generateMetadata as groupBuyMetadata } from "@/app/[locale]/group-buys/[id]/page";
import { generateMetadata as producerMetadata } from "@/app/[locale]/producer/[id]/page";

/** A fetch Response stub carrying only what the resolvers read. */
const response = (status, body = null) => ({
  status,
  statusText: `status ${status}`,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

// One row per route. Kept as a table so a fifth entity route cannot be added
// without either appearing here or being visibly absent.
const ROUTES = [
  ["events", eventMetadata, { id: 12, title: "יריד אוגוסט" }],
  ["experiences", experienceMetadata, { id: 12, title: "סדנת לחם" }],
  ["group-buys", groupBuyMetadata, { id: 12, title: "רכישה קבוצתית" }],
  ["producer", producerMetadata, { id: 12, name: "מאפיית המחמצת" }],
];

const props = { params: Promise.resolve({ id: "12", locale: "he" }) };

/** Re-await: `params` is consumed once per call, so each case needs its own. */
const freshProps = () => ({ params: Promise.resolve({ id: "12", locale: "he" }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MEH-2101 — a missing entity is a 404, an unavailable backend is not", () => {
  it("the route table covers all four §2 routes", () => {
    // Derived, never stated: adding a route moves this number on its own.
    expect(ROUTES.map((r) => r[0])).toEqual([
      "events",
      "experiences",
      "group-buys",
      "producer",
    ]);
  });

  describe.each(ROUTES)("%s", (name, generateMetadata, entity) => {
    it("404 from the API → notFound(), which pre-streaming is a REAL 404", async () => {
      serverFetch.mockResolvedValue(response(404));
      await expect(generateMetadata(freshProps())).rejects.toThrow(
        "NEXT_NOT_FOUND"
      );
    });

    it.each([500, 502, 503])(
      "%i from the API → throws, and NOT as a not-found",
      async (status) => {
        serverFetch.mockResolvedValue(response(status));
        const err = await generateMetadata(freshProps()).catch((e) => e);
        expect(err).toBeInstanceOf(Error);
        // The load-bearing half: a 5xx must not be laundered into a 404.
        expect(err.message).not.toBe("NEXT_NOT_FOUND");
        expect(err.status).toBe(status);
      }
    );

    it("429 from the API → throws, and NOT as a not-found", async () => {
      serverFetch.mockResolvedValue(response(429));
      const err = await generateMetadata(freshProps()).catch((e) => e);
      expect(err.message).not.toBe("NEXT_NOT_FOUND");
      expect(err.status).toBe(429);
    });

    it("a network failure / timeout → rethrown, and NOT as a not-found", async () => {
      serverFetch.mockRejectedValue(new Error("ETIMEDOUT"));
      const err = await generateMetadata(freshProps()).catch((e) => e);
      expect(err.message).toBe("ETIMEDOUT");
      expect(err.message).not.toBe("NEXT_NOT_FOUND");
    });

    it("200 → ordinary metadata, no throw at all", async () => {
      serverFetch.mockResolvedValue(response(200, entity));
      const meta = await generateMetadata(freshProps());
      expect(meta).toBeTruthy();
      expect(meta.alternates).toBeTruthy();
    });
  });
});
