/**
 * Seed — one seed, as a brand element (MEH-2833). Unlike the logo, a single
 * seed may be rotated, scaled and given any seed colour. Decoration only:
 * aria-hidden, never text/link/status. Width:height is 2:3.
 */
import { SEED_PATH, SEEDS_LIGHT } from "@/lib/brand-seeds";

// The seed's own box in the logo space: x −13…13, y −44…−6 (+ a hair of air).
const VIEWBOX = "-14 -46 28 42";
const CENTER = "0 -25";

/**
 * @param {object} props
 * @param {string} [props.color] a seed fill (default: green)
 * @param {number} [props.size] width in px; height = 1.5 × width (default 20)
 * @param {number} [props.rotate] degrees, around the seed's centre (default 0)
 * @param {boolean} [props.highlight] draw the logo's inner highlight (light fills only)
 * @param {string} [props.className]
 * @param {object} [props.style]
 */
export default function Seed({ color = SEEDS_LIGHT[0].fill, size = 20, rotate = 0, highlight = false, className = "", style }) {
  const hi = highlight ? SEEDS_LIGHT.find((s) => s.fill.toLowerCase() === String(color).toLowerCase()) : null;
  return (
    <svg
      viewBox={VIEWBOX}
      width={size}
      height={size * 1.5}
      aria-hidden="true"
      focusable="false"
      className={className}
      // A rotated seed reaches past its own 2:3 box (−36° needs ≈ ±22 of the
      // 28-wide viewBox); overflow is the caller's to crop (e.g. a card corner
      // with overflow-hidden), never the seed's own box.
      style={{ overflow: "visible", ...style }}
      data-seed-color={color}
    >
      <g transform={rotate ? `rotate(${rotate} ${CENTER})` : undefined}>
        <path d={SEED_PATH} fill={color} />
        {hi ? <ellipse cx="-3" cy="-32" rx="2.5" ry="6" fill={hi.highlight} opacity={hi.highlightOpacity} /> : null}
      </g>
    </svg>
  );
}
