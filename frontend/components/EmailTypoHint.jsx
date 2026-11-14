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

// Longer than a tap (pointer-down → pointer-up), short enough to read as
// "right after leaving the field".
const SHOW_DELAY_MS = 300;

/**
 * @param {{ fieldId: string, value: string, onAccept: (email: string) => void, className?: string }} props
 */
export default function EmailTypoHint({ fieldId, value, onAccept, className = "" }) {
  const t = useTranslations("forms");
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const el = document.getElementById(fieldId);
    if (!el) return undefined;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    // The blur comes on pointer-DOWN of whatever she tapped next. Showing the
    // line at once would push a submit button below it down mid-tap, and the
    // pointer-up would miss it. Wait out a tap first.
    const onBlur = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setSettled(true), SHOW_DELAY_MS);
    };
    const onFocus = () => {
      clearTimeout(timer);
      setSettled(false);
    };
    el.addEventListener("blur", onBlur);
    el.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("blur", onBlur);
      el.removeEventListener("focus", onFocus);
    };
  }, [fieldId]);

  const suggestion = settled ? suggestEmail(value) : null;
  // The live region is always in the DOM (VoiceOver on iOS announces only a
  // change inside a region that already exists). Empty, it is sr-only, so it
  // takes no line and no flex/space-y gap in the forms that stack fields.
  return (
    <p
      role="status"
      className={suggestion ? `text-sm text-fg-muted ${className}` : "sr-only"}
      data-testid={suggestion ? "email-typo-hint" : undefined}
    >
      {suggestion &&
        t.rich("email_typo", {
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
