/**
 * Module:   font-gate
 * Purpose:  Decide whether a page's web fonts actually loaded, so a VRT shot
 *           is never taken of system-fallback typography.
 * Does NOT: observe the page or attach listeners — parity.spec.ts collects the
 *           inputs (document.fonts state + failed font requests) and passes
 *           them here. This file is pure so it can be self-tested.
 * Related:  frontend/e2e/visual/parity.spec.ts (settle()),
 *           frontend/__tests__/FontGate.test.js (self-test)
 * History:  MEH-1727 (creation)
 */

/** Snapshot of `document.fonts` taken in the page. */
export type FontState = {
  /** `document.fonts.size` — how many faces the page declared. */
  total: number;
  /** How many of those reached `status === "loaded"`. */
  loaded: number;
};

export type FontVerdict = {
  ok: boolean;
  /** Populated only when `ok` is false. Written to be readable in CI output. */
  reason?: string;
};

/**
 * MEH-1727 — floor for actually-loaded font faces.
 *
 * Deliberately NOT the 11 `.woff2` files the MEH-1727 trace counted. Google
 * serves `unicode-range` subsets and `display=swap` loads a face only once a
 * glyph in its range is needed, so the exact number legitimately varies by page
 * and viewport. Asserting 11 would be brittle in the direction that costs most
 * — a red suite on a healthy page. The load-bearing check is
 * `failed.length === 0`; this floor exists to catch the specific `total = 0`
 * state that `document.fonts.ready` reports as success.
 */
export const MIN_LOADED_FONT_FACES = 1;

/**
 * The gate `document.fonts.ready` should have been.
 *
 * `document.fonts.ready` resolves even when every face failed to download, and
 * (verified 28/07) resolves with `status === "loaded"` while
 * `document.fonts.size === 0` — success for a page that loaded no font at all.
 *
 * Order matters: failed requests are reported FIRST, because they name the
 * cause. A page whose fonts were blocked by CORS also has `total === 0`, and
 * "document.fonts is empty" would send the reader looking at the CSS instead of
 * at the network.
 */
export function judgeFonts(fonts: FontState, failed: readonly string[]): FontVerdict {
  if (failed.length > 0) {
    return {
      ok: false,
      reason:
        `MEH-1727: ${failed.length} font request(s) failed — the shot would ` +
        `capture fallback typography:\n${failed.join("\n")}`,
    };
  }
  if (fonts.total <= 0) {
    return {
      ok: false,
      reason:
        "MEH-1727: document.fonts is empty — no @font-face reached the page, " +
        "yet document.fonts.ready resolved. This is the total=0 false green.",
    };
  }
  if (fonts.loaded < MIN_LOADED_FONT_FACES) {
    return {
      ok: false,
      reason:
        `MEH-1727: ${fonts.total} face(s) declared but ${fonts.loaded} reached ` +
        `status="loaded" (floor ${MIN_LOADED_FONT_FACES}).`,
    };
  }
  return { ok: true };
}

/**
 * What the OLD gate did, kept ONLY so the self-test can prove the new one
 * discriminates (MEH-1619: a construction that the previous assertion also
 * failed is not evidence for the change).
 *
 * `await document.fonts.ready` has no failure mode — it is an await, not an
 * assertion — so as a predicate it is the constant `true`. That is the whole
 * defect, and stating it as code is what lets the self-test show the two
 * verdicts diverging on identical input.
 *
 * DO NOT call this from parity.spec.ts.
 */
export function judgeFontsLegacy(_fonts: FontState, _failed: readonly string[]): FontVerdict {
  return { ok: true };
}
