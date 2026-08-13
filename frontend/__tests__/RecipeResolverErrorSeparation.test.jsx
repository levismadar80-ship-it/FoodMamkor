/**
 * MEH-1754 — the public recipe route must distinguish "this recipe (or this
 * business) does not exist" from "the backend is unavailable".
 *
 * Sibling of `SlugResolverErrorSeparation.test.jsx`. PR #2514 fixed the
 * [slug] resolver; this route kept the old shape — `if (!res.ok) return null`
 * plus a bare `catch { return null }` — which mapped 404, 500, 429, DNS
 * failure and an 8s timeout onto ONE `null` that became `notFound()`. A
 * temporary infrastructure fault therefore rendered a silent 404: no stack, no
 * Sentry event, no error status, and Google told the page was GONE rather than
 * "try later" (vercel/next.js#79497 then caches that 404).
 *
 * These assert BEHAVIOUR at the page boundary (what the page does for a given
 * backend response), not that a particular line was edited — ADR-032 §3.6. An
 * inert "fix" cannot pass them.
 *
 * Discrimination: against the OLD resolver every backend fault below threw
 * NEXT_NOT_FOUND, so each `not.toBe("NEXT_NOT_FOUND")` assertion fails on it.
 * Proven fail→pass — see the PR body for both runs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/server-fetch", () => ({
  serverFetch: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key) => key),
}));

vi.mock("@/components/public/RecipeDetail", () => ({ default: () => null }));
vi.mock("@/components/public/RecipeJsonLd", () => ({ default: () => null }));

import PublicRecipePage, {
  generateMetadata,
} from "@/app/[locale]/[slug]/recipes/[recipe_id]/page";
import { serverFetch } from "@/lib/server-fetch";
import { notFound } from "next/navigation";

const SLUG = "maafiyat-hamachmetzet";
const RECIPE_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const params = Promise.resolve({
  slug: SLUG,
  recipe_id: RECIPE_ID,
  locale: "he",
});

/** A fetch Response stub carrying only what the resolver reads. */
const response = (status, body = null) => ({
  status,
  statusText: `status ${status}`,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

const PRODUCER = { id: 1, name: "מאפיית המחמצת", products: [] };
const RECIPE = { id: RECIPE_ID, title: "לחם מחמצת", product_ids: [] };

/**
 * The page fetches producer + recipe in parallel, so a per-leg stub is what
 * lets a test say "the producer is fine, the RECIPE 500s" — the asymmetric
 * case a single mockResolvedValue cannot express.
 */
function mockLegs({ producer, recipe }) {
  serverFetch.mockImplementation(async (url) =>
    String(url).includes("/recipes/") ? recipe : producer
  );
}

/** Capture whatever the page throws, so its identity can be asserted. */
async function thrownBy(fn) {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected the page to throw, but it resolved");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MEH-1754 (recipes) — only a real 404 becomes notFound()", () => {
  it("recipe 404 -> notFound() (unknown or unpublished recipe)", async () => {
    mockLegs({
      producer: response(200, PRODUCER),
      recipe: response(404),
    });
    const err = await thrownBy(() => PublicRecipePage({ params }));
    expect(err.message).toBe("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("producer 404 -> notFound() (unknown business)", async () => {
    mockLegs({
      producer: response(404),
      recipe: response(200, RECIPE),
    });
    const err = await thrownBy(() => PublicRecipePage({ params }));
    expect(err.message).toBe("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("200 + 200 -> renders, and notFound() is never reached", async () => {
    mockLegs({
      producer: response(200, PRODUCER),
      recipe: response(200, RECIPE),
    });
    await PublicRecipePage({ params });
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("MEH-1754 (recipes) — backend faults throw instead of 404-ing", () => {
  // 500/502/503 = the outage shape. 429 = rate limit. 403 = auth/proxy fault.
  // None of them means the recipe is gone, so none may reach notFound().
  it.each([500, 502, 503, 429, 403])(
    "recipe leg %i -> throws a real error, NOT NEXT_NOT_FOUND",
    async (status) => {
      mockLegs({
        producer: response(200, PRODUCER),
        recipe: response(status),
      });
      const err = await thrownBy(() => PublicRecipePage({ params }));

      // The load-bearing assertion: the OLD resolver threw NEXT_NOT_FOUND here.
      expect(err.message).not.toBe("NEXT_NOT_FOUND");
      expect(notFound).not.toHaveBeenCalled();
      // Sentry needs both to make the event actionable.
      expect(err.status).toBe(status);
      expect(err.slug).toBe(SLUG);
    }
  );

  it("producer leg 500 -> throws even though the recipe leg is healthy", async () => {
    mockLegs({
      producer: response(500),
      recipe: response(200, RECIPE),
    });
    const err = await thrownBy(() => PublicRecipePage({ params }));
    expect(err.message).not.toBe("NEXT_NOT_FOUND");
    expect(err.status).toBe(500);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("timeout (AbortError) propagates — the bare catch is gone", async () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    serverFetch.mockRejectedValue(abort);

    const err = await thrownBy(() => PublicRecipePage({ params }));
    expect(err.message).not.toBe("NEXT_NOT_FOUND");
    expect(err.name).toBe("AbortError");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("network failure (DNS/socket) propagates rather than being swallowed", async () => {
    const netErr = new TypeError("fetch failed");
    netErr.cause = { code: "ENOTFOUND" };
    serverFetch.mockRejectedValue(netErr);

    const err = await thrownBy(() => PublicRecipePage({ params }));
    expect(err.message).not.toBe("NEXT_NOT_FOUND");
    expect(err.cause?.code).toBe("ENOTFOUND");
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("MEH-1754 (recipes) — generateMetadata inherits the same separation", () => {
  // It calls the SAME resolver, so the split has to hold on both entry points
  // or a crawler could still be handed 404 metadata during an outage — the
  // exact de-indexing signal this ticket exists to prevent.
  it("404 -> still returns the MEH-476 hreflang-carrying 404 metadata", async () => {
    mockLegs({ producer: response(200, PRODUCER), recipe: response(404) });
    const meta = await generateMetadata({ params });
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("500 -> throws rather than emitting 404 metadata", async () => {
    mockLegs({ producer: response(200, PRODUCER), recipe: response(500) });
    const err = await thrownBy(() => generateMetadata({ params }));
    expect(err.message).not.toBe("NEXT_NOT_FOUND");
    expect(err.status).toBe(500);
  });

  it("timeout -> throws rather than emitting 404 metadata", async () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    serverFetch.mockRejectedValue(abort);

    const err = await thrownBy(() => generateMetadata({ params }));
    expect(err.message).not.toBe("NEXT_NOT_FOUND");
    expect(err.name).toBe("AbortError");
  });
});
