// @ts-check
"use client";

/**
 * Module:   FieldHelpLabel
 * Purpose:  A form field's label with a small «?» beside it that opens a
 *           one-line explanation of the field under the label (MEH-3740).
 *           The text comes from the caller (messages), so it shows with no
 *           server call.
 * Does NOT: replace WhatsThis — that is a «מה זה?» text link for a whole
 *           card; this is the per-field version, sized to sit on a label
 *           line. Same disclosure contract (REUSES:
 *           components/WhatsThis.jsx: aria-expanded + aria-controls, panel
 *           kept mounted and hidden, tap only).
 * Related:  components/RecipeForm.jsx (nine fields) ·
 *           backend/app/data/form_maps/recipe.json (the field keys).
 * History:  MEH-3740 (creation)
 */

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * @param {{ htmlFor?: string, label: string, help: string, required?: boolean, testId?: string }} props
 *   htmlFor: omit for a group heading (a <span>, not an orphan <label>).
 */
export default function FieldHelpLabel({ htmlFor, label, help, required = false, testId }) {
  const t = useTranslations("whats_this");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const Tag = htmlFor ? "label" : "span";
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1">
        <Tag {...(htmlFor ? { htmlFor } : {})} className="text-sm font-medium text-text">
          {label}
          {required && (
            <>
              {" "}
              <span className="text-error" aria-hidden="true">*</span>
            </>
          )}
        </Tag>
        {/* 44px tap target around a 20px mark (DESIGN.md sizing minimums). */}
        <button
          type="button"
          data-testid={testId}
          aria-label={`${t("trigger")} ${label}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="min-h-touch min-w-touch -my-3 inline-flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-primary text-xs font-bold text-primary"
          >
            ?
          </span>
        </button>
      </div>
      <p
        id={panelId}
        hidden={!open}
        className="mt-1 max-w-prose rounded-md bg-background-alt border border-border px-3 py-2 text-sm leading-relaxed text-text"
      >
        {help}
      </p>
    </div>
  );
}
