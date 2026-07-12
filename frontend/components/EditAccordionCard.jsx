"use client";

/**
 * Module:   EditAccordionCard
 * Purpose:  Accordion shell for the producer edit-tab cards (MEH-1116). The
 *           edit page was one long page with 6+ expanded cards; each card now
 *           collapses to a header row — title + live one-line status summary +
 *           CaretDown chevron — with the body hidden until opened. One card
 *           open at a time (page-level openKey state).
 * Does NOT: unmount its children on collapse — the body is toggled with the
 *           `hidden` attribute so card-local unsaved state survives collapse
 *           and the MEH-1100 dirty aggregate / nav guard keep working. Owns no
 *           card save logic and no dirty flags.
 * Related:  app/[locale]/producer/dashboard/edit/page.js (openKey state, URL-
 *           hash auto-expand — the MEH-1106 checklist will deep-link these
 *           anchor ids); components/ProductsSection.jsx (embedded mode).
 * History:  MEH-1116 (creation — producer-dashboard disclosure epic MEH-1089);
 *           MEH-1132 (`marker` prop); MEH-1158 (`preview` prop + the
 *           PreviewThumbs / PreviewChips / PreviewEmpty header primitives —
 *           Airbnb Listings-tab content peek, built from the page's existing
 *           payload only).
 */

import { CaretDown } from "@phosphor-icons/react";
import { optimizeCloudinary } from "@/lib/cloudinary";

// ============================================================
// MEH-1158: header content-preview primitives. Presentational only — the
// page composes them from the already-fetched /producers/me payload (no new
// API calls). Everything here must be phrasing content (span/img), because
// the preview renders INSIDE the header <button>. Calm idiom (ADR-019):
// muted, never red; tokens only.
// ============================================================

// "+N" overflow chip. dir="ltr" keeps the plus sign in front of the digits
// in the RTL context ("+2", not "2+"). Numeric-only — no i18n key needed.
function PreviewOverflowChip({ count }) {
  return (
    <span
      dir="ltr"
      data-testid="preview-overflow"
      className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-border text-xs text-fg-muted shrink-0"
    >
      +{count}
    </span>
  );
}

// Up to `max` 40px rounded thumbnails + "+N". Cloudinary square fill via the
// canonical helper (ar_1:1 + w_80 ≡ the spec's w_80,h_80,c_fill — transforms
// never hardcoded per .claude/rules/frontend.md); w_80 delivered for 40px
// display = 2x DPR. Decorative: alt="" + aria-hidden (the button's accessible
// name stays title + summary).
export function PreviewThumbs({ urls = [], max = 3 }) {
  const shown = urls.slice(0, max);
  const extra = urls.length - shown.length;
  return (
    <span className="flex items-center gap-1.5" data-testid="preview-thumbs">
      {shown.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${url}-${i}`}
          src={optimizeCloudinary(url, { aspectRatio: "1:1", width: 80 })}
          alt=""
          aria-hidden="true"
          className="w-10 h-10 object-cover rounded-[8px] border border-border shrink-0"
        />
      ))}
      {extra > 0 && <PreviewOverflowChip count={extra} />}
    </span>
  );
}

// Up to `max` text chips + "+N". Each chip truncates individually so three
// long category names still hold one row at 390px.
export function PreviewChips({ items = [], max = 3 }) {
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;
  return (
    <span className="flex items-center gap-1.5 min-w-0" data-testid="preview-chips">
      {shown.map((label, i) => (
        <span
          key={`${label}-${i}`}
          className="inline-block max-w-[7rem] truncate px-2 py-0.5 rounded-full border border-border text-xs font-normal text-fg-muted"
        >
          {label}
        </span>
      ))}
      {extra > 0 && <PreviewOverflowChip count={extra} />}
    </span>
  );
}

// Dashed muted placeholder for an empty card — purely visual (no copy: the
// existing summary line already says "עוד אין…"; no marketing claims).
export function PreviewEmpty() {
  return (
    <span
      aria-hidden="true"
      data-testid="preview-empty"
      className="inline-block h-6 w-24 max-w-full rounded-full border border-dashed border-border"
    />
  );
}

// Stable English anchor id per card — the public deep-link contract
// (#contact-channels etc.). Consumed by the page's hash effect; MEH-1106's
// completeness checklist links here next.
export default function EditAccordionCard({
  anchorId,
  title,
  summary,
  // MEH-1132: optional next-step marker node (gold dot) rendered beside the
  // title. Additive + default-off — omit it and the header is byte-identical
  // to before. The page passes it to at most one card at a time.
  marker,
  // MEH-1158: optional content-preview node (thumbs / chips / first line /
  // placeholder) rendered as a row under the summary — same additive
  // default-off contract as `marker`. Must be phrasing content only (it
  // lives inside the header <button>).
  preview,
  open,
  onToggle,
  children,
}) {
  const bodyId = `${anchorId}-panel`;
  const headerId = `${anchorId}-header`;
  return (
    <section
      id={anchorId}
      aria-labelledby={headerId}
      className="bg-white border border-border rounded-[16px] scroll-mt-24"
    >
      <h2 id={headerId} className="font-headline-md text-base font-bold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          data-testid={`accordion-${anchorId}`}
          className="w-full min-h-[44px] flex items-center justify-between gap-3 p-5 text-start rounded-[16px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition"
        >
          <span className="min-w-0">
            <span className="block text-base font-bold text-text">
              {title}
              {marker}
            </span>
            {/* Live status summary — calm idiom (ADR-019): muted, never red. */}
            {summary && (
              <span className="block mt-0.5 text-xs font-normal text-fg-muted truncate">
                {summary}
              </span>
            )}
            {/* MEH-1158: content peek under the summary — additive; a single
                clipped row so the header truncates cleanly at 390px RTL. */}
            {preview && (
              <span className="block mt-2 overflow-hidden">{preview}</span>
            )}
          </span>
          <CaretDown
            size={18}
            aria-hidden="true"
            className={`shrink-0 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h2>
      {/* hidden-toggle (NOT unmount): keeps unsaved card state + MEH-1100
          guard wiring alive while collapsed, and aria-controls always valid. */}
      <div id={bodyId} role="region" aria-labelledby={headerId} hidden={!open} className="px-5 pb-5">
        {children}
      </div>
    </section>
  );
}
