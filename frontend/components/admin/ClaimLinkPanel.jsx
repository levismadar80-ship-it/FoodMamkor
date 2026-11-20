// @ts-check
"use client";

import { useTranslations } from "next-intl";
import api from "@/lib/api";
import AdminLinkPanel from "@/components/admin/AdminLinkPanel";

/**
 * Module:   ClaimLinkPanel
 * Purpose:  The admin side of the owner-claim link: on a DRAFT business's edit
 *           page, mint the signed link the owner opens to take the page over
 *           with her own account (MEH-2321 chunk C).
 * Touches:  POST /admin/producers/{id}/claim-link (producer_claim.py) — stateless,
 *           re-mints a 14-day token per click, no DB write.
 * Does NOT: send the link anywhere (the admin pastes it to the owner herself),
 *           or decide who may claim — the server does (draft + no owner, 409
 *           otherwise, shown here verbatim).
 * Related:  components/producer/RequestReviewCard.jsx (the copy pattern),
 *           app/[locale]/admin/producers/[id]/edit/page.js (gates on draft).
 * History:  MEH-2325 · MEH-3464 (the panel itself moved to AdminLinkPanel).
 *
 * Mint on click, copy on a second click: the clipboard write stays inside its
 * own user gesture, which Safari needs (same reason as RequestReviewCard).
 */
export default function ClaimLinkPanel({ producerId }) {
  const t = useTranslations("admin.producers.claim");
  return (
    <AdminLinkPanel
      mint={() => api.post(`/admin/producers/${producerId}/claim-link`)}
      t={t}
      testid="claim-link"
    />
  );
}
