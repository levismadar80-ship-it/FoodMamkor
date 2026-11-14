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

  it("the layout preconnects to the single host, not the shards", () => {
    const layout = read("app/[locale]/layout.js");
    expect(layout).toContain('href="https://tile.openstreetmap.org"');
    expect(layout).not.toMatch(/href="https:\/\/[abc]\.tile\.openstreetmap\.org"/);
  });

  it("CSP img-src admits the bare tile host", () => {
    expect(imgSrc()).toContain("https://tile.openstreetmap.org");
  });
});
