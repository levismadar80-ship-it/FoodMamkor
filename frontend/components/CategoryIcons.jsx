"use client";

/**
 * CategoryIcons — hand-drawn SVG line-art for the homepage category cards.
 * Single-weight line, no fill — warmer and more unique than a generic icon set.
 *
 * Glyph family: "Assembly v2" corrected set (MEH-643). The Iteration-3 hot-fix
 * (Assembly_v2.html:1924) re-drew the whole family; the Phase-3 v8 glyphs
 * (fish, cheese wedge, loaf, oil bottle, soap+sprig) are design-rejected
 * (Assembly_v2.html:1419 — "reference only, NOT to be iterated on"). Paths are
 * lifted from Assembly_v2.html:697-702 (viewBox 0 0 120 120, stroke-2).
 *
 * Color is set at the call-site via `currentColor` (a `text-*` token on the
 * wrapper) — never a raw hex here. Keys match CATEGORY_CARDS[].key.
 *
 * History: PREMIUM_DESIGN (creation); MEH-643 (Assembly-v2 glyph family, viewBox 120, currentColor).
 */

/* Shared SVG shell — viewBox 120 to match the Assembly-v2 path space. */
function Svg({ children, size = 80, strokeWidth = 2, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* ---------- individual icons (Assembly v2 corrected family) ---------- */

// 01 — בשר, עוף ודגים · cleaver + knife crossed (food-prep abstract).
export function MeatIcon(props) {
  return (
    <Svg {...props}>
      <path d="M22 22 L88 88" />
      <path d="M22 22 L30 22 L30 30 Z" />
      <path d="M88 88 q-4 -28 -36 -36" />
      <path d="M98 22 L32 88" />
      <path d="M98 22 L90 22 L90 30 Z" />
      <path d="M32 88 L26 96" />
    </Svg>
  );
}

// 02 — ירקות, פירות ומשקים · leaf / produce.
export function VegIcon(props) {
  return (
    <Svg {...props}>
      {/* MEH-991 (HOME-16): corrected branch+leaf cluster (Assembly v2 Iteration-3, Kare #10) —
          replaces the older single-leaf card-image variant. */}
      <path d="M30 100 q4 -34 30 -50 q26 -16 60 -14" />
      <path d="M52 64 q-14 0 -20 -10 q10 -8 22 -2 q4 4 4 12 q-4 2 -6 0" />
      <path d="M76 50 q-14 0 -20 -10 q10 -8 22 -2 q4 4 4 12 q-4 2 -6 0" />
      <path d="M100 38 q-14 0 -20 -10 q10 -8 22 -2 q4 4 4 12 q-4 2 -6 0" />
      <path d="M60 80 q-12 -2 -16 -12" />
    </Svg>
  );
}

// 03 — חלב וגבינות · milk bottle.
export function DairyIcon(props) {
  return (
    <Svg {...props}>
      <path d="M48 22 h24 v10 q0 4 -4 6 q-8 4 -8 14 v40 a6 6 0 0 1 -6 6 h-12 a6 6 0 0 1 -6 -6 v-40 q0 -10 -8 -14 q-4 -2 -4 -6 v-10 z" />
      <path d="M48 28 h24" />
    </Svg>
  );
}

// 04 — לחמים ואפייה · wheat stalk.
export function BreadIcon(props) {
  return (
    <Svg {...props}>
      <path d="M60 18 v84" />
      <path d="M60 30 q-10 -6 -14 0 q-2 6 4 10 q4 2 10 2" />
      <path d="M60 30 q10 -6 14 0 q2 6 -4 10 q-4 2 -10 2" />
      <path d="M60 50 q-10 -6 -14 0 q-2 6 4 10 q4 2 10 2" />
      <path d="M60 50 q10 -6 14 0 q2 6 -4 10 q-4 2 -10 2" />
      <path d="M60 70 q-10 -6 -14 0 q-2 6 4 10 q4 2 10 2" />
      <path d="M60 70 q10 -6 14 0 q2 6 -4 10 q-4 2 -10 2" />
    </Svg>
  );
}

// 05 — שמנים ודבש · honey jar with dipper.
export function OilIcon(props) {
  return (
    <Svg {...props}>
      <path d="M48 24 h24 v8 h-24 z" />
      <path d="M44 32 h32 v60 a8 8 0 0 1 -8 8 h-16 a8 8 0 0 1 -8 -8 z" />
      <path d="M60 14 v10" />
      <path d="M58 14 q2 -4 4 0" />
      <path d="M52 52 q4 4 8 0 q4 -4 8 0" />
    </Svg>
  );
}

// 06 — טיפוח וסבונים · herb bundle.
export function SoapIcon(props) {
  return (
    <Svg {...props}>
      <path d="M60 24 v44" />
      <path d="M48 38 q4 -10 12 -14 q8 4 12 14" />
      <path d="M44 54 q6 -8 16 -10 q10 2 16 10" />
      <path d="M40 70 q8 -6 20 -8 q12 2 20 8" />
      <path d="M52 88 h16 l-2 14 h-12 z" />
    </Svg>
  );
}

export const CATEGORY_ICONS = {
  meat: MeatIcon,
  veg: VegIcon,
  dairy: DairyIcon,
  bread: BreadIcon,
  oil: OilIcon,
  care: SoapIcon,
};
