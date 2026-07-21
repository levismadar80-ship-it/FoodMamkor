/**
 * MEH-1398 — hard-404 for matched-route misses on /producer/[id].
 * A missing producer must notFound() from generateMetadata (pre-streaming,
 * real 404 status) instead of returning soft-404 (200) + noindex/hreflang
 * metadata. An existing producer must still build its per-page metadata.
 * Sibling of SlugPageBotHardening.test.jsx (the [slug] alias route).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// notFound() throws in real Next; mirror that so generateMetadata's control
// flow (`if (!producer) notFound()`) is observable as a rejection.
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

// server-only module — must be mocked before the page imports it.
vi.mock("@/lib/server-fetch", () => ({
  serverFetch: vi.fn(),
}));

// Heavy client tree — irrelevant to the metadata guard under test.
vi.mock("@/app/[locale]/producer/[id]/ProducerDetail", () => ({
  default: () => null,
}));

import { generateMetadata } from "@/app/[locale]/producer/[id]/page";
import { serverFetch } from "@/lib/server-fetch";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("producer/[id] generateMetadata hard-404 (MEH-1398)", () => {
  it("hard-404s a missing producer (backend not ok)", async () => {
    serverFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    await expect(
      generateMetadata({
        params: { id: "00000000-0000-0000-0000-000000000000", locale: "he" },
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(serverFetch).toHaveBeenCalledTimes(1);
  });

  it("still builds metadata for an existing producer", async () => {
    serverFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 7, name: "רוח השדה", slug: "ruach-hasadeh" }),
    });
    const meta = await generateMetadata({
      params: { id: "7", locale: "he" },
    });
    expect(serverFetch).toHaveBeenCalledTimes(1);
    expect(meta.title.absolute).toContain("רוח השדה");
  });
});
