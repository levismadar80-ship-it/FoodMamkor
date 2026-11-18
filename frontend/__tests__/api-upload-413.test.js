/**
 * MEH-3399 — uploads above Vercel's ~4.5MB proxy limit.
 * A file above 4MB never reaches the network, and any 413 (Vercel's plain
 * text or the backend's JSON) reaches the caller as one Hebrew detail.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import api, { MAX_UPLOAD_BYTES, UPLOAD_TOO_LARGE_DETAIL } from "../lib/api.js";

const MB = 1024 * 1024;

function formWith(bytes) {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), "p.jpg");
  return fd;
}

describe("upload size cap (MEH-3399)", () => {
  it("is 4MB, below Vercel's ~4.5MB body limit", () => {
    expect(MAX_UPLOAD_BYTES).toBe(4 * MB);
  });

  it("rejects a 4.8MB file with the Hebrew detail and sends nothing", async () => {
    const adapter = vi.fn();
    const err = await api.post("/upload/image", formWith(4.8 * MB), { adapter }).catch((e) => e);
    expect(adapter).not.toHaveBeenCalled();
    expect(err.response.status).toBe(413);
    expect(err.response.data.detail).toBe(UPLOAD_TOO_LARGE_DETAIL);
  });

  it("sends a file of exactly 4MB (the cap is inclusive)", async () => {
    const adapter = vi.fn((config) =>
      Promise.resolve({ status: 200, statusText: "OK", headers: {}, config, data: {} }),
    );
    await api.post("/upload/image", formWith(4 * MB), { adapter });
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("leaves a 413 on a non-upload request alone", async () => {
    const adapter = vi.fn((config) => {
      const e = new Error("Request failed with status code 413");
      e.config = config;
      e.response = { status: 413, data: { detail: "הבקשה גדולה מדי." } };
      return Promise.reject(e);
    });
    const err = await api.post("/producers/me", { a: 1 }, { adapter }).catch((e) => e);
    expect(err.response.data.detail).toBe("הבקשה גדולה מדי.");
  });

  it("sends a 3MB file", async () => {
    const adapter = vi.fn((config) =>
      Promise.resolve({ status: 200, statusText: "OK", headers: {}, config, data: { url: "x" } }),
    );
    const res = await api.post("/upload/image", formWith(3 * MB), { adapter });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(res.data.url).toBe("x");
  });

  it("turns Vercel's plain-text 413 into the Hebrew detail", async () => {
    const adapter = vi.fn((config) => {
      const e = new Error("Request failed with status code 413");
      e.config = config;
      e.response = { status: 413, data: "Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE" };
      return Promise.reject(e);
    });
    const err = await api.post("/upload/image", formWith(1024), { adapter }).catch((e) => e);
    expect(err.response.data.detail).toBe(UPLOAD_TOO_LARGE_DETAIL);
  });
});
