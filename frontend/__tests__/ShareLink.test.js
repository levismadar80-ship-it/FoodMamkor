// MEH-2996: lib/share-link.js is the one owner of the share sequence.
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tryNativeShare, shareOrCopy, shareOrCopyText } from "@/lib/share-link";

const abort = Object.assign(new Error("cancel"), { name: "AbortError" });
const refused = Object.assign(new Error("no"), { name: "NotAllowedError" });
const setClipboard = (writeText) =>
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

afterEach(() => {
  delete navigator.share;
});

describe("tryNativeShare", () => {
  it("no sheet → unavailable", async () => {
    expect(await tryNativeShare({ url: "u" })).toBe("unavailable");
  });
  it("sheet resolves → shared, with the data passed through", async () => {
    navigator.share = vi.fn().mockResolvedValue(undefined);
    expect(await tryNativeShare({ title: "t", url: "u" })).toBe("shared");
    expect(navigator.share).toHaveBeenCalledWith({ title: "t", url: "u" });
  });
  it("AbortError → cancelled; any other failure → unavailable", async () => {
    navigator.share = vi.fn().mockRejectedValue(abort);
    expect(await tryNativeShare({ url: "u" })).toBe("cancelled");
    navigator.share = vi.fn().mockRejectedValue(refused);
    expect(await tryNativeShare({ url: "u" })).toBe("unavailable");
  });
});

describe("shareOrCopyText", () => {
  it("no sheet → copies and reports copied", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    expect(await shareOrCopyText({ data: { url: "u" }, copyText: "u" })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("u");
  });
  it("cancelled sheet never copies", async () => {
    const writeText = vi.fn();
    setClipboard(writeText);
    navigator.share = vi.fn().mockRejectedValue(abort);
    expect(await shareOrCopyText({ data: { url: "u" }, copyText: "u" })).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });
  it("refused sheet falls through to the copy; no clipboard either → failed", async () => {
    navigator.share = vi.fn().mockRejectedValue(refused);
    setClipboard(vi.fn().mockResolvedValue(undefined));
    expect(await shareOrCopyText({ data: { url: "u" }, copyText: "u" })).toBe("copied");
    setClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    expect(await shareOrCopyText({ data: { url: "u" }, copyText: "u" })).toBe("failed");
  });
});

describe("shareOrCopy (dashboard link cards)", () => {
  it("copies only when there is no sheet or it refused — not on shared / cancelled", async () => {
    const copy = vi.fn();
    await shareOrCopy({ url: "u", copy });
    expect(copy).toHaveBeenCalledTimes(1);
    navigator.share = vi.fn().mockResolvedValue(undefined);
    await shareOrCopy({ url: "u", text: "x", copy });
    expect(navigator.share).toHaveBeenCalledWith({ text: "x", url: "u" });
    navigator.share = vi.fn().mockRejectedValue(abort);
    await shareOrCopy({ url: "u", copy });
    expect(copy).toHaveBeenCalledTimes(1);
    navigator.share = vi.fn().mockRejectedValue(refused);
    await shareOrCopy({ url: "u", copy });
    expect(copy).toHaveBeenCalledTimes(2);
  });
});

describe("one owner (guard)", () => {
  const ROOT = path.resolve(__dirname, "..");
  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(p);
      return /\.(js|jsx)$/.test(e.name) ? [p] : [];
    });
  const files = ["app", "components", "lib"].flatMap((d) => walk(path.join(ROOT, d)));
  // A call, not a mention: `navigator.share(` or `navigator.share)` / `&& navigator.share`.
  const CALLS = /navigator\.share\s*[()&?]/;

  it("control: the scan sees the owner's own calls", () => {
    expect(CALLS.test(fs.readFileSync(path.join(ROOT, "lib", "share-link.js"), "utf8"))).toBe(true);
  });
  it("no file outside lib/share-link.js calls navigator.share", () => {
    const offenders = files
      .filter((f) => !f.endsWith(path.join("lib", "share-link.js")))
      .filter((f) => CALLS.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f));
    expect(offenders, "share through lib/share-link.js").toEqual([]);
  });
});
