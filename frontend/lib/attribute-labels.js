/**
 * MEH-1082 [T-C]: single source of truth for shared attribute chip labels.
 *
 * MEH-2130 — this map is now DERIVED, not declared. The axis definitions moved
 * to lib/filter-taxonomy.js (one object per axis: label, scope, evidence,
 * subtext, group, surfaces, param names), and `ATTRIBUTE_LABELS` is the
 * cross-surface projection of it: exactly those axes whose `surfaces` covers
 * home AND /producers AND /map. Everything below still holds — what changed is
 * that membership is computed from one declaration instead of maintained by
 * hand in parallel with CHIPS_CONFIG and TOGGLE_CHIPS.
 *
 * The import surface is unchanged on purpose: `ATTRIBUTE_LABELS.vegan.label`
 * reads exactly as before, so no consumer and no test needed rewriting.
 *
 * Both the /producers filter row (`producer-filters.js` CHIPS_CONFIG) and the
 * /map filter chips (`map-chips.js` TOGGLE_CHIPS) render these, so the taxonomy
 * reads identically on every surface ("רישוי מאומת" / "משלוח").
 *
 * MEH-1507 — Label Scope Contract: every entry is an OBJECT carrying the label
 * PLUS its scope×evidence metadata and (where it applies) an in-component
 * explanatory subtext. This closes the class of bugs where a consumer-facing
 * label silently over-claimed — a product-level filter reading as a whole-
 * business property (MEH-1439 diet tooltips), a self-declaration reading as a
 * certificate (MEH-986 kosher · MEH-1259 organic · MEH-1492 editor's-pick).
 *   - scope    ∈ business | any-product | facility — WHAT the label applies to.
 *   - evidence ∈ self-declared | admin-verified | system — WHO established it.
 *   - subtext  — in-component explanation (Baymard: explain filters in-place,
 *                not by lengthening the label). null when the FilterSheet falls
 *                back to a BADGE_CONFIG tooltip (kosher · verified). LOCKED copy
 *                per MEH-1507 §hebrew_copy — do not paraphrase.
 * Full contract + the four precedents: .claude/rules/labels.md.
 *
 * NOTE — `label` stays a plain string on every consumer: CHIPS_CONFIG /
 * TOGGLE_CHIPS spread these objects, so `chip.label` is unchanged and the chip
 * ROW renders byte-identical.
 *
 * Surface-specific keys stay OUT of this map — and after MEH-2130 that is a
 * CONSEQUENCE of their `surfaces` field rather than a second thing to remember:
 *   - `grass_fed` — /map only (`surfaces: ["map"]`).
 *   - `pickup_points` — WAS /map-only under MEH-2046 and is now cross-surface,
 *     so it appears here. That promotion is the substance of MEH-2130: the
 *     backend filter `?pickup_points=true` is public and global, so nothing but
 *     config placement kept "איסוף עצמי" off the listing surfaces.
 *   - `open_for_orders_now` — WAS /producers-only under MEH-1881 and is now
 *     cross-surface (MEH-2131), so it appears here too. Same shape as
 *     `pickup_points` above: the backend has answered
 *     `?open_for_orders_now=true` since MEH-1881, and only config placement
 *     kept the chip off home and /map.
 *
 * That two of the three bullets here have now flipped from "surface-local" to
 * "cross-surface" is the argument for deriving this map rather than writing it:
 * each flip was ONE `surfaces` edit, and the parity test turned membership into
 * a gate that the promotion had to satisfy on every surface at once. Before
 * MEH-2130 the same change meant editing three lists and hoping they agreed.
 *
 * The bullet for `open_for_orders_now` said the opposite until MEH-2131, having
 * been written one ticket earlier and falsified by the next — which is why it
 * is worth saying plainly that a comment describing membership is a SECOND
 * statement of a fact the code already derives, and will go stale exactly this
 * way again. The runtime answer is `SHARED_AXIS_KEYS`; this block is a reading
 * aid and loses to it. Caught by the CI reviewer on MEH-2131, not by a gate.
 *
 * MEH-1418: labels stay text-only (Emoji-LOCK v2 forbids emoji literals). The
 * chips carry Phosphor LEADING ICONS via lib/chip-icons.js — aria-hidden
 * glyphs, the approved substitute (MEH-990 precedent), NOT part of the label.
 */
import { FILTER_AXES, SHARED_AXIS_KEYS } from "@/lib/filter-taxonomy";

export const ATTRIBUTE_LABELS = Object.fromEntries(
  SHARED_AXIS_KEYS.map((key) => {
    const { label, scope, evidence, subtext } = FILTER_AXES[key];
    // `group` is deliberately not projected: it is FilterSheet wiring, and this
    // map's shape ({label, scope, evidence, subtext}) is what MEH-1507 pinned.
    return [key, { label, scope, evidence, subtext }];
  }),
);
