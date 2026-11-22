/**
 * MEH-3153: e2e/webkit-core.txt lists the specs the blocking WebKit job runs
 * (`e2e-webkit-core` in .github/workflows/e2e.yml). Playwright treats each
 * line as a filter, so a renamed spec would silently drop out of the gate
 * instead of failing it. This fails on a listed path that does not exist, and
 * on a list that lost the chip-row spec the job was built for.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const LIST = path.join(ROOT, "e2e", "webkit-core.txt");

function entries(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

describe("e2e/webkit-core.txt (MEH-3153)", () => {
  const listed = entries(fs.readFileSync(LIST, "utf8"));

  it("names at least the chip-row spec", () => {
    expect(listed).toContain("e2e/flows/48-chip-row-all-visible.spec.ts");
  });

  it("every listed spec exists and is one the config runs", () => {
    const bad = listed.filter(
      (p) => !fs.existsSync(path.join(ROOT, p)) || !/^e2e\/flows\/.+\.spec\.ts$/.test(p),
    );
    expect(bad).toEqual([]);
  });

  it("parses comments and blank lines out (self-test)", () => {
    expect(entries("# c\n\n e2e/flows/a.spec.ts \n#x\n")).toEqual(["e2e/flows/a.spec.ts"]);
  });
});
