/**
 * MEH-3329 — GET /og/producer/<slug>.png renders the typographic card for a
 * real business, under WhatsApp's 300KB, and falls back to the site image
 * (never a 5xx) for an unknown slug or a backend failure.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
// The rasterizer (Satori + sharp/resvg) is mocked: under jsdom its typed
// arrays come from another realm. What the route hands it is asserted here;
// the real render and its byte size are measured in the PR (scratch harness).
const renders = [];
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element, opts) {
      renders.push({ element, opts });
    }
    async arrayBuffer() {
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    }
  },
}));

const fetchMock = vi.fn();
vi.mock("@/lib/server-fetch", () => ({ serverFetch: (...a) => fetchMock(...a) }));
vi.mock("@/lib/env", () => ({ API_URL: "https://api.test" }));

import { GET } from "@/app/og/producer/[file]/route";

const req = (file) => [new Request(`https://site.test/og/producer/${file}`), { params: Promise.resolve({ file }) }];
const PRODUCER = { name: "משק הר הפרחים", city: "עופר", categories: [{ name: "חלב וגבינות" }], images: [] };

beforeEach(() => fetchMock.mockReset());

describe("MEH-3329 /og/producer/[file]", () => {
  it("a business → a 1200×630 PNG under 300KB, cached, fetched by its slug", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => PRODUCER });
    const res = await GET(...req(`${encodeURIComponent("משק-הר-הפרחים")}.png`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("s-maxage");
    const { element, opts } = renders.at(-1);
    expect([opts.width, opts.height]).toEqual([1200, 630]);
    expect(opts.fonts.map((f) => f.name)).toEqual(["Frank", "Heebo"]);
    expect(opts.fonts.every((f) => f.data.length > 10000)).toBe(true);
    // The typographic template: cream background, no photo <img> of 1200px.
    expect(element.props.style.background).toBe("#F5F0E8");
    expect(JSON.stringify(element)).not.toContain('"width":1200');
    // The name and the meta line are there, in drawing order (og-rtl).
    expect(JSON.stringify(element)).toContain("םיחרפה");
    expect(JSON.stringify(element)).toContain("תוניבגו");
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.test/producers/by-slug/${encodeURIComponent("משק-הר-הפרחים")}`);
  }, 30000);

  it("unknown slug (404) → redirect to the site image, not an error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const res = await GET(...req("nope.png"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://site.test/og-image.png");
  });

  it("backend down (503) → the same redirect", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const res = await GET(...req("havat-hashikma.png"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(302);
  });
});
