/**
 * MEH-2767 — the unfiltered catalog home and /producers count chip gates on.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a) } }));

import { useCatalogSnapshot, resetCatalogSnapshotCache } from "@/lib/use-catalog-snapshot";

const ROW = { id: "11111111-1111-1111-1111-111111111111", name: "עסק", slug: "a" };

beforeEach(() => {
  get.mockReset();
  resetCatalogSnapshotCache();
});

describe("useCatalogSnapshot", () => {
  it("starts pending, then ready with the payload of ONE unfiltered GET /producers", async () => {
    get.mockResolvedValue({ data: [ROW] });
    const { result } = renderHook(() => useCatalogSnapshot());
    expect(result.current.status).toBe("pending");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.catalog).toHaveLength(1);
    expect(get).toHaveBeenCalledWith("/producers");
    expect(get.mock.calls[0]).toHaveLength(1); // no params — unfiltered
  });

  it("reads completeness off X-Total-Count", async () => {
    get.mockResolvedValue({ data: [ROW], headers: { "x-total-count": "250" } });
    const { result } = renderHook(() => useCatalogSnapshot());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.complete).toBe(false);
    resetCatalogSnapshotCache();
    get.mockResolvedValue({ data: [ROW], headers: { "x-total-count": "1" } });
    const again = renderHook(() => useCatalogSnapshot());
    await waitFor(() => expect(again.result.current.status).toBe("ready"));
    expect(again.result.current.complete).toBe(true);
  });

  it("shares one request between mounts", async () => {
    get.mockResolvedValue({ data: [ROW] });
    const a = renderHook(() => useCatalogSnapshot());
    const b = renderHook(() => useCatalogSnapshot());
    await waitFor(() => expect(a.result.current.status).toBe("ready"));
    await waitFor(() => expect(b.result.current.status).toBe("ready"));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("a network failure reads as failed (gate nothing) and is NOT cached", async () => {
    get.mockRejectedValueOnce(new Error("down"));
    const first = renderHook(() => useCatalogSnapshot());
    await waitFor(() => expect(first.result.current.status).toBe("failed"));
    get.mockResolvedValue({ data: [ROW] });
    const second = renderHook(() => useCatalogSnapshot());
    await waitFor(() => expect(second.result.current.status).toBe("ready"));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("a malformed payload reads as failed, not as an empty catalog", async () => {
    get.mockResolvedValue({ data: { not: "a list" } });
    const { result } = renderHook(() => useCatalogSnapshot());
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.catalog).toBeNull();
  });
});
