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
 * History:  MEH-1116 (creation — producer-dashboard disclosure epic MEH-1089).
 */

import { CaretDown } from "@phosphor-icons/react";

// Stable English anchor id per card — the public deep-link contract
// (#contact-channels etc.). Consumed by the page's hash effect; MEH-1106's
// completeness checklist links here next.
export default function EditAccordionCard({
  anchorId,
  title,
  summary,
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
            <span className="block text-base font-bold text-text">{title}</span>
            {/* Live status summary — calm idiom (ADR-019): muted, never red. */}
            {summary && (
              <span className="block mt-0.5 text-xs font-normal text-fg-muted truncate">
                {summary}
              </span>
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
