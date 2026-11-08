/**
 * Module:   brand-seeds
 * Purpose:  The seed layer's one source: the logo's five pomegranate seeds —
 *           shape, colours (light + on-dark), order — and a stable colour per
 *           id for single-seed marks.
 * Does NOT: render anything (components/brand/SeedMark.jsx, Seed.jsx), and
 *           define UI colours: seeds are decoration in the seed shape only —
 *           never text, buttons, links or status (docs/DESIGN.md «Seed layer»).
 * Related:  public/logo.svg (the light set + highlights, verbatim) ·
 *           docs/DESIGN.md «Seed layer» (the on-dark set, approved 08/11) ·
 *           components/BrandLoader.jsx · producer/[id]/components/ProducerActivities.jsx
 * History:  MEH-2833 PR 1 (creation — the colours lived inline in BrandLoader
 *           and in the group-buy progress mark, MEH-2827 PR 7).
 */

/** The seed outline, in the logo's -60…60 coordinate space (tip at y=-44). */
export const SEED_PATH =
  "M 0,-44 C 10,-44 13,-32 11,-20 C 9,-12 5,-8 0,-6 C -5,-8 -9,-12 -11,-20 C -13,-32 -10,-44 0,-44 Z";

/** Logo order — any sequence of seeds follows it (DESIGN.md rule 3). */
export const SEED_ORDER = ["green", "terracotta", "gold", "sand", "sage"];

/** The bloom: each seed's rotation in the logo, in SEED_ORDER. */
export const SEED_ROTATIONS = [36, 108, 180, 252, 324];

/** On light/cream — verbatim from public/logo.svg (fill + inner highlight). */
export const SEEDS_LIGHT = [
  { name: "green", fill: "#2E6853", highlight: "#7BAA90", highlightOpacity: 0.5 },
  { name: "terracotta", fill: "#C8632E", highlight: "#EAA378", highlightOpacity: 0.5 },
  { name: "gold", fill: "#C99846", highlight: "#E8C788", highlightOpacity: 0.5 },
  { name: "sand", fill: "#D9C8B0", highlight: "#1F4A3A", highlightOpacity: 0.2 },
  { name: "sage", fill: "#5A8F73", highlight: "#A3C7B3", highlightOpacity: 0.5 },
];

/** On dark (bg-primary, the footer) — the approved on-dark set (DESIGN.md, 08/11). */
export const SEEDS_DARK = [
  { name: "green", fill: "#F5F0E8" },
  { name: "terracotta", fill: "#E8823A" },
  { name: "gold", fill: "#E0B266" },
  { name: "sand", fill: "#D9C8B0" },
  { name: "sage", fill: "#8FB89F" },
];

/** Light fills in logo order (sequences: progress marks, step numerals). */
export const SEED_FILLS = SEEDS_LIGHT.map((s) => s.fill);

// Single-seed marks sit on sand/background-alt plates, where the sand seed
// disappears (1.4:1) — so the per-id pick skips it.
const PICKABLE = SEEDS_LIGHT.filter((s) => s.name !== "sand");

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * A stable seed colour for an id (or name): the same id always gets the same
 * colour, so a business keeps "its" seed across cards and visits.
 * @param {string|number|null|undefined} id
 * @returns {{name: string, fill: string, highlight: string, highlightOpacity: number}}
 */
export function seedColorFor(id) {
  return PICKABLE[hash(String(id ?? "")) % PICKABLE.length];
}
