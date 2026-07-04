// S2 / MEH-637 — five-seed pomegranate mark + Hebrew wordmark.
// Surface variants:
//   variant="horizontal"  — mark + Hebrew wordmark + italic tagline (desktop/tablet)
//   variant="mark"        — five-seed mark only (mobile rest)
//   variant="on-dark"     — cream-on-warm-dark variant (drawer / footer)
// Server Component — no client behaviour.

const SEED = "M 0,-44 C 10,-44 13,-32 11,-20 C 9,-12 5,-8 0,-6 C -5,-8 -9,-12 -11,-20 C -13,-32 -10,-44 0,-44 Z";

const SEEDS = [
  { rotate: 36,  fill: "#2E6853", hi: "#7BAA90", hiOpacity: 0.5 },
  { rotate: 108, fill: "#C8632E", hi: "#EAA378", hiOpacity: 0.5 },
  { rotate: 180, fill: "#C99846", hi: "#E8C788", hiOpacity: 0.5 },
  { rotate: 252, fill: "#D9C8B0", hi: "#1F4A3A", hiOpacity: 0.2 },
  { rotate: 324, fill: "#5A8F73", hi: "#A3C7B3", hiOpacity: 0.5 },
];

// Cream-only seed opacities for the on-dark variant (drawer / footer).
const ON_DARK_OPACITY = [0.96, 0.78, 0.62, 0.48, 0.88];

function MarkSeeds({ variant }) {
  return (
    <g opacity="0.94">
      {SEEDS.map((s, i) => (
        <g key={i} transform={`rotate(${s.rotate})`}>
          <path
            d={SEED}
            fill={variant === "on-dark" ? "var(--background)" : s.fill}
            opacity={variant === "on-dark" ? ON_DARK_OPACITY[i] : 1}
          />
          {variant !== "on-dark" && (
            <ellipse cx="-3" cy="-32" rx="2.5" ry="6" fill={s.hi} opacity={s.hiOpacity} />
          )}
        </g>
      ))}
    </g>
  );
}

export default function Logo({ variant = "horizontal", className = "" }) {
  if (variant === "horizontal") {
    // Mark + Hebrew wordmark + italic gold tagline. Used in desktop + tablet navbar.
    return (
      <span className={`inline-flex items-center ${className}`} aria-label="מהמקור">
        <svg viewBox="0 0 460 140" role="img" aria-label="מהמקור" className="block h-[51px] w-[168px]">
          <g transform="translate(410 70) scale(0.58)">
            <MarkSeeds variant="horizontal" />
          </g>
          <text x="350" y="76" textAnchor="end" direction="rtl"
                fontFamily="'Frank Ruhl Libre',serif" fontWeight="700" fontSize="46" fill="#1C1A17">
            מהמקור
          </text>
          <text x="350" y="100" textAnchor="end" direction="rtl"
                fontFamily="'Cormorant Garamond',serif" fontStyle="italic" fontWeight="500"
                fontSize="15" fill="#8B6914" letterSpacing="0.02em">
            — from the source
          </text>
        </svg>
      </span>
    );
  }

  if (variant === "on-dark") {
    return (
      <span className={`inline-flex items-center ${className}`} aria-label="מהמקור">
        <svg viewBox="-60 -60 120 120" role="img" aria-label="מהמקור" className="block h-9 w-9">
          {SEEDS.map((_, i) => (
            <g key={i} transform={`rotate(${SEEDS[i].rotate})`}>
              <path d={SEED} fill="var(--background)" opacity={ON_DARK_OPACITY[i]} />
            </g>
          ))}
        </svg>
      </span>
    );
  }

  // variant === "mark"
  return (
    <span className={`inline-flex items-center ${className}`} aria-label="מהמקור">
      <svg viewBox="-60 -60 120 120" role="img" aria-label="מהמקור" className="block h-9 w-9">
        <MarkSeeds variant="mark" />
      </svg>
    </span>
  );
}
