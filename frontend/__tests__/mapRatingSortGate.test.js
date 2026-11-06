/**
 * MEH-2778 — /map's «הכי מדורגות» is gated on the unfiltered catalog, the
 * same population /producers gates on, so a filter cannot make it vanish.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import {
  RATING_SORT_THRESHOLD,
  isRatingSortEnabled,
  mapRatingGateSource,
} from "@/lib/rating-gate";

const rated = (n) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, reviews_count: 2 }));

describe("MEH-2778 — mapRatingGateSource", () => {
  it("a filter that empties the feed does not hide the rating sort", () => {
    const snapshot = rated(RATING_SORT_THRESHOLD);
    const filteredFeed = [];
    expect(isRatingSortEnabled(mapRatingGateSource(snapshot, filteredFeed))).toBe(true);
    // CONTROL: counting the filtered feed (the old source) hides it.
    expect(isRatingSortEnabled(filteredFeed)).toBe(false);
  });

  it("an unfiltered catalog below the threshold keeps it hidden", () => {
    expect(isRatingSortEnabled(mapRatingGateSource(rated(RATING_SORT_THRESHOLD - 1), rated(99)))).toBe(false);
  });

  it("falls back to the live feed only while the snapshot is missing", () => {
    expect(mapRatingGateSource(null, rated(1))).toHaveLength(1);
    expect(mapRatingGateSource(undefined, rated(2))).toHaveLength(2);
    expect(mapRatingGateSource([], rated(3))).toHaveLength(0); // an empty snapshot is an answer
  });

  it("MapClient gates through it (not on feed.allProducers alone)", () => {
    const src = readFileSync(join(__dirname, "..", "app/[locale]/map/MapClient.jsx"), "utf8");
    expect(src).toMatch(/isRatingSortEnabled\(\s*mapRatingGateSource\(\s*feed\.catalogSnapshot,\s*feed\.allProducers\s*\)\s*\)/);
    expect(src).not.toMatch(/isRatingSortEnabled\(\s*feed\.allProducers\s*\)/);
  });
});
