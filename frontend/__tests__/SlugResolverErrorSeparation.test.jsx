/**
 * MEH-1754 — the [slug] resolver must distinguish "this business does not
 * exist" from "the backend is unavailable".
 *
 * Before: `if (!res.ok) return null` plus a bare `catch { return null }` mapped
 * 404, 500, 429, DNS failure and an 8s timeout onto ONE `null`, which became
 * `notFound()`. A temporary infrastructure fault therefore rendered a silent
 * 404 — no stack, no Sentry event, no error status — and told Google the page
 * was GONE rather than "try later".
 *
 * These assert BEHAVIOUR at the page boundary (what the page does for a given
 * backend response), not that a particular line was edited — ADR-032 §3.6. An
 * inert "fix" cannot pass them.
 *
 * Discrimination: against the OLD resolver every one of these backend faults
 * threw NEXT_NOT_FOUND, so each `notNextNotFound` assertion below fails on it.
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

vi.mock("@/app/[locale]/producer/[id]/ProducerDetail", () => ({
  default: () => null,
}));

import ProducerSlugPage, { generateMetadata } from "@/app/[locale]/[slug]/page";
import { serverFetch } from "@/lib/server-fetch";
import { notFound } from "next/navigation";

const SLUG = "maafiyat-hamachmetzet";
const params = Promise.resolve({ slug: SLUG, locale: "he" });

/** A fetch Response stub carrying only what the resolver reads. */
const response = (status, body = null) => ({
  status,
  statusText: `status ${status}`,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

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

describe("MEH-1754 — only a real 404 becomes notFound()", () => {
  it("404 -> notFound() (the one genuine miss)", async () => {
    serverFetch.mockResolvedValue(response(404));
    const err = await thrownBy(() => ProducerSlugPage({ params }));
    expect(err.message).toBe("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("200 -> renders, and notFound() is never reached", async () => {
    serverFetch.mockResolvedValue(response(200, { id: 1, name: "מאפיית המחמצת" }));
    await ProducerSlugPage({ params });
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("MEH-1754 — backend faults throw instead of 404-ing", () => {
  // 500/503 = the outage shape. 429 = rate limit. 403 = auth/proxy fault.
  // None of them means the business is gone, so none may reach notFound().
  it.each([500, 502, 503, 429, 403])(
    "%i -> throws a real error, NOT NEXT_NOT_FOUND",
    async (status) => {
      serverFetch.mockResolvedValue(response(status));
      const err = await thrownBy(() => ProducerSlugPage({ params }));

      // The load-bearing assertion: the OLD resolver threw NEXT_NOT_FOUND here.
      expect(err.message).not.toBe("NEXT_NOT_FOUND");
      expect(notFound).not.toHaveBeenCalled();
      // Sentry needs both to make the event actionable.
      expect(err.status).toBe(status);
      expect(err.slug).toBe(SLUG);
    }
  );

  it("timeout (AbortError) propagates — the bare catch is gone", async () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    serverFetch.mockRejectedValue(abort);

    const err = await thrownBy(() => ProducerSlugPage({ params }));
    expect(err.message).not.toBe("NEXT_NOT_FOUND");
    expect(err.name).toBe("AbortError");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("network failure (DNS/socket) propagates rather than being swallowed", async () => {
    const netErr = new TypeError("fetch failed");
    netErr.cause = { code: "ENOTFOUND" };
    serverFetch.mockRejectedValue(netErr);

    const err = await thrownBy(() => ProducerSlugPage({ params }));
    expect(err.message).not.toBe("NEXT_NOT_FOUND");
    expect(err.cause?.code).toBe("ENOTFOUND");
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("MEH-1754 — generateMetadata inherits the same separation", () => {
  // It calls the SAME resolver (page.js:38), so the split has to hold on both
  // entry points or a crawler could still be handed 404 metadata during an
  // outage — the exact de-indexing signal this ticket exists to prevent.
  it("404 -> still returns the MEH-476 hreflang-carrying 404 metadata", async () => {
    serverFetch.mockResolvedValue(response(404));
    const meta = await generateMetadata({ params });
    expect(meta).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled(); // slug-shaped miss keeps metadata
  });

  it("500 -> throws rather than emitting 404 metadata", async () => {
    serverFetch.mockResolvedValue(response(500));
    const err = await thrownBy(() => generateMetadata({ params }));
    expect(err.message).not.toBe("NEXT_NOT_FOUND");
    expect(err.status).toBe(500);
  });
});

describe("MEH-1754 — a scanner path still costs zero backend calls", () => {
  // Regression guard on MEH-1045: the fast-404 must short-circuit BEFORE the
  // fetch, so hardening it against outages must not have re-armed the probe.
  it("does not fetch for a scanner-shaped path", async () => {
    const err = await thrownBy(() =>
      ProducerSlugPage({ params: Promise.resolve({ slug: "wp-admin", locale: "he" }) })
    );
    expect(err.message).toBe("NEXT_NOT_FOUND");
    expect(serverFetch).not.toHaveBeenCalled();
  });
});
