/**
 * MEH-1727 — self-test for the VRT font gate.
 *
 * Why this file exists (.claude/rules/testing.md, MEH-1619):
 *
 * The thing being replaced is `await document.fonts.ready`, which is not an
 * assertion at all — it is an await with no failure mode. So "I broke the fonts
 * and the suite went red" would prove nothing about the change: the interesting
 * question is whether the OLD gate would also have gone red on the same input.
 * It would not have. It cannot. That is the entire defect.
 *
 * So the discriminating construction is not a broken page — it is feeding BOTH
 * classifiers the same three synthetic states and asserting they sort them
 * differently. Deterministic: no browser, no network, no timing.
 *
 * It exercises the REAL implementation imported from e2e/visual/font-gate.ts —
 * the same function parity.spec.ts::settle() calls. Not a copy.
 */

import { describe, it, expect } from "vitest";
import {
  judgeFonts,
  judgeFontsLegacy,
  MIN_LOADED_FONT_FACES,
} from "../e2e/visual/font-gate";

/** A page whose webfonts loaded normally. */
const HEALTHY = { fonts: { total: 11, loaded: 11 }, failed: [] };

/**
 * The measured MEH-1727 state: every cross-origin .woff2 rejected at CORS
 * preflight, so nothing was fetched and document.fonts stayed empty. Strings
 * are the shape parity.spec.ts pushes (`<url> — <errorText>`).
 */
const CORS_BLOCKED = {
  fonts: { total: 0, loaded: 0 },
  failed: [
    "https://fonts.gstatic.com/s/frankruhllibre/v21/a.woff2 — net::ERR_FAILED",
    "https://fonts.gstatic.com/s/heebo/v26/b.woff2 — net::ERR_FAILED",
  ],
};

/**
 * The subtle one, and the reason the floor is not just `failed.length === 0`:
 * no request FAILED, yet no face is loaded. `document.fonts.ready` resolves
 * here reporting success — the total=0 false green verified on 28/07.
 */
const SILENT_EMPTY = { fonts: { total: 0, loaded: 0 }, failed: [] };

/**
 * Neutral control: a page that declared faces and loaded them, with a count
 * well under the 11 the trace saw. Must PASS — unicode-range subsetting means
 * a healthy page legitimately loads only the faces it needs, and a gate that
 * reds here would be worse than the bug it replaces.
 */
const HEALTHY_SUBSET = { fonts: { total: 3, loaded: 3 }, failed: [] };

describe("MEH-1727 self-test — the gate discriminates", () => {
  it("sorts the three states apart", () => {
    expect(judgeFonts(HEALTHY.fonts, HEALTHY.failed).ok).toBe(true);
    expect(judgeFonts(CORS_BLOCKED.fonts, CORS_BLOCKED.failed).ok).toBe(false);
    expect(judgeFonts(SILENT_EMPTY.fonts, SILENT_EMPTY.failed).ok).toBe(false);
  });

  it("the OLD gate passes every one of them — which is why this change exists", () => {
    // If this ever starts failing, the legacy stub has been given real logic
    // and the discrimination claim below is no longer meaningful.
    expect(judgeFontsLegacy(HEALTHY.fonts, HEALTHY.failed).ok).toBe(true);
    expect(judgeFontsLegacy(CORS_BLOCKED.fonts, CORS_BLOCKED.failed).ok).toBe(true);
    expect(judgeFontsLegacy(SILENT_EMPTY.fonts, SILENT_EMPTY.failed).ok).toBe(true);
  });

  it("the two classifiers disagree on exactly the broken states, and agree on the healthy one", () => {
    const cases = [HEALTHY, CORS_BLOCKED, SILENT_EMPTY, HEALTHY_SUBSET];
    const disagreements = cases.filter(
      (c) => judgeFonts(c.fonts, c.failed).ok !== judgeFontsLegacy(c.fonts, c.failed).ok
    );
    // Exactly the two broken states — not the healthy one, not the subset.
    expect(disagreements).toEqual([CORS_BLOCKED, SILENT_EMPTY]);
  });
});

describe("MEH-1727 — judgeFonts", () => {
  it("does not red a healthy page that loaded only a subset of faces", () => {
    expect(judgeFonts(HEALTHY_SUBSET.fonts, HEALTHY_SUBSET.failed).ok).toBe(true);
  });

  it("reports failed requests FIRST, because they name the cause", () => {
    // CORS_BLOCKED trips both the failed-request branch and the total=0 branch.
    // The message must point at the network, not at the CSS.
    const reason = judgeFonts(CORS_BLOCKED.fonts, CORS_BLOCKED.failed).reason;
    expect(reason).toContain("font request(s) failed");
    expect(reason).toContain("fonts.gstatic.com");
    expect(reason).not.toContain("document.fonts is empty");
  });

  it("names the total=0 false green explicitly when nothing failed", () => {
    const reason = judgeFonts(SILENT_EMPTY.fonts, SILENT_EMPTY.failed).reason;
    expect(reason).toContain("document.fonts is empty");
  });

  it("reds when faces are declared but none finish loading", () => {
    const verdict = judgeFonts({ total: 11, loaded: 0 }, []);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('reached status="loaded"');
  });

  it("passes at exactly the floor", () => {
    expect(judgeFonts({ total: 11, loaded: MIN_LOADED_FONT_FACES }, []).ok).toBe(true);
  });
});
