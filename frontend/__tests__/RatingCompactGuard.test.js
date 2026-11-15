/**
 * MEH-3071 — the listing-card rating «★ X.X (N)» is RatingCompact
 * (components/ui/RatingCompact.jsx), gated by hasCardRating()
 * (lib/rating-gate.js). Before 13/11 ProducerCard and MapProducerCard each
 * wrote the line and the ≥3-reviews rule by hand.
 *
 * A file that formats an average rating by hand (`….toFixed(1)` on an
 * avg/rating value) must be in ALLOWED, with the reason it is a different
 * format. The list may only shrink.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { hasCardRating, CARD_RATING_MIN_REVIEWS } from "@/lib/rating-gate";

const ROOT = path.resolve(__dirname, "..");
const OWNER = "components/ui/RatingCompact.jsx";

const ALLOWED = {
  "app/[locale]/producer/[id]/components/ProducerHeader.jsx": "business page: big number + review-count link",
  "components/ReviewsSection.jsx": "reviews section summary + star aria",
  "app/[locale]/producer/dashboard/page.js": "owner dashboard stat",
  "app/[locale]/producer/dashboard/insights/page.js": "owner insights stat",
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(p, out);
    } else if (/\.(jsx?|tsx?)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}
const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d))).map((p) => ({
  rel: path.relative(ROOT, p).split(path.sep).join("/"),
  src: fs.readFileSync(p, "utf8"),
}));

// an average formatted by hand: (…avg… | …rating…).toFixed(1)
const HAND_AVG = /(?:avg|rating)\w*\)?\.toFixed\(1\)/i;

describe("RatingCompactGuard (MEH-3071)", () => {
  it("self-test: catches the old card lines, not the component call", () => {
    expect(HAND_AVG.test("{Number(producer.avg_rating).toFixed(1)} ({producer.reviews_count})")).toBe(true);
    expect(HAND_AVG.test("{rating.toFixed(1)} ({reviewsCount})")).toBe(true);
    expect(HAND_AVG.test("<RatingCompact avg={p.avg_rating} count={p.reviews_count} />")).toBe(false);
    // control: the owner holds the one sanctioned toFixed(1), so the pattern sees it
    expect(HAND_AVG.test(files.find((f) => f.rel === OWNER).src)).toBe(true);
  });

  it("no hand-formatted average rating outside RatingCompact and ALLOWED", () => {
    const offenders = files
      .filter((f) => f.rel !== OWNER && !ALLOWED[f.rel] && HAND_AVG.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("ALLOWED is not stale (each entry still formats by hand)", () => {
    const stale = Object.keys(ALLOWED).filter((rel) => {
      const f = files.find((x) => x.rel === rel);
      return !f || !HAND_AVG.test(f.src);
    });
    expect(stale).toEqual([]);
  });

  it("both listing cards use RatingCompact and hasCardRating", () => {
    for (const rel of ["components/ProducerCard.jsx", "components/MapProducerCard.jsx"]) {
      const src = files.find((f) => f.rel === rel).src;
      expect(src, rel).toMatch(/<RatingCompact\b/);
      expect(src, rel).toMatch(/hasCardRating\(/);
    }
  });

  it("hasCardRating: 0 / 2 / 3+ reviews, bad averages", () => {
    expect(CARD_RATING_MIN_REVIEWS).toBe(3);
    expect(hasCardRating({ reviews_count: 0, avg_rating: 4.5 })).toBe(false);
    expect(hasCardRating({ reviews_count: 2, avg_rating: 4.5 })).toBe(false);
    expect(hasCardRating({ reviews_count: 3, avg_rating: 4.5 })).toBe(true);
    expect(hasCardRating({ reviews_count: 12, avg_rating: "4.2" })).toBe(true);
    expect(hasCardRating({ reviews_count: 5, avg_rating: 0 })).toBe(false);
    expect(hasCardRating({ reviews_count: 5, avg_rating: null })).toBe(false);
    expect(hasCardRating(null)).toBe(false);
    // a numeric string count is read as its number (both cards agree now)
    expect(hasCardRating({ reviews_count: "5", avg_rating: 4 })).toBe(true);
  });
});
