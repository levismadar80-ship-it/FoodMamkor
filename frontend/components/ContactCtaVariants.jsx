"use client";

import { useId } from "react";
import {
  WhatsappLogo,
  Phone,
  Globe,
  EnvelopeSimple,
  FacebookLogo,
  Receipt,
} from "@phosphor-icons/react";

/**
 * MEH-2813: ONE colour + icon map for the primary contact CTA, read by both
 * surfaces that render it — the inline button (PrimaryContactButton, in the
 * contact card) and the mobile sticky bar (StickyContactBar). Before this the
 * two kept separate forks and drifted: instagram / facebook / external_order
 * were a filled green button in the card and a white outlined one in the
 * sticky bar, on the same page.
 *
 * Colour rule (Sapir's pick, option ג׳, 7/11/2026):
 *   - WhatsApp keeps its own darkened green fill (globals.css .btn-whatsapp,
 *     MEH-1389) — the channel colour is the signal.
 *   - Instagram / Facebook: white outlined button, the colour lives in the
 *     LOGO only. A gradient fill was rejected: white text on its orange end is
 *     2.6:1 (fails AA), and it would be a second brand colour on the page.
 *   - external_order has no brand: same outlined button, icon in brand green.
 *   - phone / email / website: unchanged.
 */

const OUTLINE =
  "bg-surface text-text border border-primary hover:bg-green-50 focus-visible:ring-primary/40";

// Instagram glyph, multicolour. Drawn to the glyph's own geometry (rounded
// square, lens, flash dot) and NOT recoloured or reshaped beyond the official
// multicolour treatment. The gradient id must be unique per mount (useId) — the
// glyph renders twice on mobile (card + sticky bar). The yellow start stop is
// under 3:1 on white; accepted, as in Instagram's own multicolour glyph — the
// glyph is aria-hidden and the button label carries the meaning.
function InstagramGlyph({ size = 20 }) {
  // useId() returns ":r1:"-style ids; colons inside url(#…) trip some WebViews.
  const gid = `ig-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      data-testid="glyph-instagram"
      className="shrink-0"
    >
      <defs>
        <linearGradient id={gid} x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset="0.3" stopColor="#FA7E1E" />
          <stop offset="0.55" stopColor="#D62976" />
          <stop offset="0.8" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${gid})`} strokeWidth="2.2">
        <rect x="2.6" y="2.6" width="18.8" height="18.8" rx="5.4" />
        <circle cx="12" cy="12" r="4.3" />
      </g>
      <circle cx="17.4" cy="6.6" r="1.3" fill={`url(#${gid})`} />
    </svg>
  );
}

// Facebook: Meta's current Facebook blue on the Phosphor mark (Meta permits a
// solid-colour logo). Non-text contrast on white 4.6:1, over the 3:1 floor.
function FacebookGlyph({ size = 20 }) {
  return (
    <FacebookLogo
      size={size}
      weight="fill"
      color="#0866FF"
      aria-hidden="true"
      data-testid="glyph-facebook"
      className="shrink-0"
    />
  );
}

function ExternalOrderGlyph({ size = 20 }) {
  return (
    <Receipt size={size} weight="fill" aria-hidden="true" className="shrink-0 text-primary" />
  );
}

// Module scope only: each call makes a new component type, so never call it in render.
function phosphor(Icon) {
  return function PhosphorGlyph({ size = 20 }) {
    return <Icon size={size} weight="fill" aria-hidden="true" />;
  };
}

const CTA_VARIANTS = {
  whatsapp: { Icon: phosphor(WhatsappLogo), className: "btn-whatsapp" },
  phone: {
    Icon: phosphor(Phone),
    className: "bg-primary text-white hover:bg-primary-dark focus-visible:ring-primary/40",
  },
  website: { Icon: phosphor(Globe), className: OUTLINE },
  email: {
    Icon: phosphor(EnvelopeSimple),
    className: "bg-primary-dark text-white hover:bg-primary focus-visible:ring-primary-dark/40",
  },
  instagram: { Icon: InstagramGlyph, className: OUTLINE },
  facebook: { Icon: FacebookGlyph, className: OUTLINE },
  external_order: { Icon: ExternalOrderGlyph, className: OUTLINE },
};

export function getCtaVariant(method) {
  return CTA_VARIANTS[method] || CTA_VARIANTS.whatsapp;
}
