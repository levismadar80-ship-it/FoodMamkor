/**
 * MEH-2774 — lib/seo.js imports both full message files, which is fine only
 * while no client component imports it. This guard fails if one ever does.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SCAN = ["app", "components", "lib"];
const IMPORTS_SEO = /from\s+["'](@\/lib\/seo|\.\.?\/(?:[\w.-]+\/)*seo)["']/;
const USE_CLIENT = /^\s*["']use client["']/m;

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : files(p);
    return /\.(jsx?|tsx?)$/.test(e.name) ? [p] : [];
  });
}

describe("lib/seo stays server-only", () => {
  const all = SCAN.flatMap((d) => files(path.join(ROOT, d)));
  const importers = all.filter((f) => IMPORTS_SEO.test(fs.readFileSync(f, "utf8")));

  it("the scan sees the known server importers (probe is alive)", () => {
    const rel = importers.map((f) => path.relative(ROOT, f));
    expect(rel).toContain(path.join("app", "[locale]", "producer", "[id]", "page.js"));
    expect(rel).toContain(path.join("app", "sitemap.js"));
  });

  it("no 'use client' file imports lib/seo", () => {
    const client = importers.filter((f) => USE_CLIENT.test(fs.readFileSync(f, "utf8")));
    expect(client.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("the detector itself catches a client importer", () => {
    const fake = '"use client";\nimport { buildTitle } from "@/lib/seo";\n';
    expect(IMPORTS_SEO.test(fake) && USE_CLIENT.test(fake)).toBe(true);
  });
});
