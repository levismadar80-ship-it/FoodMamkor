"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

// MEH-2588: moved out of MiniMap.jsx so the event / experience detail pages
// show the same Waze + Google Maps marks as the business page.
// MEH-1334 chunk 3: real brand glyphs from the approved design bundle —
// resolves the MEH-1305 B fallback (Phosphor MapPin) now that a clean inline
// SVG source exists. Brand-lock (mockup RTL notes): the logos are NOT
// mirrored and NOT recolored.
export function WazeGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path
        fill="#33CCFF"
        d="M12 2C6.5 2 2 6.3 2 11.6c0 2.9 1.4 5.5 3.6 7.2-.2.5-.6 1.1-1.3 1.6-.4.3-.3.9.2 1 1.7.4 3.4.1 4.7-.6.9.2 1.8.3 2.8.3 5.5 0 10-4.3 10-9.5S17.5 2 12 2z"
      />
      <circle cx="9" cy="10" r="1.3" fill="#1C1A17" />
      <circle cx="15" cy="10" r="1.3" fill="#1C1A17" />
      <path
        d="M8.5 13.5c.8 1.5 2 2.3 3.5 2.3s2.7-.8 3.5-2.3"
        fill="none"
        stroke="#1C1A17"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GoogleMapsGlyph() {
  // clipPath id must be unique per mount (useId) — duplicate SVG ids break
  // the clip when the component ever renders twice on one page.
  const clipId = useId();
  return (
    <svg viewBox="0 0 24 34" width="14" height="19" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d="M12 0C5.4 0 0 5.4 0 12c0 8.5 12 22 12 22s12-13.5 12-22C24 5.4 18.6 0 12 0z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x="-2" y="-2" width="28" height="38" fill="#34A853" />
        <polygon fill="#FBBC04" points="-2,10 26,-8 26,4 -2,24" />
        <polygon fill="#EA4335" points="-2,-2 13,-2 -2,15" />
        <polygon fill="#4285F4" points="7,-2 26,-2 26,10 13,5" />
      </g>
      <circle cx="12" cy="11" r="4.2" fill="#fff" />
    </svg>
  );
}

// MEH-2588: Waze / Google buttons built from a text address (event, public
// experience venue) — `links` is addressNavLinks() output. Soft-green fill so
// the details box carries the brand colour; the logos stay in their own
// colours (brand-lock above). Waze keeps its aria-label ("פתיחה ב-Waze"
// contains the visible "Waze"); Google has none — MEH-2308, the visible
// "מפות Google" is the name.
export function AddressNavLinks({ links, testId }) {
  const t = useTranslations("map.mini");
  const btn =
    "flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] rounded-[10px] bg-green-50 text-sm font-semibold text-primary hover:bg-green-100 transition focus-ring";
  return (
    <div className="flex gap-2 px-4 pb-3" data-testid={testId}>
      <a href={links.waze} target="_blank" rel="noopener noreferrer" aria-label={t("open_in_waze_aria")} className={btn}>
        <WazeGlyph />
        {t("open_in_waze")}
      </a>
      <a href={links.google} target="_blank" rel="noopener noreferrer" className={btn}>
        <GoogleMapsGlyph />
        {t("open_in_google")}
      </a>
    </div>
  );
}
