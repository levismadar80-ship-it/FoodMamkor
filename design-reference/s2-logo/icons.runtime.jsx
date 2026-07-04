"use client";

/**
 * CategoryIcons — "Assembly v2" hand-drawn glyph family (RUNTIME COPY).
 *
 * This is the browser-runnable copy used by the preview sheet (functions
 * declared + window-assigned, no ESM exports). The shippable ESM version
 * lives in CategoryIcons.jsx — generated FROM this file, so the two never
 * drift.
 *
 * Family lock (Assembly v2):
 *   viewBox 0 0 120 · fill none · stroke currentColor · strokeWidth 2 (default)
 *   strokeLinecap round · strokeLinejoin round · single weight · no fills
 *   no raw hex · no letters/text · hand-warm (slightly organic) curves
 */

function Svg({ size = 64, strokeWidth = 2, className = "", children, ...rest }) {
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
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ============================================================
   REUSED — the original six (verbatim from family lock)
   ============================================================ */

// 01 — butcher's cleaver (broad blade MASS, curved edge) crossed with a knife (slim blade + line)
function MeatIcon(props) {
  return (
    <Svg {...props}>
      <path d="M50 60 L83 27 L97 41 q-15 15 -33 33 z" />
      <path d="M53 63 L30 91" />
      <path d="M23 25 L51 45 L45 52 z" />
      <path d="M48 49 L92 90" />
    </Svg>
  );
}

// 02 — leaf / produce
function VegIcon(props) {
  return (
    <Svg {...props}>
      <path d="M40 60 q0 -20 20 -20 q20 0 20 20 q0 28 -20 38 q-20 -10 -20 -38 z" />
      <path d="M60 40 q0 -10 -8 -14" />
      <path d="M60 40 q0 -10 8 -14" />
      <path d="M52 26 q4 -6 8 -2" />
      <path d="M68 26 q-4 -6 -8 -2" />
    </Svg>
  );
}

// 03 — milk bottle — narrow neck, strong sloped SHOULDERS, collar line
function DairyIcon(props) {
  return (
    <Svg {...props}>
      <path d="M50 24 h20 v8 q1 4 4 6 q6 5 6 12 v40 a6 6 0 0 1 -6 6 h-28 a6 6 0 0 1 -6 -6 v-40 q0 -7 6 -12 q3 -2 4 -6 v-8 z" />
      <path d="M50 33 h20" />
    </Svg>
  );
}

// 04 — wheat stalk — spine + fuller grain CURLS, well spaced (not beads on a skewer)
function BreadIcon(props) {
  return (
    <Svg {...props}>
      <path d="M60 20 v80" />
      <path d="M60 34 q-9 -3 -9 -12 q0 -7 9 -8 q9 1 9 8 q0 9 -9 12 z" />
      <path d="M60 48 q-16 -2 -18 -12 q8 -2 18 8 z" />
      <path d="M60 48 q16 -2 18 -12 q-8 -2 -18 8 z" />
      <path d="M60 66 q-16 -2 -18 -12 q8 -2 18 8 z" />
      <path d="M60 66 q16 -2 18 -12 q-8 -2 -18 8 z" />
      <path d="M60 84 q-16 -2 -18 -12 q8 -2 18 8 z" />
      <path d="M60 84 q16 -2 18 -12 q-8 -2 -18 8 z" />
    </Svg>
  );
}

// 04b — BreadIconSmall — PHASE-2 chip asset (not consumed yet). Simplified bold wheat for <24px:
// spine + top grain + 2 grain pairs, fewer & fuller so it survives chip scale.
function BreadIconSmall(props) {
  return (
    <Svg {...props}>
      <path d="M60 22 v76" />
      <path d="M60 38 q-11 -3 -11 -14 q0 -8 11 -9 q11 1 11 9 q0 11 -11 14 z" />
      <path d="M60 60 q-21 -2 -23 -15 q10 -3 23 9 z" />
      <path d="M60 60 q21 -2 23 -15 q-10 -3 -23 9 z" />
      <path d="M60 84 q-21 -2 -23 -15 q10 -3 23 9 z" />
      <path d="M60 84 q21 -2 23 -15 q-10 -3 -23 9 z" />
    </Svg>
  );
}

// 05 — honey jar with dipper (REASSIGNED: was OilIcon) — WIDE bellied jar, ridged dipper head above rim
function HoneyIcon(props) {
  return (
    <Svg {...props}>
      <path d="M40 38 q-6 30 -2 50 a10 10 0 0 0 10 8 h24 a10 10 0 0 0 10 -8 q4 -20 -2 -50 z" />
      <path d="M40 38 q20 -7 40 0" />
      <path d="M54 12 q0 -4 6 -4 q6 0 6 4 q0 9 -6 11 q-6 -2 -6 -11 z" />
      <path d="M55 14 h10" />
      <path d="M55 18 h10" />
      <path d="M60 23 v18" />
      <path d="M46 62 q7 5 14 0 q7 -5 14 0" />
    </Svg>
  );
}

// 06 — natural soap — smooth banded SOAP BAR, botanical sprig on top, foam bubbles (organic gesture)
function SoapIcon(props) {
  return (
    <Svg {...props}>
      <path d="M44 48 h32 q12 0 12 13 q0 13 -12 13 h-32 q-12 0 -12 -13 q0 -13 12 -13 z" />
      <path d="M53 48 q-3 13 0 26" />
      <path d="M63 48 q-3 13 0 26" />
      <path d="M59 48 q-2 -10 1 -15" />
      <path d="M60 34 q-9 -4 -13 1 q5 6 13 1 z" />
      <path d="M60 30 q9 -3 13 2 q-6 5 -13 0 z" />
      <circle cx="40" cy="40" r="3" />
      <circle cx="34" cy="46" r="2" />
      <circle cx="82" cy="40" r="2.5" />
    </Svg>
  );
}

/* ============================================================
   NEW — 13 glyphs
   ============================================================ */

// 07 — שמנים · oils — olive sprig (curving branch · 2 leaves · 2 olives). NOT a bottle.
function OilsIcon(props) {
  return (
    <Svg {...props}>
      <path d="M62 18 q-10 30 -6 54 q2 12 -2 28" />
      <path d="M58 36 q-22 -12 -32 -4 q10 16 32 6 z" />
      <path d="M57 58 q22 -12 32 -4 q-10 16 -32 6 z" />
      <path d="M56 74 q-5 5 -7 10" />
      <path d="M48 83 q-8 0 -8 9 q0 9 8 9 q8 0 8 -9 q0 -9 -8 -9 z" />
      <path d="M57 76 q6 5 8 11" />
      <path d="M68 87 q-8 0 -8 9 q0 9 8 9 q8 0 8 -9 q0 -9 -8 -9 z" />
    </Svg>
  );
}

// 08 — ביצים · eggs — two eggs nested in a shallow cradle (cradle = organic gesture)
function EggsIcon(props) {
  return (
    <Svg {...props}>
      <path d="M50 34 q-15 8 -15 28 q0 17 15 17 q15 0 15 -17 q0 -20 -15 -28 z" />
      <path d="M72 42 q-12 7 -12 23 q0 14 12 14 q12 0 12 -14 q0 -17 -12 -23 z" />
      <path d="M28 80 q32 22 64 0" />
      <path d="M36 84 q24 14 48 0" />
      <path d="M30 79 q-3 3 -4 8" />
      <path d="M90 79 q3 3 4 8" />
      <path d="M44 90 l5 5" />
      <path d="M76 90 l-5 5" />
    </Svg>
  );
}

// 09 — פירות · fruit — stemmed apple + leaf (round lobed mass vs the Veg leaf)
function FruitIcon(props) {
  return (
    <Svg {...props}>
      <path d="M60 46 q-14 -10 -26 4 q-10 12 -7 32 q3 22 18 26 q8 2 15 -3 q7 5 15 3 q15 -4 18 -26 q3 -20 -7 -32 q-12 -14 -26 -4 z" />
      <path d="M60 46 q1 -12 7 -18" />
      <path d="M66 30 q12 -9 21 -4 q-3 12 -19 11 z" />
    </Svg>
  );
}

// 10 — מותססים וכבושים · ferments & pickles — clamp-lid jar (bowed belly) + rising bubbles
function FermentsIcon(props) {
  return (
    <Svg {...props}>
      <path d="M40 46 q-3 26 -1 44 a7 7 0 0 0 7 6 h28 a7 7 0 0 0 7 -6 q2 -18 -1 -44 z" />
      <path d="M44 46 v-7 q0 -4 4 -4 h24 q4 0 4 4 v7" />
      <path d="M48 35 h24" />
      <path d="M40 51 q-6 1 -6 7" />
      <path d="M80 51 q6 1 6 7" />
      <circle cx="52" cy="82" r="4" />
      <circle cx="64" cy="71" r="3" />
      <circle cx="57" cy="61" r="2.2" />
    </Svg>
  );
}

// 11 — מוצרים מוכנים · prepared foods — lidded pot + knob + TWO steam wisps (motif A)
function PreparedIcon(props) {
  return (
    <Svg {...props}>
      <path d="M32 58 q-1 16 1 18 a12 12 0 0 0 11 10 h32 a12 12 0 0 0 11 -10 q2 -2 1 -18 z" />
      <path d="M28 56 h64" />
      <path d="M30 56 q30 -16 60 0" />
      <path d="M56 41 q4 -5 8 0" />
      <path d="M33 68 q-8 1 -8 8" />
      <path d="M87 68 q8 1 8 8" />
      <path d="M50 36 q-6 -6 0 -12 q5 -5 0 -10" />
      <path d="M70 36 q6 -6 0 -12 q-5 -5 0 -10" />
    </Svg>
  );
}

// 12 — תבלינים וצמחי תיבול · spices — mortar (deep belly) + pestle resting in at an angle
function SpicesIcon(props) {
  return (
    <Svg {...props}>
      <path d="M30 56 q30 -13 60 0 q-30 13 -60 0 z" />
      <path d="M31 57 q4 38 29 42 q25 -4 29 -42" />
      <path d="M50 98 q10 5 20 0" />
      <path d="M62 72 l9 -24" />
      <path d="M69 50 q6 -3 8 2 q1 4 -4 5" />
    </Svg>
  );
}

// 13 — יין, בירה ומשקאות · beverages — bottle (shoulder curve) + glass overlapping it
function BeveragesIcon(props) {
  return (
    <Svg {...props}>
      <path d="M46 26 h12 v8 q0 5 4 8 q7 5 7 15 v32 a5 5 0 0 1 -5 5 h-18 a5 5 0 0 1 -5 -5 v-32 q0 -10 7 -15 q4 -3 4 -8 v-8 z" />
      <path d="M62 56 h26 q-1 17 -13 21 q-12 -4 -13 -21 z" />
      <path d="M75 77 v17" />
      <path d="M66 94 h18" />
    </Svg>
  );
}

// 14 — שוקולד וממתקים בוטיק · chocolate — tilted 2×3 bar, snapped corner offset, thickness edge
function ChocolateIcon(props) {
  return (
    <Svg {...props}>
      <path d="M34 47 L83 41 L89 79 L40 85 Z" />
      <path d="M37 65 L86 59" />
      <path d="M51 45 L56 83" />
      <path d="M67 43 L73 81" />
      <path d="M40 85 l2 6 q23 -1 45 -5 l2 -6" />
      <path d="M70 25 L88 22 L92 39 L74 42 Z" />
    </Svg>
  );
}

// 15 — צמחי מרפא ותוספים · medicinal herbs — chamomile (looped petals) + drooping leaf pair
function MedicinalIcon(props) {
  return (
    <Svg {...props}>
      <path d="M60 40 q-3 30 -1 60" />
      <circle cx="60" cy="30" r="4" />
      <path d="M60 25 q-5 -6 0 -11 q5 5 0 11 z" />
      <path d="M62 27 q9 -9 14 -5 q1 5 -8 11 z" />
      <path d="M64 27 q11 -3 16 3 q-5 5 -16 3 z" />
      <path d="M58 27 q-9 -9 -14 -5 q-1 5 8 11 z" />
      <path d="M56 27 q-11 -3 -16 3 q5 5 16 3 z" />
      <path d="M59 62 q-18 2 -24 16 q14 4 25 -8 z" />
      <path d="M60 70 q18 2 24 16 q-14 4 -25 -8 z" />
    </Svg>
  );
}

// 16 — קרמים ושמנים · creams & body oils — wide tub, lid ajar + soft cream swirl peak
function CreamsIcon(props) {
  return (
    <Svg {...props}>
      <path d="M34 62 q-2 14 0 22 a8 8 0 0 0 8 8 h36 a8 8 0 0 0 8 -8 q2 -8 0 -22 z" />
      <path d="M34 62 q26 8 52 0" />
      <path d="M42 52 q22 -10 40 -2 q-20 10 -40 2 z" />
      <path d="M80 48 q5 -3 7 1" />
      <path d="M50 62 q2 -9 8 -11 q5 -1 5 4 q4 -3 7 0 q3 3 -1 6" />
    </Svg>
  );
}

// 17 — תכשירי צמחים · herbal preparations — dropper / tincture bottle (bowed body), drop (motif A)
function PreparationsIcon(props) {
  return (
    <Svg {...props}>
      <path d="M54 32 q6 -11 12 0 q-2 7 -12 0 z" />
      <path d="M57 34 v14" />
      <path d="M63 34 v14" />
      <path d="M51 48 h18 v4 q0 3 -3 3 h-12 q-3 0 -3 -3 z" />
      <path d="M45 58 q-2 18 0 30 a6 6 0 0 0 6 6 h18 a6 6 0 0 0 6 -6 q2 -12 0 -30 z" />
      <path d="M60 62 q-4 5 0 9 q4 -4 0 -9 z" />
    </Svg>
  );
}

// 18 — נרות וארומה · candles & aroma — pillar candle (bowed body), tall flame, wax drip (motif A)
function CandlesIcon(props) {
  return (
    <Svg {...props}>
      <path d="M44 52 q-2 20 0 40 a4 4 0 0 0 4 4 h24 a4 4 0 0 0 4 -4 q2 -20 0 -40 z" />
      <path d="M44 52 q16 -7 32 0" />
      <path d="M60 50 v-5" />
      <path d="M60 45 q-8 -7 -5 -16 q2 -6 5 -10 q3 4 5 10 q3 9 -5 16 z" />
      <path d="M68 60 q5 9 0 16 q-5 -7 0 -16 z" />
    </Svg>
  );
}

// 19 — תוספי תזונה · dietary supplements — capsule + seam + 2nd smaller capsule overlapping (motif A)
function SupplementsIcon(props) {
  return (
    <Svg {...props}>
      <path d="M34 66 L66 34 A14 14 0 0 1 86 54 L54 86 A14 14 0 0 1 34 66 Z" />
      <path d="M50 50 L70 70" />
      <path d="M57 61 L83 69 A9 9 0 0 1 77 87 L51 79 A9 9 0 0 1 57 61 Z" />
    </Svg>
  );
}

/* ---------- key-based lookup (all 19) ---------- */
const CATEGORY_ICONS = {
  meat: MeatIcon,          // בשר ודגים
  dairy: DairyIcon,        // חלב וגבינות
  bread: BreadIcon,        // לחמים ואפייה
  veg: VegIcon,            // ירקות
  care: SoapIcon,          // סבונים טבעיים
  honey: HoneyIcon,        // דבש  (reassigned from oil)
  oils: OilsIcon,          // שמנים
  eggs: EggsIcon,          // ביצים
  fruit: FruitIcon,        // פירות
  ferments: FermentsIcon,  // מותססים וכבושים
  prepared: PreparedIcon,  // מוצרים מוכנים
  spices: SpicesIcon,      // תבלינים וצמחי תיבול
  beverages: BeveragesIcon,// יין, בירה ומשקאות
  chocolate: ChocolateIcon,// שוקולד וממתקים בוטיק
  medicinal: MedicinalIcon,// צמחי מרפא ותוספים
  creams: CreamsIcon,      // קרמים ושמנים
  preparations: PreparationsIcon, // תכשירי צמחים
  candles: CandlesIcon,    // נרות וארומה
  supplements: SupplementsIcon,   // תוספי תזונה
};

Object.assign(window, {
  Svg,
  MeatIcon, VegIcon, DairyIcon, BreadIcon, BreadIconSmall, HoneyIcon, SoapIcon,
  OilsIcon, EggsIcon, FruitIcon, FermentsIcon, PreparedIcon, SpicesIcon,
  BeveragesIcon, ChocolateIcon, MedicinalIcon, CreamsIcon, PreparationsIcon,
  CandlesIcon, SupplementsIcon,
  CATEGORY_ICONS,
});
