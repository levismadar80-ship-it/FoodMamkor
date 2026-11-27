// @ts-check
"use client";

/**
 * Module:   OwnerAssistantNudge
 * Purpose:  The assistant speaks first: on the dashboard home of a business in
 *           draft that still has items before «שליחה לבדיקה», one line says
 *           how many are left and a button opens the assistant on «מה הצעד
 *           הבא שלי?». A new owner does not have to know the assistant exists.
 * Touches:  nothing (opens the assistant through lib/owner-page-updated.js).
 * Does NOT: list the items (ProfileCompletenessCard, right under it, does) or
 *           call the model before she taps.
 * Related:  components/owner-assistant/OwnerAssistant.jsx (opens) ·
 *           lib/submission-gate.js (what is left).
 * History:  MEH-3902 (26/11; Shopify shows Sidekick suggestions on the admin home).
 */

import { useTranslations } from "next-intl";
import { Sparkle } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import { submissionMissingItems } from "@/lib/submission-gate";
import { openOwnerAssistant } from "@/lib/owner-page-updated";

/** @param {{ producer: any }} props */
export default function OwnerAssistantNudge({ producer }) {
  const t = useTranslations("owner_assistant.nudge");
  if (!producer || producer.status !== "draft") return null;
  const left = submissionMissingItems(producer).length;
  if (left === 0) return null;
  return (
    <section
      data-testid="owner-assistant-nudge"
      className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4"
    >
      <Sparkle size={20} aria-hidden="true" className="text-primary shrink-0 hidden sm:block" />
      <p className="text-sm text-text flex-1">{t("body", { count: left })}</p>
      <Button variant="outlined" size="sm" onClick={() => openOwnerAssistant("next_step")} className="self-start sm:self-auto">
        {t("cta")}
      </Button>
    </section>
  );
}
