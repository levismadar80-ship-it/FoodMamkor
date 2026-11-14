/**
 * MEH-3140: the instruction files every session loads named "Next.js 14"
 * while package.json was on 16. An agent trusts a stale line there over what
 * it sees, and writes code for the wrong major. Any "Next.js <N>" in those
 * files must equal the installed major. The version is read from package.json.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(__dirname, "..", "..");
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "frontend", "package.json"), "utf8"));
const nextMajor = Number(String(pkg.dependencies.next).match(/(\d+)\./)[1]);

function instructionFiles() {
  const rules = fs
    .readdirSync(path.join(REPO, ".claude", "rules"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(".claude", "rules", f));
  return [
    "CLAUDE.md",
    "docs/CONTEXT.md",
    "docs/ARCHITECTURE.md",
    "frontend/components/CLAUDE.md",
    "frontend/e2e/CLAUDE.md",
    ...rules,
  ];
}

/** [{ file, line, major }] for every "Next.js <N>" / "Next <N>" mention. */
function nextMentions(read, files) {
  return files.flatMap((file) =>
    read(file)
      .split("\n")
      .flatMap((text, i) =>
        [...text.matchAll(/\bNext(?:\.js)?\s+(\d{1,2})(?![\d.]*\s*(?:px|%|days?|files?))\b/g)].map((m) => ({
          file,
          line: i + 1,
          major: Number(m[1]),
        })),
      ),
  );
}

describe("instruction files name the installed Next.js major", () => {
  it("finds a version mention when there is one (self-test)", () => {
    const fake = { "a.md": "intro\nNext.js 14 (App Router)\nNext 16.4 later\nno version here" };
    expect(nextMentions((f) => fake[f], ["a.md"])).toEqual([
      { file: "a.md", line: 2, major: 14 },
      { file: "a.md", line: 3, major: 16 },
    ]);
  });

  it("every mention equals package.json", () => {
    const read = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
    const mentions = nextMentions(read, instructionFiles());
    // Control: the scan really found the stack line in frontend.md.
    expect(mentions.some((m) => m.file === path.join(".claude", "rules", "frontend.md"))).toBe(true);
    expect(nextMajor).toBeGreaterThan(0);
    expect(mentions.filter((m) => m.major !== nextMajor)).toEqual([]);
  });
});
