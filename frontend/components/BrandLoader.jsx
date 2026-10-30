/**
 * BrandLoader — the site-wide "waiting for a whole page" indicator (MEH-2599).
 *
 * The logo mark (public/logo.svg, inlined so each seed can animate) stands
 * still while its five seeds light up in sequence — the Google-dots rhythm in
 * the brand's own colours. It does NOT rotate: the big sites animate colour,
 * not the logo itself (Google's arc, Netflix's ring), and a spinning logo
 * reads as dated. Sapir confirmed this call on 29/10.
 *
 * Pure CSS (`.brand-loader*` rules in app/globals.css); no JS timers, so it works inside a server component (`app/[locale]/loading.js`)
 * and inside client auth gates alike.
 *
 * Rules it encodes (MEH-2599 research: NN/g "Skeleton Screens 101" and
 * "progress indicators" thresholds; big sites animate brand colour, not the
 * logo itself, and show nothing for sub-second loads):
 *   - Reveal after 400 ms. A load that resolves sooner shows NOTHING — an
 *     indicator that flashes for a frame is worse than none (NN/g).
 *   - Use it only when the SHAPE of the coming page is unknown. A list, a grid
 *     or a table gets a Skeleton (components/Skeleton.jsx), never this.
 *   - `prefers-reduced-motion`: the globals.css kill-switch collapses every
 *     animation to ~0 ms, so the mark lands on its resting state (all seeds
 *     lit); globals.css also pins the wrapper visible there, so the mark can
 *     never be stuck at opacity 0 when animations are off.
 *
 * No visible copy: the only text is sr-only. Callers pass the already-localised
 * label (`a11y.loading` on the server, whatever key the screen already used on
 * the client) — this component does not import next-intl, which is what lets a
 * server component render it.
 */

const SEEDS = [
  // [rotate, fill, highlight, highlightOpacity] — verbatim from public/logo.svg
  [36, "#2E6853", "#7BAA90", 0.5],
  [108, "#C8632E", "#EAA378", 0.5],
  [180, "#C99846", "#E8C788", 0.5],
  [252, "#D9C8B0", "#1F4A3A", 0.2],
  [324, "#5A8F73", "#A3C7B3", 0.5],
];

const SEED_PATH =
  "M 0,-44 C 10,-44 13,-32 11,-20 C 9,-12 5,-8 0,-6 C -5,-8 -9,-12 -11,-20 C -13,-32 -10,-44 0,-44 Z";

function BrandMark({ size = 56, className = "" }) {
  return (
    <svg
      className={`brand-loader-mark ${className}`}
      viewBox="-60 -60 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      {SEEDS.map(([deg, fill, hi, hiOpacity], i) => (
        <g key={deg} transform={`rotate(${deg})`}>
          <g className="brand-loader-seed" style={{ animationDelay: `${i * 0.16}s` }}>
            <path d={SEED_PATH} fill={fill} />
            <ellipse cx="-3" cy="-32" rx="2.5" ry="6" fill={hi} opacity={hiOpacity} />
          </g>
        </g>
      ))}
    </svg>
  );
}

/**
 * @param {object} props
 * @param {string} props.label   localised sr-only announcement (required)
 * @param {number} [props.size]  mark size in px (56 default, 64 on wide stages)
 * @param {string} [props.className] extra classes on the wrapper (height, padding)
 * @param {string} [props.testId] data-testid passthrough for existing specs
 */
export default function BrandLoader({ label, size = 56, className = "", testId }) {
  return (
    <div
      className={`brand-loader ${className}`}
      role="status"
      aria-busy="true"
      data-testid={testId}
    >
      <span className="sr-only">{label}</span>
      <BrandMark size={size} />
    </div>
  );
}
