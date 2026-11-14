// @ts-check
"use client";

/**
 * Module:   EmailTypoHint
 * Purpose:  «אולי התכוונו ל־noa@gmail.com?» under an email field whose domain
 *           looks mistyped (MEH-3123; copy approved by Sapir 14/11). The
 *           address is a button that puts the fix into the field.
 * Rules:    shown only after the field loses focus (no nagging mid-typing);
 *           hidden again while she edits; never blocks a submit.
 * Related:  lib/email-typo.js (the suggestion), the six public forms that
 *           render it next to their email field.
 * History:  MEH-3123 (creation).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { suggestEmail } from "@/lib/email-typo";

/**
 * @param {{ fieldId: string, value: string, onAccept: (email: string) => void, className?: string }} props
 */
export default function EmailTypoHint({ fieldId, value, onAccept, className = "" }) {
  const t = useTranslations("forms");
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const el = document.getElementById(fieldId);
    if (!el) return undefined;
    const onBlur = () => setSettled(true);
    const onFocus = () => setSettled(false);
    el.addEventListener("blur", onBlur);
    el.addEventListener("focus", onFocus);
    return () => {
      el.removeEventListener("blur", onBlur);
      el.removeEventListener("focus", onFocus);
    };
  }, [fieldId]);

  const suggestion = settled ? suggestEmail(value) : null;
  // Nothing rendered without a suggestion: an empty node would still take a
  // space-y gap in the forms that stack their fields.
  if (!suggestion) return null;
  return (
    <p role="status" className={`text-sm text-fg-muted ${className}`} data-testid="email-typo-hint">
      {t.rich("email_typo", {
          email: suggestion,
          fix: (chunks) => (
            <button
              type="button"
              dir="ltr"
              className="font-semibold text-primary underline underline-offset-2 focus-ring rounded-sm"
              onClick={() => onAccept(suggestion)}
              data-testid="email-typo-fix"
            >
              {chunks}
            </button>
          ),
      })}
    </p>
  );
}
