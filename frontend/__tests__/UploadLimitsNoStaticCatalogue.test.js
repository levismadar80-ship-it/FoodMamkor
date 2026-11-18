/**
 * v1.5.6 Lighthouse budget: lib/upload-limits.js is imported by lib/api.js,
 * which nearly every page loads. A static import of a messages catalogue there
 * ships the whole catalogue (~110 KB gzipped) to every page, the home page
 * included. The message is loaded with a dynamic import() instead.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const STATIC_CATALOGUE = /^\s*import\s+[^;]*from\s+["'][^"']*messages\/(he|en)\.json["']/m;

describe("modules every page loads never import a messages catalogue statically", () => {
  for (const rel of ["lib/upload-limits.js", "lib/api.js"]) {
    it(`${rel} has no static import of messages/*.json`, () => {
      const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
      expect(src).not.toMatch(STATIC_CATALOGUE);
    });
  }
});
