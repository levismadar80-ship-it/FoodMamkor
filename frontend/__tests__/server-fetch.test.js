/**
 * MEH-977: serverFetch() — explicit timeout + bounded retry on transient
 * Vercel→Railway socket errors (ECONNRESET / UND_ERR_SOCKET).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// server-fetch.js imports "server-only", which throws when loaded outside a
// React Server Component. Stub it to a no-op so the module is testable.
vi.mock("server-only", () => ({}));

import { serverFetch } from "@/lib/server-fetch";

function transientError(code) {
  const err = new TypeError("fetch failed");
  err.cause = { code };
  return err;
}

const OK = { ok: true, status: 200 };

describe("serverFetch (MEH-977)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries a transient ECONNRESET to success", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(transientError("ECONNRESET"))
      .mockResolvedValueOnce(OK);
    vi.stubGlobal("fetch", fetchMock);

    const res = await serverFetch("http://api/x", {}, { retries: 2, backoffMs: 1 });

    expect(res).toBe(OK);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a transient UND_ERR_SOCKET to success", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(transientError("UND_ERR_SOCKET"))
      .mockResolvedValueOnce(OK);
    vi.stubGlobal("fetch", fetchMock);

    const res = await serverFetch("http://api/x", {}, { retries: 2, backoffMs: 1 });

    expect(res).toBe(OK);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a non-transient error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(transientError("ENOTFOUND"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      serverFetch("http://api/x", {}, { retries: 2, backoffMs: 1 }),
    ).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting retries on persistent transient errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(transientError("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      serverFetch("http://api/x", {}, { retries: 2, backoffMs: 1 }),
    ).rejects.toThrow("fetch failed");
    // first attempt + 2 retries = 3 calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry a timeout AbortError (no .code → not transient)", async () => {
    // Our own timeout aborts the fetch → AbortError, which carries no `.code`,
    // so isTransient() is false and it propagates without a retry. Pins the
    // behaviour against accidentally adding "AbortError" to TRANSIENT_CODES.
    const abortErr = new DOMException("The operation was aborted.", "AbortError");
    const fetchMock = vi.fn().mockRejectedValue(abortErr);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      serverFetch("http://api/x", {}, { retries: 2, backoffMs: 1 }),
    ).rejects.toThrow(/aborted/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a non-ok HTTP response (returns it as-is)", async () => {
    const notFound = { ok: false, status: 404 };
    const fetchMock = vi.fn().mockResolvedValue(notFound);
    vi.stubGlobal("fetch", fetchMock);

    const res = await serverFetch("http://api/x", {}, { retries: 2, backoffMs: 1 });

    expect(res).toBe(notFound);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
