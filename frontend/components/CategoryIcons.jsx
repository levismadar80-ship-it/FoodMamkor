"use client";

/**
 * CategoryIcons — hand-drawn SVG line-art replacing Phosphor icons for
 * homepage category cards. Inspired by gardensweet.com and Graza — the
 * slightly loose strokes feel human and unique instead of generic.
 *
 * Each icon is rendered from a factory so color/size can be overridden
 * at the call-site (e.g. white on green hover, darker on cream bg).
 *
 * Keys match CATEGORY_CARDS[].key in app/page.js rather than category
 * names, because category names come from the DB and may drift.
 */

function Icon({ children, size = 64, stroke = "#2e6853", strokeWidth = 1.5, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke={stroke}
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

/* ---------- individual icons ---------- */

export function MeatIcon(props) {
  // Steak cut with a bone poking out. Hand-drawn, asymmetrical curves.
  return (
    <Icon {...props}>
      <path d="M12 44 C12 44 8 36 14 28 C20 20 32 18 38 22 C44 26 46 34 42 40 C38 46 28 48 20 46 Z" />
      <path d="M38 22 L52 10" />
      <circle cx="50" cy="12" r="4" />
      <path d="M20 38 C22 35 26 34 29 36" />
    </Icon>
  );
}

export function VegIcon(props) {
  // Leaf with a stem + two smaller side-leaves.
  return (
    <Icon {...props}>
      <path d="M32 52 L32 20" />
      <path d="M32 20 C32 20 18 16 14 28 C18 28 26 26 32 32" />
      <path d="M32 28 C32 28 44 20 50 30 C46 32 38 30 32 36" />
      <path d="M28 44 L20 50" />
    </Icon>
  );
}

export function DairyIcon(props) {
  // Milk bottle with a short neck and two spot details.
  return (
    <Icon {...props}>
      <path d="M24 16 L24 12 C24 10 26 8 28 8 L36 8 C38 8 40 10 40 12 L40 16" />
      <path d="M20 16 L20 52 C20 54 22 56 24 56 L40 56 C42 56 44 54 44 52 L44 16 Z" />
      <path d="M20 26 L44 26" />
      <circle cx="30" cy="38" r="2" />
      <circle cx="36" cy="44" r="2" />
    </Icon>
  );
}

export function BreadIcon(props) {
  // Round loaf with three steam curls rising.
  return (
    <Icon {...props}>
      <path d="M14 40 C14 40 12 32 18 26 C24 20 40 20 46 26 C52 32 50 40 50 40 Z" />
      <path d="M14 40 L14 48 C14 50 16 52 18 52 L46 52 C48 52 50 50 50 48 L50 40" />
      <path d="M24 20 C24 16 22 14 24 10" />
      <path d="M32 20 C32 14 30 12 32 8" />
      <path d="M40 20 C40 16 38 14 40 10" />
    </Icon>
  );
}

export function OilIcon(props) {
  // Jar with a lid and an olive/drop motif inside.
  return (
    <Icon {...props}>
      <path d="M22 24 L22 52 C22 54 24 56 26 56 L38 56 C40 56 42 54 42 52 L42 24 Z" />
      <path d="M20 24 L44 24" />
      <path d="M24 18 L40 18 C42 18 44 20 44 22 L44 24 L20 24 L20 22 C20 20 22 18 24 18 Z" />
      <path d="M28 36 C30 32 34 32 36 36 C38 40 36 46 32 46 C28 46 26 40 28 36 Z" />
    </Icon>
  );
}

export function SoapIcon(props) {
  // Soap dish with bubbles drifting up.
  return (
    <Icon {...props}>
      <rect x="18" y="28" width="28" height="24" rx="4" />
      <path d="M22 28 L22 22 C22 20 24 18 26 18 L38 18 C40 18 42 20 42 22 L42 28" />
      <circle cx="26" cy="16" r="3" />
      <circle cx="34" cy="12" r="2" />
      <circle cx="40" cy="15" r="2.5" />
    </Icon>
  );
}

/* ---------- key-based lookup for the homepage grid ---------- */

export const CATEGORY_ICONS = {
  meat: MeatIcon,
  veg: VegIcon,
  dairy: DairyIcon,
  bread: BreadIcon,
  oil: OilIcon,
  care: SoapIcon,
};
