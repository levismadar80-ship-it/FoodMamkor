/**
 * MEH-3946 — optionalChunk: a lazily loaded add-on whose code fails to load
 * renders nothing (and warns) instead of rejecting into the error boundary.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { optionalChunk } from "@/lib/optional-chunk";

afterEach(() => vi.restoreAllMocks());

describe("optionalChunk (MEH-3946)", () => {
  it("passes a loaded module through untouched", async () => {
    const mod = { default: () => <p>chat</p> };
    await expect(optionalChunk(() => Promise.resolve(mod), "Chat")()).resolves.toBe(mod);
  });

  it("a failed load resolves to a component that renders nothing, and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = Object.assign(new Error("Failed to load chunk /_next/static/chunks/x.js"), { name: "ChunkLoadError" });
    const mod = await optionalChunk(() => Promise.reject(err), "Chat")();
    const { container } = render(<mod.default />);
    expect(container.innerHTML).toBe("");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("Chat");
  });

  it("webpack's message form counts as a failed download too", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const mod = await optionalChunk(() => Promise.reject(new Error("Loading chunk 42 failed.")), "Map")();
    expect(typeof mod.default).toBe("function");
  });

  it("a module that loaded and then threw still rejects (a real bug reaches the error page)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bug = new TypeError("L.map is not a function");
    await expect(optionalChunk(() => Promise.reject(bug), "MiniMap")()).rejects.toBe(bug);
    expect(warn).not.toHaveBeenCalled();
  });
});
