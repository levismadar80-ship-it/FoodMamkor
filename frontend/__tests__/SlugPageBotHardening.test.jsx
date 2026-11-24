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
// MEH-2534: page.js now imports ProducerGone, which uses the locale-aware Link.
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

import ProducerSlugPage, {
  generateMetadata,
} from "@/app/[locale]/[slug]/page";
// MEH-1119: isSlugShaped moved to lib/slug.js (out of the page's export surface).
import { isSlugShaped } from "@/lib/slug";
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

  it("generateMetadata still builds producer metadata for a legit slug", async () => {
    serverFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, name: "משק תמר", slug: "meshek-tamar" }),
    });
    const meta = await generateMetadata({
      params: { slug: "meshek-tamar", locale: "he" },
    });
    expect(serverFetch).toHaveBeenCalledTimes(1);
    expect(meta.title).toContain("משק תמר"); // MEH-2853: plain title, the layout template adds the brand
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
    // MEH-3819: the producer first, then its three activity lists.
    expect(serverFetch).toHaveBeenCalledTimes(4);
    expect(String(serverFetch.mock.calls[0][0])).toContain(
      "/producers/by-slug/meshek-tamar",
    );
  });

  // MEH-3819: the page arrives with its events, experiences and group buys,
  // so they are not inserted above the reviews a moment after it paints.
  it("hands the server-read activity lists to the page, or null when one read fails", async () => {
    const list = (data) => ({ ok: true, json: async () => data });
    serverFetch
      .mockResolvedValueOnce(list({ id: "p-1", name: "משק תמר", slug: "meshek-tamar" }))
      .mockResolvedValueOnce(list([{ id: "e1" }]))
      .mockResolvedValueOnce(list([]))
      .mockResolvedValueOnce(list([{ id: "g1" }]));
    const detail = (jsx) => jsx.props.children.find((c) => c?.props?.initialProducer);
    const page = await ProducerSlugPage({ params: { slug: "meshek-tamar", locale: "he" } });
    expect(detail(page).props.initialActivities).toEqual({
      events: [{ id: "e1" }],
      experiences: [],
      groupBuys: [{ id: "g1" }],
    });
    const urls = serverFetch.mock.calls.slice(1).map((c) => String(c[0]));
    expect(urls).toEqual([
      expect.stringContaining("/events?producer_id=p-1"),
      expect.stringContaining("/experiences?producer_id=p-1"),
      expect.stringContaining("/group-buys?producer_id=p-1"),
    ]);

    serverFetch.mockReset();
    serverFetch
      .mockResolvedValueOnce(list({ id: "p-1", name: "משק תמר", slug: "meshek-tamar" }))
      .mockResolvedValueOnce(list([]))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce(list([]));
    const fallback = await ProducerSlugPage({ params: { slug: "meshek-tamar", locale: "he" } });
    // The browser reads them itself (useProducerActivities); the page still renders.
    expect(detail(fallback).props.initialActivities).toBeNull();
  });
});
