// @ts-check
"use client";

/**
 * Module:   DietaryScopeNotes
 * Purpose:  MEH-3982 — under a «האם כל מה שהעסק מוכר טבעוני / צמחוני?»
 *           question: one line that says what the word means, and a soft
 *           warning when «כן» contradicts the business's own category.
 * Does NOT: render the question or its radios/select (TagsCard.jsx, admin
 *           ProducerForm.jsx own those), block a save, or change any answer.
 * Related:  lib/dietary-scope-conflict.js (the slug lists).
 * History:  MEH-3982 (creation).
 */

import { useTranslations } from "next-intl";
import { Warning } from "@phosphor-icons/react";

import InlineMessage from "@/components/ui/InlineMessage";
import { conflictingCategoryNames } from "@/lib/dietary-scope-conflict";

/**
 * @param {{ axis: "vegan" | "vegetarian" | "gluten", scope?: string | null, categories?: Array<{ slug?: string | null, name?: string }> | null, text?: string | null }} props
 */
export default function DietaryScopeNotes({ axis, scope, categories, text }) {
  const t = useTranslations("dashboard.producer.dietaryScope");
  const names = conflictingCategoryNames(axis, { scope, categories, text });
  return (
    <>
      <p className="text-xs text-fg-muted" data-testid={`diet-definition-${axis}`}>
        {t(`definition_${axis}`)}
      </p>
      {names.length > 0 && (
        <InlineMessage
          tone="info"
          size="xs"
          variant="box"
          className="flex items-start gap-1.5 rounded-md p-2"
          data-testid={`diet-conflict-${axis}`}
        >
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0 mt-0.5" />
          <span>{t(`conflict_${axis}`, { categories: names.join(", ") })}</span>
        </InlineMessage>
      )}
    </>
  );
}
