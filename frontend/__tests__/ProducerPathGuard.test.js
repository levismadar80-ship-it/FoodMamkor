/**
 * `/producer/[id]` takes a UUID only (app/[locale]/producer/[id]/page.js calls
 * GET /producers/{id}; a slug there is a 422 → «בית העסק הזה לא נמצא»). The
 * surprise-bag row linked `/producer/${producer.slug || producer.id}` and every
 * bag opened the not-found page.
 *
 * Two halves:
 *  1. producerPath() / rescueBagPath() produce the right path per key.
 *  2. A source scan: no file under app/ components/ lib/ hand-writes a
 *     `/producer/${…}` template whose expression mentions `slug`. Build it with
 *     producerPath() instead.
 *
 * Shape-limited, on purpose: it catches the one-line template that shipped.
 * It does NOT see `"/producer/" + slug`, a template split across lines, or a
 * slug held in another variable first. The helper is the real fix; this only
 * stops the exact regression.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { producerPath, rescueBagPath, RESCUE_SECTION_ID } from "@/lib/producer-path";

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["app", "components", "lib"];
const UUID = "48a62a03-58c4-463b-82f4-cdba3b4701c9";

// `/producer/${ <expr containing "slug"> }` — the dead-link shape.
export const SLUG_UNDER_PRODUCER = /\/producer\/\$\{[^}]*\bslug\b[^}]*\}/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("producerPath", () => {
  it("prefers the slug route", () => {
    expect(producerPath({ slug: "ruach-hasadeh", id: UUID })).toBe("/ruach-hasadeh");
  });
  it("falls back to /producer/{uuid} without a slug", () => {
    expect(producerPath({ slug: null, id: UUID })).toBe(`/producer/${UUID}`);
  });
  it("returns null with neither key", () => {
    expect(producerPath({ name: "x" })).toBeNull();
    expect(producerPath(null)).toBeNull();
  });
  it("rescueBagPath anchors the business page's surprise-bag section", () => {
    expect(rescueBagPath({ slug: "ruach-hasadeh", id: UUID })).toBe("/ruach-hasadeh#section-rescue");
  });
  it("the anchor is the id RescueSection actually renders", () => {
    const src = fs.readFileSync(path.join(ROOT, "components/rescue/RescueSection.jsx"), "utf8");
    expect(src).toContain("id={RESCUE_SECTION_ID}");
    expect(RESCUE_SECTION_ID).toBe("section-rescue");
  });
});

describe("no hand-written /producer/${…slug…} link", () => {
  it("the pattern catches the shape that shipped (self-test)", () => {
    expect(SLUG_UNDER_PRODUCER.test("href={`/producer/${producer.slug || producer.id}`}")).toBe(true);
    expect(SLUG_UNDER_PRODUCER.test("`/producer/${p.slug}`")).toBe(true);
    // The correct fallback shape must stay legal.
    expect(SLUG_UNDER_PRODUCER.test("p.slug ? `/${p.slug}` : `/producer/${p.id}`")).toBe(false);
  });

  it("scans a real corpus (control: the files exist and include ProducerCard)", () => {
    const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.some((f) => f.endsWith(path.join("components", "ProducerCard.jsx")))).toBe(true);
    expect(files.length).toBeGreaterThan(100);
  });

  it("no source file builds /producer/ from a slug", () => {
    const offenders = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))
      .flatMap((file) =>
        fs
          .readFileSync(file, "utf8")
          .split("\n")
          .map((line, i) => ({ line, n: i + 1 }))
          // Prose that quotes the bad shape (this file's own subject) is not a link.
          .filter(({ line }) => !/^\s*(\*|\/\/|\/\*|\{\/\*)/.test(line))
          .filter(({ line }) => SLUG_UNDER_PRODUCER.test(line))
          .map(({ n }) => `${path.relative(ROOT, file)}:${n}`)
      );
    expect(offenders).toEqual([]);
  });
});
