/**
 * MEH-3400 — a big camera photo is shrunk in the browser before upload.
 *
 * Driven through the real lib/api.js (axios with a fake adapter), so these go
 * red if the interceptor is not wired, not only if the helper is wrong. The
 * canvas is faked (jsdom has none): createImageBitmap reports the photo's
 * size, toBlob hands back a JPEG of a known size, and the test reads what the
 * adapter was actually given.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import api from "../lib/api.js";
import { fitWithin, MAX_EDGE_PX, RESIZE_ABOVE_BYTES } from "../lib/prepare-upload.js";

const MB = 1024 * 1024;
const SHRUNK_BYTES = 900 * 1024;

function photo(bytes, type = "image/jpeg", name = "IMG_0001.JPG") {
  return new File([new Uint8Array(bytes)], name, { type });
}

function sentFile(adapter) {
  return adapter.mock.calls[0][0].data.get("file");
}

const okAdapter = () =>
  vi.fn((config) => Promise.resolve({ status: 200, statusText: "OK", headers: {}, config, data: { url: "x" } }));

let canvasSize;
let bitmapSpy;
let drawCalls;

beforeEach(() => {
  canvasSize = null;
  drawCalls = [];
  bitmapSpy = vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() }));
  vi.stubGlobal("createImageBitmap", bitmapSpy);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
    canvasSize = { width: this.width, height: this.height };
    const ctx = {
      fillStyle: "",
      fillRect: vi.fn(() => drawCalls.push(`fill:${ctx.fillStyle}`)),
      drawImage: vi.fn(() => drawCalls.push("draw")),
    };
    return ctx;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb, type) => {
    cb(new Blob([new Uint8Array(SHRUNK_BYTES)], { type }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prepareUpload through lib/api.js (MEH-3400)", () => {
  it("an 8MB 4000px photo is sent as a 2000px JPEG under 4MB, not refused", async () => {
    const adapter = okAdapter();
    const fd = new FormData();
    fd.append("file", photo(8 * MB));
    await api.post("/upload/image", fd, { adapter });

    expect(adapter).toHaveBeenCalledTimes(1);
    const sent = sentFile(adapter);
    expect(sent.type).toBe("image/jpeg");
    expect(sent.size).toBe(SHRUNK_BYTES);
    expect(sent.name).toBe("IMG_0001.jpg");
    expect(canvasSize).toEqual({ width: 2000, height: 1500 });
    // A portrait phone photo stays upright, and a transparent PNG gets a white ground.
    expect(bitmapSpy).toHaveBeenCalledWith(expect.any(File), { imageOrientation: "from-image" });
    expect(drawCalls).toEqual(["fill:#fff", "draw"]);
  });

  it("keeps every other field, their order and the caller's Content-Type", async () => {
    const adapter = okAdapter();
    const fd = new FormData();
    fd.append("producer_id", "42");
    fd.append("file", photo(8 * MB));
    fd.append("file", photo(300 * 1024, "image/png", "small.png"));
    fd.append("caption", "שולחן שבת");
    await api.post("/upload/image", fd, { adapter, headers: { "Content-Type": "multipart/form-data" } });

    const sent = adapter.mock.calls[0][0].data;
    expect(sent).toBeInstanceOf(FormData);
    expect([...sent.keys()]).toEqual(["producer_id", "file", "file", "caption"]);
    expect(sent.get("producer_id")).toBe("42");
    expect(sent.get("caption")).toBe("שולחן שבת");
    const [big, small] = sent.getAll("file");
    expect(big.size).toBe(SHRUNK_BYTES);
    expect(small.name).toBe("small.png");
    expect(small.size).toBe(300 * 1024);
  });

  it("a photo the form already tried to shrink is not decoded again by the interceptor", async () => {
    HTMLCanvasElement.prototype.toBlob.mockImplementation((cb, type) => {
      cb(new Blob([new Uint8Array(3 * MB)], { type }));
    });
    const { prepareUpload } = await import("../lib/prepare-upload.js");
    const picked = await prepareUpload(photo(2 * MB, "image/png", "logo.png"));
    const adapter = okAdapter();
    const fd = new FormData();
    fd.append("file", picked);
    await api.post("/upload/image", fd, { adapter });
    expect(bitmapSpy).toHaveBeenCalledTimes(1);
    expect(sentFile(adapter)).toBe(picked);
  });

  it("a 500KB photo is sent unchanged, without being decoded", async () => {
    const adapter = okAdapter();
    const original = photo(500 * 1024);
    const fd = new FormData();
    fd.append("file", original);
    await api.post("/upload/image", fd, { adapter });

    expect(bitmapSpy).not.toHaveBeenCalled();
    expect(sentFile(adapter).size).toBe(original.size);
  });

  it("a photo the browser cannot decode is sent as is, so the 4MB cap still answers in Hebrew", async () => {
    bitmapSpy.mockRejectedValueOnce(new Error("decode failed"));
    const adapter = okAdapter();
    const fd = new FormData();
    fd.append("file", photo(8 * MB));
    const err = await api.post("/upload/image", fd, { adapter }).catch((e) => e);

    expect(adapter).not.toHaveBeenCalled();
    expect(err.response.status).toBe(413);
  });

  it("a GIF, HEIC or PDF is never touched", async () => {
    for (const [type, name] of [["image/gif", "a.gif"], ["image/heic", "a.heic"], ["application/pdf", "a.pdf"]]) {
      const adapter = okAdapter();
      const fd = new FormData();
      fd.append("file", photo(2 * MB, type, name));
      await api.post("/upload/kashrut-cert", fd, { adapter });
      expect(sentFile(adapter).type).toBe(type);
    }
    expect(bitmapSpy).not.toHaveBeenCalled();
  });

  it("a shrink that comes out bigger than the original keeps the original", async () => {
    HTMLCanvasElement.prototype.toBlob.mockImplementation((cb, type) => {
      cb(new Blob([new Uint8Array(3 * MB)], { type }));
    });
    const adapter = okAdapter();
    const fd = new FormData();
    fd.append("file", photo(2 * MB, "image/png", "logo.png"));
    await api.post("/upload/image", fd, { adapter });
    expect(sentFile(adapter).type).toBe("image/png");
  });
});

describe("fitWithin", () => {
  it("caps the long side at 2000px and keeps the ratio, never enlarges", () => {
    expect(MAX_EDGE_PX).toBe(2000);
    expect(RESIZE_ABOVE_BYTES).toBe(1.5 * MB);
    expect(fitWithin(3000, 4000)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800 });
  });
});
