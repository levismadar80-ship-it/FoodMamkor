// @ts-check
"use client";

/**
 * Module:   AllergenPicker
 * Purpose:  The allergen chips a business ticks for what it sells: one
 *           toggle per code, in the canonical order. One picker for the
 *           rescue bag and the group buy (MEH-3610).
 * Does NOT: decide what an empty choice means — the caller sends it, and the
 *           server stores nothing ticked as NULL, «not declared», never as
 *           «contains none» (backend/app/allergens.py, MEH-2752).
 * Related:  lib/allergens.js (codes, toggleAllergen) · the product sheet's
 *           labels (settings.products.form.allergen_*, MEH-2662)
 * History:  MEH-3610 (taken out of components/dashboard/RescueTab.jsx, MEH-2752)
 *
 * @param {{ value: string[], onChange: (next: string[]) => void, labelledBy: string, testId: string, groupTestId: string }} props
 */
import { useTranslations } from "next-intl";
import { ALLERGEN_CODES, toggleAllergen } from "@/lib/allergens";

export default function AllergenPicker({ value, onChange, labelledBy, testId, groupTestId }) {
  const tProducts = useTranslations("settings.products.form");
  return (
    <div role="group" aria-labelledby={labelledBy} data-testid={groupTestId} className="flex flex-wrap gap-2">
      {ALLERGEN_CODES.map((code) => {
        const pressed = value.includes(code);
        return (
          <button
            key={code}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(toggleAllergen(value, code))}
            data-testid={`${testId}-${code}`}
            className={`inline-flex items-center min-h-touch rounded-full border px-4 py-2 font-body-sm text-sm transition focus-ring ${
              pressed ? "border-primary bg-green-50 text-primary" : "border-border text-fg-muted hover:border-primary"
            }`}
          >
            {tProducts(`allergen_${code}`)}
          </button>
        );
      })}
    </div>
  );
}
