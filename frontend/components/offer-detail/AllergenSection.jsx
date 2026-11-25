// @ts-check
"use client";

/**
 * Module:   AllergenSection
 * Purpose:  «אלרגנים» on an offer page: what THIS business declares, or — when
 *           it declared nothing — a line that says so and tells the buyer to
 *           ask. One block for the group buy and the rescue bag (MEH-3610,
 *           Sapir 21/11: «למה יש אלרגנים בסלים ולא בקבוצות רכישה?»).
 * Does NOT: decide the list (the server normalises it, app/allergens.py) or
 *           claim «no allergens»: null and an empty list read the same way,
 *           as «not declared» (MEH-2752).
 * Related:  app/[locale]/rescue/[offerId]/RescueOfferDetails.jsx (the block
 *           this was taken from, MEH-3586) · components/rescue/RescueSection.jsx
 * History:  MEH-3610 (creation)
 *
 * `askAtPickup` (MEH-3823, the rescue bag): a fixed «ask at pickup» line under
 * whatever was declared, as Too Good To Go shows on every bag. A surprise bag's
 * contents change daily, so a declaration is never the whole answer.
 *
 * @param {{ allergens?: string[] | null, headingId: string, testId?: string, askAtPickup?: boolean }} props
 */
import { useTranslations } from "next-intl";
import { Warning } from "@phosphor-icons/react";
import SectionHeading from "@/components/ui/SectionHeading";
import { ALLERGEN_CODES } from "@/lib/allergens";

export default function AllergenSection({ allergens, headingId, testId, askAtPickup = false }) {
  // The copy lives with the bag (rescue.section.*) and is not bag-specific;
  // one set of words for both offers. Labels are the product sheet's
  // vocabulary (MEH-2662), so no two surfaces name an allergen differently.
  const t = useTranslations("rescue.section");
  const tProducts = useTranslations("settings.products.form");
  const known = (allergens || []).filter((code) => ALLERGEN_CODES.includes(code));
  return (
    <section aria-labelledby={headingId} data-testid={testId}>
      <SectionHeading size="content" id={headingId} className="mb-3">{t("allergens_title")}</SectionHeading>
      <p className="flex items-start gap-2 text-base text-text">
        <Warning aria-hidden="true" size={20} className="text-gold-deep shrink-0 mt-0.5" />
        {known.length ? (
          <span data-testid={testId && `${testId}-declared`}>
            {t("allergens_declared", { list: known.map((code) => tProducts(`allergen_${code}`)).join(", ") })}
          </span>
        ) : (
          <span data-testid={testId && `${testId}-none`}>
            {t(askAtPickup ? "allergens_undeclared_short" : "allergens_undeclared")}
          </span>
        )}
      </p>
      {askAtPickup && (
        <p className="mt-2 text-sm text-fg-muted" data-testid={testId && `${testId}-ask`}>
          {t("allergens_ask")}
        </p>
      )}
    </section>
  );
}
