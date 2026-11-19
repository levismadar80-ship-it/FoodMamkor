// @ts-check
"use client";

import api from "@/lib/api";
import AdminLinkPanel from "@/components/admin/AdminLinkPanel";

/**
 * Module:   DraftPreviewLinkPanel
 * Purpose:  On a DRAFT business's edit page, mint the read-only link that
 *           shows the business its full page before it is live (MEH-3377).
 * Touches:  POST /admin/producers/{id}/preview-link
 *           (backend producer_draft_preview.py) — stateless, a fresh 14-day
 *           token per click, no DB write.
 * Does NOT: send the link (the admin pastes it into WhatsApp herself), or let
 *           its holder do anything — taking the page over is the owner's
 *           invite link (the panel above this one), a different token.
 * Related:  the invite-link panel beside it (the shape this copies) ·
 *           app/[locale]/draft-preview/[token]/ (what the link opens).
 * History:  MEH-3377 · MEH-3464 (the panel itself moved to AdminLinkPanel).
 *
 * Mint on click, copy on a second click: the clipboard write stays inside its
 * own user gesture, which Safari needs.
 */
export default function DraftPreviewLinkPanel({ producerId }) {
  return (
    <AdminLinkPanel
      mint={() => api.post(`/admin/producers/${producerId}/preview-link`)}
      namespace="admin.producers.draft_preview"
      testid="draft-preview-link"
    />
  );
}
