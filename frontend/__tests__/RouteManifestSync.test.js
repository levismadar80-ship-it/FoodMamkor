import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import staticRoutes from "../lib/static-routes.json";

// MEH-1398: middleware.js skips existence-checking these static segments so it
// never false-404s a real static route. The manifest (lib/static-routes.json)
// is a hand-maintained mirror of the literal route segments directly under
// app/[locale]/, so it silently drifts the moment someone adds or removes a
// route dir. This test is the bidirectional guard: it re-derives the segment
// set from the filesystem and asserts it equals the manifest, both ways. Add an
// app/[locale]/<route>/ dir => add it to static-routes.json, or this reds CI.
//
// Excluded from the literal-segment set (Next.js App Router conventions, none
// of which are single-literal path segments the middleware would misread as a
// producer slug):
//   [slug], [id], ...   dynamic / catch-all segments (the [slug] catch-all is
//                        exactly what the middleware's existence-check targets)
//   (group)             route groups — organizational, contribute no segment
//   _private            private folders — never routable
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCALE_DIR = path.join(HERE, "..", "app", "[locale]");

function filesystemSegments() {
  return readdirSync(LOCALE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    // skip dynamic `[seg]`, route groups `(grp)`, private `_dir`, dotfiles.
    // In `[[(_.]` the first `[` opens the char class; the second is a literal
    // `[` char (not a typo).
    .filter((name) => !/^[[(_.]/.test(name))
    .toSorted();
}

describe("MEH-1398 route manifest ↔ filesystem sync", () => {
  const fsSegments = filesystemSegments();
  const manifest = staticRoutes.routes.toSorted();

  it("manifest is not empty (guards a parser/format drift no-op)", () => {
    expect(manifest.length).toBeGreaterThan(0);
    expect(fsSegments.length).toBeGreaterThan(0);
  });

  it("every filesystem route segment is declared in the manifest", () => {
    const missing = fsSegments.filter((seg) => !staticRoutes.routes.includes(seg));
    expect(missing, `add these to lib/static-routes.json: ${missing.join(", ")}`).toEqual([]);
  });

  it("every manifest entry still maps to a real app/[locale] dir", () => {
    const orphans = staticRoutes.routes.filter((seg) => !fsSegments.includes(seg));
    expect(orphans, `remove these from lib/static-routes.json: ${orphans.join(", ")}`).toEqual([]);
  });

  it("manifest exactly equals the filesystem segment set", () => {
    expect(manifest).toEqual(fsSegments);
  });
});
