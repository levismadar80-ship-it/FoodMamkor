// MEH-3064 (shared-components research item 7): lib/clipboard.js is the one
// place that writes to the clipboard. A hand-written navigator.clipboard
// write elsewhere is how a copy button ends up silent on failure (no catch:
// VanityLinkCard) or saying «הועתק» when nothing was copied (admin outreach).
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { copyText, copyOrThrow } from "@/lib/clipboard";

const ROOT = path.resolve(__dirname, "..");
const SCAN = ["app", "components", "lib", "hooks"];
const OWNER = "lib/clipboard.js";
// The only exception, and it can only shrink: a ClipboardItem write that must
// start inside the tap before its text exists (the mint is still running).
const ALLOWED = { "app/[locale]/admin/producers/AdminDraftClaimActions.jsx": 1 };

// A code use, not prose: the token followed by `.` or `?.`, on a line that is
// not a comment.
const USE = /navigator\s*(?:\?\.|\.)\s*clipboard\b|\[\s*["']clipboard["']\s*\]|\{[^}]*\bclipboard\b[^}]*\}\s*=\s*(?:window\s*\.\s*)?navigator|execCommand\(\s*["']copy/g;
// Comments never count: whole-line ones, and a trailing `// …` or `/* … */`.
const isComment = (line) => /^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line);
const stripComments = (line) => line.replace(/\/\*.*?\*\//g, "").replace(/(^|[^:])\/\/.*$/, "$1");

function countUses(src) {
  return src
    .split("\n")
    .filter((l) => !isComment(l))
    .map(stripComments)
    .reduce((n, l) => n + (l.match(USE) || []).length, 0);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
    return /\.(jsx?|tsx?)$/.test(e.name) ? [p] : [];
  });
}

describe("ClipboardGuard — counter self-test", () => {
  it("counts code uses and skips comments", () => {
    expect(countUses("await navigator.clipboard.writeText(x);")).toBe(1);
    expect(countUses("const w = navigator.clipboard?.writeText\n  ? navigator.clipboard.writeText(u)")).toBe(2);
    expect(countUses("const clip = ok ? navigator.clipboard : undefined;")).toBe(1);
    // a chain broken across lines: `navigator.clipboard` ends its line
    expect(countUses("    navigator.clipboard\n      .writeText(url)")).toBe(1);
    // the ways around a naive pattern (review of MEH-3103)
    expect(countUses("navigator?.clipboard?.writeText(x)")).toBe(1);
    expect(countUses("const { clipboard } = navigator;")).toBe(1);
    expect(countUses("navigator['clipboard'].writeText(x)")).toBe(1);
    expect(countUses("fn(navigator.clipboard, x)")).toBe(1);
    // the other half lib/clipboard.js owns: a hand-written textarea fallback
    expect(countUses('ok = document.execCommand("copy");')).toBe(1);
    // trailing comments are prose; a URL's // is not a comment
    expect(countUses("foo(); // navigator.clipboard.writeText")).toBe(0);
    expect(countUses("bar(); /* navigator.clipboard */ baz();")).toBe(0);
    expect(countUses('const u = "https://x"; navigator.clipboard.writeText(u);')).toBe(1);
    expect(countUses("// `navigator.clipboard` is absent in an insecure context")).toBe(0);
    expect(countUses("    // MEH-1428: navigator.clipboard.writeText had no catch")).toBe(0);
  });
  it("anchored to a real file: the allowed exception still counts 1", () => {
    const f = "app/[locale]/admin/producers/AdminDraftClaimActions.jsx";
    expect(countUses(fs.readFileSync(path.join(ROOT, f), "utf8"))).toBe(1);
  });
});

describe("ClipboardGuard — no hand-written clipboard writes", () => {
  const files = SCAN.flatMap((d) => walk(path.join(ROOT, d)));
  it("scans a real corpus", () => {
    expect(files.length).toBeGreaterThan(200);
  });
  it("only lib/clipboard.js (and the listed exception) touch navigator.clipboard", () => {
    const found = {};
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      if (rel === OWNER) continue;
      const n = countUses(fs.readFileSync(f, "utf8"));
      if (n) found[rel] = n;
    }
    expect(found).toEqual(ALLOWED);
  });
});

describe("copyText", () => {
  const setClipboard = (value) =>
    Object.defineProperty(navigator, "clipboard", { value, configurable: true });
  afterEach(() => {
    delete document.execCommand;
    setClipboard(undefined);
  });

  it("Clipboard API resolves → true", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    expect(await copyText("x")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("x");
  });
  it("API refused → textarea fallback; its answer is the result", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    document.execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText("x")).toBe(true);
    document.execCommand = vi.fn().mockReturnValue(false);
    expect(await copyText("x")).toBe(false);
  });
  it("no API and a throwing fallback → false, never a throw, no textarea left behind", async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => {
      throw new Error("nope");
    });
    expect(await copyText("x")).toBe(false);
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });
  it("copyOrThrow rejects exactly when copyText answers false", async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    await expect(copyOrThrow("x")).resolves.toBeUndefined();
    setClipboard(undefined);
    await expect(copyOrThrow("x")).rejects.toThrow("copy failed");
  });
});
