/**
 * MEH-3077 — every OSM tile layer uses the single host the OSM tile usage
 * policy asks for (tile.openstreetmap.org), never the deprecated a/b/c shards
 * ({s}.tile…), and the CSP img-src admits that bare host.
 *
 * Why the CSP half matters: `https://*.tile.openstreetmap.org` does NOT match
 * the bare host, so moving the layers without widening img-src would block
 * every tile with no failing test.
 *
 * Files are read as source (next.config.js cannot be require()d under jsdom,
 * see PosthogCsp.test.js).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (f) => fs.readFileSync(path.join(process.cwd(), f), "utf-8");
// Block and line comments stripped, so a historical note is not a "use".
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const walk = (dir) =>
  fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return walk(rel);
    return /\.(jsx?|tsx?)$/.test(e.name) ? [rel] : [];
  });
const SOURCE_FILES = ["components", "app", "lib"].flatMap(walk);
// The three tile layers known today (anchors: the scan below must find them).
const TILE_LAYER_FILES = [
  "components/MapComponent.jsx",
  "components/MiniMap.jsx",
  "components/HomepageMiniMap.jsx",
];
const SINGLE_HOST = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const SHARD = /(\{s\}|\b[abc])\.tile\.openstreetmap\.org/;

const imgSrc = () => {
  const m = read("next.config.js").match(/`img-src ([^`]*)`/);
  return m ? m[1].replace(/\$\{[^}]*\}/g, "").trim().split(/\s+/) : null;
};

describe("OSM tile host (MEH-3077)", () => {
  it("control: the CSP reader finds the real img-src directive", () => {
    expect(imgSrc()).toContain("https://res.cloudinary.com");
  });

  it.each(TILE_LAYER_FILES)("%s uses the single tile host", (f) => {
    expect(read(f)).toContain(SINGLE_HOST);
  });

  it.each(TILE_LAYER_FILES)("%s has no a/b/c shard URL", (f) => {
    expect(read(f)).not.toMatch(SHARD);
  });

  it("scan: every file with an OSM tile URL template is a known tile layer", () => {
    const withTiles = SOURCE_FILES.filter((f) => /openstreetmap\.org\/\{z\}/.test(code(f)));
    expect(withTiles.sort()).toEqual([...TILE_LAYER_FILES].sort());
  });

  it("scan: no source file under components/app/lib uses an a/b/c shard", () => {
    const offenders = SOURCE_FILES.filter((f) => SHARD.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it("the layout preconnects to the single host, not the shards", () => {
    const layout = read("app/[locale]/layout.js");
    expect(layout).toContain('href="https://tile.openstreetmap.org"');
    expect(layout).not.toMatch(/href="https:\/\/[abc]\.tile\.openstreetmap\.org"/);
  });

  it("CSP img-src admits the bare tile host", () => {
    expect(imgSrc()).toContain("https://tile.openstreetmap.org");
  });

  it("CSP img-src no longer allows the unused shard wildcard", () => {
    expect(imgSrc()).not.toContain("https://*.tile.openstreetmap.org");
  });
});
