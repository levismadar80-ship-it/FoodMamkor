/**
 * SeedMark — the full bloom (the logo's five seeds, in place), as decoration.
 * MEH-2833: the logo is never rotated, recoloured or rearranged; a crop
 * (supergraphic) is the caller's overflow-hidden, not a transform here.
 * Always aria-hidden — the brand name is never carried by this mark.
 */
import { SEED_PATH, SEED_ROTATIONS, SEEDS_LIGHT, SEEDS_DARK } from "@/lib/brand-seeds";

/**
 * @param {object} props
 * @param {number} [props.size] rendered width/height in px (default 28)
 * @param {"light"|"dark"} [props.variant] light = logo.svg; dark = the on-dark set
 * @param {string} [props.className]
 */
export default function SeedMark({ size = 28, variant = "light", className = "" }) {
  const seeds = variant === "dark" ? SEEDS_DARK : SEEDS_LIGHT;
  return (
    <svg
      viewBox="-60 -60 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
      data-seed-mark={variant}
    >
      {seeds.map((seed, i) => (
        <g key={seed.name} transform={`rotate(${SEED_ROTATIONS[i]})`} opacity={variant === "dark" ? 1 : 0.94}>
          <path d={SEED_PATH} fill={seed.fill} data-seed={seed.name} />
          {seed.highlight ? (
            <ellipse cx="-3" cy="-32" rx="2.5" ry="6" fill={seed.highlight} opacity={seed.highlightOpacity} />
          ) : null}
        </g>
      ))}
    </svg>
  );
}
