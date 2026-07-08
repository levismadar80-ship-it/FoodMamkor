/**
 * MEH-1045 — bot hardening on the root catch-all ([slug]/page.js).
 * Scanner probes (/wp-admin, /.env, /xmlrpc.php…) must 404 WITHOUT any
 * backend fetch; legit producer slugs must still reach the backend.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// notFound() throws in real Next; mirror that so the page's control flow
// (`if (!producer) notFound()`) is observable.
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

// server-only module — must be mocked before the page imports it.
vi.mock("@/lib/server-fetch", () => ({
  serverFetch: vi.fn(),
}));

// Heavy client tree — irrelevant to the guard under test.
vi.mock("@/app/[locale]/producer/[id]/ProducerDetail", () => ({
  default: () => null,
}));

import ProducerSlugPage, {
  generateMetadata,
  isSlugShaped,
} from "@/app/[locale]/[slug]/page";
import { serverFetch } from "@/lib/server-fetch";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isSlugShaped (MEH-1045 fast-404 guard)", () => {
  it.each([
    "wp-admin",
    "wp-login.php",
    "wordpress",
    "xmlrpc.php",
    "xmlrpc",
    "phpmyadmin",
    "cgi-bin",
    ".env",
    ".git",
    "foo.php",
    "backup.sql",
    "favicon.ico",
    "admin", // RESERVED
    "api", // RESERVED
    "foo bar", // whitespace never survives _slugify
    "UPPER.CASE",
  ])("rejects scanner/reserved path %s", (probe) => {
    expect(isSlugShaped(probe)).toBe(false);
  });

  it("rejects empty and over-long slugs", () => {
    expect(isSlugShaped("")).toBe(false);
    expect(isSlugShaped(undefined)).toBe(false);
    expect(isSlugShaped("a".repeat(101))).toBe(false);
  });

  it.each([
    "meshek-tamar",
    "farm_42",
    "משק-תמר", // Hebrew slugs are legal (_slugify keeps ֐-׿)
    "a".repeat(100),
  ])("accepts legit backend-shaped slug %s", (slug) => {
    expect(isSlugShaped(slug)).toBe(true);
  });
});

describe("ProducerSlugPage fast-404 (no backend fetch on probes)", () => {
  it("404s /wp-admin without calling serverFetch", async () => {
    await expect(
      ProducerSlugPage({ params: { slug: "wp-admin", locale: "he" } }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(serverFetch).not.toHaveBeenCalled();
  });

  it("404s /.env without calling serverFetch", async () => {
    await expect(
      ProducerSlugPage({ params: { slug: ".env", locale: "he" } }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(serverFetch).not.toHaveBeenCalled();
  });

  it("generateMetadata notFound()s probes pre-fetch (real 404 status pre-streaming)", async () => {
    await expect(
      generateMetadata({ params: { slug: "wp-admin", locale: "he" } }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(serverFetch).not.toHaveBeenCalled();
  });

  it("still fetches the backend for a legit slug and renders", async () => {
    serverFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, name: "משק תמר", slug: "meshek-tamar" }),
    });
    const jsx = await ProducerSlugPage({
      params: { slug: "meshek-tamar", locale: "he" },
    });
    expect(jsx).toBeTruthy();
    expect(serverFetch).toHaveBeenCalledTimes(1);
    expect(String(serverFetch.mock.calls[0][0])).toContain(
      "/producers/by-slug/meshek-tamar",
    );
  });
});
