// @ts-check
"use client";

import { useTranslations } from "next-intl";

/**
 * Module:   AdminDraftMissing
 * Purpose:  Under «נקלט, בהשלמה», say what the owner still has to fill in
 *           before she can send the draft for review, so the admin's follow-up
 *           call is about one thing (MEH-3409).
 * Touches:  nothing — reads `draft_missing` from GET /admin/producers
 *           (services/admin_draft_missing.py).
 * Does NOT: decide what is required — submission_gate.py does, and the item
 *           labels are the owner's own checklist (dashboard.producer.draft.missing),
 *           so admin and owner read the same words.
 * History:  MEH-3409 (creation).
 *
 * `draft_missing` is null for every row that is not a claimed draft, and for a
 * backend that does not send it: then nothing renders. [] = all filled in.
 */

/** @param {{ producer: { status?: string, has_owner?: boolean, draft_missing?: string[] | null } }} props */
export function DraftMissing({ producer }) {
  const t = useTranslations("admin.producers.table.draft_claim");
  const tItem = useTranslations("dashboard.producer.draft.missing");
  const missing = producer.draft_missing;
  if (producer.status !== "draft" || producer.has_owner !== true || !Array.isArray(missing)) {
    return null;
  }
  // An unknown code (a newer backend) is shown as-is rather than dropped:
  // hiding it would tell the admin the draft is closer to ready than it is.
  const items = missing.map((code) => (tItem.has(code) ? tItem(code) : code));
  return (
    <span data-testid="draft-missing" className="text-2xs text-muted max-w-[14rem]">
      {items.length ? t("missing", { items: items.join(", ") }) : t("all_filled")}
    </span>
  );
}
