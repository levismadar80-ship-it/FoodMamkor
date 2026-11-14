/**
 * MEH-3193 — pre-launch hardening.
 *
 * DISCRIMINATION (each run against the pre-MEH-3193 files):
 * - replayAllowed: the module did not exist (import fails).
 * - api timeout: axios.create had no timeout → defaults.timeout is 0.
 * - /producers: the old fetchPage swallowed a 5xx into {items: [], total: 0}
 *   and rendered "0 businesses" → the page resolved instead of rejecting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { replayAllowed } from "@/lib/sentry-replay-gate";

describe("replayAllowed (Sentry replay gate)", () => {
  it.each([
    ["/producers", true, true],
    ["/producers", false, false],
    ["/claim/abc123", true, false],
    ["/en/claim/abc123", true, false],
    ["/owner-invite/abc123", true, false],
    ["/en/owner-invite/abc123", true, false],
    ["/claim", true, true],
    ["", true, true],
  ])("%s with full consent=%s → %s", (path, consent, expected) => {
    expect(replayAllowed(path, consent)).toBe(expected);
  });
});

describe("api client timeout", () => {
  it("every request gives up after 15 s", async () => {
    const { default: api } = await vi.importActual("@/lib/api");
    expect(api.defaults.timeout).toBe(15000);
  });

  // The request interceptors run in order; feed a config through all of them
  // the way axios would, and read the timeout that would be sent.
  async function sentTimeout(api, data, timeout = api.defaults.timeout) {
    let config = { headers: {}, data, timeout };
    for (const h of api.interceptors.request.handlers) {
      if (h && h.fulfilled) config = await h.fulfilled(config);
    }
    return config.timeout;
  }

  it("a file upload (FormData) gets 2 minutes, not 15 s", async () => {
    const { default: api } = await vi.importActual("@/lib/api");
    expect(await sentTimeout(api, new FormData())).toBe(120000);
  });

  it("a JSON body keeps the 15 s cap", async () => {
    const { default: api } = await vi.importActual("@/lib/api");
    expect(await sentTimeout(api, { name: "x" })).toBe(15000);
  });

  it("an upload whose caller set its own timeout keeps it", async () => {
    const { default: api } = await vi.importActual("@/lib/api");
    expect(await sentTimeout(api, new FormData(), 5000)).toBe(5000);
  });
});

const serverFetch = vi.fn();
vi.mock("@/lib/server-fetch", () => ({ serverFetch: (...a) => serverFetch(...a) }));
vi.mock("@/components/ProducersClient", () => ({ default: () => null }));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => null }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k) => k }));

describe("/producers server page on a backend failure", () => {
  beforeEach(() => {
    serverFetch.mockReset();
    // fetchRatingSortEnabled still uses plain fetch and fails closed.
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
  });

  it("throws to the error boundary instead of rendering an empty catalogue", async () => {
    serverFetch.mockResolvedValue({ ok: false, status: 503, headers: new Headers() });
    const { default: Page } = await import("@/app/[locale]/producers/page.jsx");
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("GET /producers 503");
  });

  it("still renders when the backend answers", async () => {
    serverFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "x-total-count": "1" }),
      json: async () => [{ id: 1 }],
    });
    const { default: Page } = await import("@/app/[locale]/producers/page.jsx");
    await expect(Page({ searchParams: Promise.resolve({}) })).resolves.toBeTruthy();
  });
});
