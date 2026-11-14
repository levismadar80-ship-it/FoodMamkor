/**
 * MEH-3139: next-intl is the only translation mechanism. The old homegrown
 * layer (lib/language-context.js + lib/i18n-key-map.js) is deleted. Two
 * mechanisms side by side meant every file had to know which one it was on.
 * This fails if the old files, or an import of them, come back.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const OLD_MODULES = ["lib/language-context", "lib/i18n-key-map"];

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/** Files under `dirs` that import, require or mock one of the old modules. */
function importersOfOldLayer(read, files) {
  const re = /["'`](?:@\/|(?:\.\.?\/)+)?lib\/(?:language-context|i18n-key-map)(?:\.js)?["'`]/;
  return files.filter((f) => re.test(read(f)));
}

describe("one i18n mechanism", () => {
  it("finds an import of the old layer when there is one (self-test)", () => {
    const fake = {
      "a.jsx": 'import { useLanguage } from "@/lib/language-context";',
      "b.js": 'vi.mock("@/lib/i18n-key-map", () => ({}));',
      "c.jsx": 'import { useTranslations } from "next-intl";',
    };
    expect(importersOfOldLayer((f) => fake[f], Object.keys(fake))).toEqual(["a.jsx", "b.js"]);
  });

  it("the old files are gone", () => {
    const back = OLD_MODULES.filter((m) => ["js", "jsx", "ts"].some((ext) => fs.existsSync(path.join(ROOT, `${m}.${ext}`))));
    expect(back).toEqual([]);
  });

  it("nothing imports or mocks the old layer", () => {
    const files = ["app", "components", "lib", "__tests__", "e2e"]
      .flatMap((d) => sourceFiles(d))
      .filter((f) => !f.endsWith("OneI18nMechanismGuard.test.js"));
    // Control: the walk really read the tree (a dead walk also returns []).
    expect(files.length).toBeGreaterThan(500);
    expect(files).toContain(path.join("components", "LanguageToggle.jsx"));
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    expect(importersOfOldLayer(read, files)).toEqual([]);
  });
});
