// @ts-check
/**
 * Module:   AdminDraftTwin
 * Purpose:  On a row of the admin producers list, say that a draft the admin
 *           prepared and a business its owner registered herself look like one
 *           business, why (same phone, same Instagram, a similar name in the
 *           same city…), and move the draft to the owner after an in-page
 *           confirmation (MEH-3865).
 * Touches:  POST /admin/producers/{draft_id}/merge-owner
 *           (routers/admin_draft_merge.py). Reloads the list after it.
 * Does NOT: decide what matches (services/draft_twins.py, the server sends
 *           `draft_twin`), merge without the admin's second click, or show
 *           anything to the owner.
 * Related:  AdminDraftClaimActions.jsx (the claim-link chip, same column) ·
 *           services/draft_merge_emails.py REASON_LABELS (the same labels in
 *           the admin email).
 * History:  MEH-3865 (creation).
 */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { DraftMergeSchema } from "@/lib/api-responses";
import { showToast } from "@/lib/toast";
import Button from "@/components/ui/Button";

const REASONS = [
  "phone", "email", "instagram", "website", "facebook", "name_city", "name_contains_city",
];
// A merge moves rows and deletes a business; give it longer than a read.
const MERGE_TIMEOUT_MS = 30000;

/**
 * @param {{ producer: any, onMerged: () => void }} props
 */
export function DraftTwinNotice({ producer, onMerged }) {
  const t = useTranslations("admin.producers.table.draft_twin");
  const tCommon = useTranslations("admin.common");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const twin = producer.draft_twin;
  if (!twin || typeof twin !== "object") return null;

  const isDraftRow = String(producer.id) === String(twin.draft_id);
  const otherName = isDraftRow ? twin.target_name : twin.draft_name;
  const reasons = (twin.reasons || [])
    .filter((/** @type {string} */ r) => REASONS.includes(r))
    .map((/** @type {string} */ r) => t(`reasons.${r}`))
    .join(" · ");

  const merge = () => {
    setBusy(true);
    api
      .post(
        `/admin/producers/${twin.draft_id}/merge-owner`,
        { target_producer_id: twin.target_id },
        { timeout: MERGE_TIMEOUT_MS },
      )
      .then((r) => {
        // Rule 19: an unexpected body is reported, the list reloads anyway.
        if (!DraftMergeSchema.safeParse(r.data).success) showToast.error(t("error"));
        else showToast.success(t("done"));
      })
      .catch((error) => {
        showToast.error(detailToMessage(error?.response?.data?.detail) || t("error"));
      })
      .finally(() => {
        setBusy(false);
        setConfirming(false);
        onMerged();
      });
  };

  return (
    <div data-testid="draft-twin" className="flex flex-col items-start gap-1 max-w-xs">
      <span className="inline-flex items-center rounded-full bg-warning-100 text-warning-800 px-2 py-0.5 text-2xs font-medium">
        {isDraftRow ? t("tag_on_draft") : t("tag_on_owner")}
      </span>
      <span className="text-2xs text-muted" data-testid="draft-twin-detail">
        {otherName} · {reasons}
      </span>
      {!confirming && (
        <Button variant="outlined" size="sm" onClick={() => setConfirming(true)}>
          {t("merge")}
        </Button>
      )}
      {confirming && (
        <div
          role="group"
          aria-label={t("merge")}
          className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2 text-xs"
        >
          <p>{t("confirm", { draft: twin.draft_name, own: twin.target_name })}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" loading={busy} disabled={busy} onClick={merge}>
              {t("confirm_yes")}
            </Button>
            <Button variant="text" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
