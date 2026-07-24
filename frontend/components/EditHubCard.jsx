"use client";

/**
 * Module:   EditHubCard
 * Purpose:  Hub-view group tile for the producer edit tab (MEH-1408). The edit
 *           tab moved from one flat accordion list to hub-and-spoke: a hub of 4
 *           group tiles, each entering a group that shows only its accordion
 *           cards. This is the presentational tile — title + aggregated status
 *           + a peek of the group's existing MEH-1158 previews + the MEH-1132
 *           next-step marker.
 * Does NOT: own navigation, URL state, or any card logic — the page
 *           (producer/dashboard/edit/page.js) passes onClick (router.push into
 *           the group) and composes every prop. Purely a styled <button>.
 * Related:  components/EditAccordionCard.jsx (the spoke card + PreviewThumbs/
 *           Chips primitives reused here); app/[locale]/producer/dashboard/
 *           edit/page.js (GROUPS config, group state, previews map).
 * History:  MEH-1408 (creation — edit-tab hub-and-spoke, shell-only).
 *
 * RTL: logical properties only; the drill-in caret uses CaretRight +
 * rtl:rotate-180 (the MEH-1355/MEH-938 forward-indicator convention) so it
 * points inline-forward in both directions.
 */

import { CaretRight } from "@phosphor-icons/react";

export default function EditHubCard({
  title,
  // MEH-1132 next-step gold dot, rendered beside the title when the group holds
  // the next step. Additive + default-off (same contract as EditAccordionCard).
  marker,
  // Aggregated one-line status ("{done} of {total} completed"), muted.
  statusLine,
  // Up to a few of the group's existing preview nodes (thumbs / chips / glyphs)
  // — MEH-1158 primitives, composed by the page from the fetched profile.
  previews = [],
  onClick,
  testId,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="w-full min-h-[44px] flex items-center justify-between gap-3 p-5 text-start bg-white border border-border rounded-[16px] hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition"
    >
      <span className="min-w-0">
        <span className="block text-base font-bold text-text">
          {title}
          {marker}
        </span>
        {statusLine && (
          <span className="block mt-0.5 text-xs font-normal text-fg-muted truncate">
            {statusLine}
          </span>
        )}
        {previews.length > 0 && (
          <span className="flex items-center gap-2 mt-2 overflow-hidden">
            {previews.map((node, i) => (
              <span key={i} className="min-w-0">
                {node}
              </span>
            ))}
          </span>
        )}
      </span>
      <CaretRight
        size={18}
        aria-hidden="true"
        className="shrink-0 text-fg-muted rtl:rotate-180"
      />
    </button>
  );
}
