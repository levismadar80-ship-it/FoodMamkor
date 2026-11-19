// @ts-check
"use client";

/**
 * Module:   ProductFacts
 * Purpose:  What the owner declared about one product (ingredients,
 *           allergens, storage) on the public product sheet.
 * Does NOT: fetch anything, or render the diet chips / gluten-facility line
 *           (those stay in ProductSheet.jsx).
 * Related:  frontend/components/public/ProductSheet.jsx (the only caller);
 *           frontend/lib/allergens.js (the closed code list).
 * History:  MEH-2662 (ingredients + allergens); MEH-3439 «מכיל / עלול להכיל»;
 *           MEH-3442 cereal/nut detail; MEH-3444 storage; MEH-3445 «אין»;
 *           MEH-3450 (moved here; one closed row «פרטים על המוצר» with the
 *           allergen line always visible under its title — Sapir 19/11 18:07).
 */
import { CaretDown } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { ALLERGEN_CODES } from "@/lib/allergens";

const FACTS = "producer.detail.sections.products.facts";

/** @param {unknown} v */
const hasText = (v) => typeof v === "string" && v.trim() !== "";

/**
 * @param {{ product: { allergens?: string[] | null, may_contain?: string[] | null,
 *   no_allergens?: boolean, gluten_detail?: string | null, nuts_detail?: string | null,
 *   ingredients?: string | null, storage_info?: string | null } }} props
 */
export default function ProductFacts({ product }) {
  const t = useTranslations();

  // MEH-2662: unknown codes (a list newer than this bundle) are dropped rather
  // than rendered as a raw key.
  const allergenCodes = (product.allergens || []).filter((c) => ALLERGEN_CODES.includes(c));
  const hasAllergens = allergenCodes.length > 0;
  // MEH-3439: «עלול להכיל» — same closed list; a code already in «מכיל» is
  // never repeated (the backend drops it too).
  const mayContainCodes = (product.may_contain || []).filter(
    (c) => ALLERGEN_CODES.includes(c) && !allergenCodes.includes(c),
  );
  const hasMayContain = mayContainCodes.length > 0;
  // MEH-3445: «אין במוצר אלרגנים מהרשימה» — only when no code is listed.
  const declaredNone = !!product.no_allergens && !hasAllergens && !hasMayContain;
  // MEH-3442: «גלוטן (כוסמין)», «אגוזים (שקדים)» — the owner's detail in
  // brackets after its allergen, wherever that allergen is listed.
  /** @type {Record<string, string | null | undefined>} */
  const detailByCode = { gluten: product.gluten_detail, tree_nuts: product.nuts_detail };
  /** @param {string[]} codes */
  const allergenList = (codes) =>
    codes
      .map((code) => {
        const label = t(`settings.products.form.allergen_${code}`);
        const detail = detailByCode[code];
        return hasText(detail) ? `${label} (${String(detail).trim()})` : label;
      })
      .join(", ");
  const hasIngredients = hasText(product.ingredients);
  // MEH-3444: «אחסון ותוקף» — shown only when the owner wrote something.
  const hasStorage = hasText(product.storage_info);
  const declaredAnything = hasIngredients || hasAllergens || hasMayContain || declaredNone || hasStorage;

  // MEH-3450: the allergen answer is never behind a tap — an allergic buyer
  // must not have to open every product to learn it contains nuts. Spans,
  // not <p>: this also renders inside <summary> (phrasing content only).
  const allergenLines = (
    <>
      {hasAllergens && (
        <span className="block text-sm text-text" data-testid="product-sheet-allergens">
          {t(`${FACTS}.contains`, { list: allergenList(allergenCodes) })}
        </span>
      )}
      {hasMayContain && (
        <span className="block text-sm text-text" data-testid="product-sheet-may-contain">
          {t(`${FACTS}.may_contain`, { list: allergenList(mayContainCodes) })}
        </span>
      )}
      {declaredNone && (
        <span className="block text-sm text-text" data-testid="product-sheet-allergens-none">
          {t(`${FACTS}.no_allergens`)}
        </span>
      )}
      {!hasAllergens && !hasMayContain && !declaredNone && (
        <span className="block text-sm text-text" data-testid="product-sheet-allergens-undeclared">
          {t(`${FACTS}.allergens_undeclared`)}
        </span>
      )}
    </>
  );

  const declaredLine = declaredAnything && (
    <p className="text-xs text-fg-muted" data-testid="product-sheet-facts-declared">
      {t(`${FACTS}.declared_by_business`)}
    </p>
  );

  // Nothing to fold away (no ingredients, no storage): the allergen answer
  // alone, as before — a row that opens onto one grey line is a dead tap.
  if (!hasIngredients && !hasStorage) {
    return (
      <div className="space-y-2" data-testid="product-sheet-facts">
        <div>
          <h3 className="text-xs font-medium text-fg-muted">{t(`${FACTS}.allergens_heading`)}</h3>
          {allergenLines}
        </div>
        {declaredLine}
      </div>
    );
  }

  return (
    <div data-testid="product-sheet-facts">
      <details className="group rounded-lg border border-border" data-testid="product-sheet-details">
        <summary
          className="flex min-h-touch cursor-pointer list-none items-start justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden"
          data-testid="product-sheet-details-summary"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-text">{t(`${FACTS}.details_heading`)}</span>
            {allergenLines}
          </span>
          <CaretDown
            size={18}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-fg-muted transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="space-y-2 px-3 pb-3">
          {hasIngredients && (
            <div>
              <h3 className="text-xs font-medium text-fg-muted">{t(`${FACTS}.ingredients_heading`)}</h3>
              <p
                className="whitespace-pre-line text-sm leading-relaxed text-text"
                data-testid="product-sheet-ingredients"
              >
                {product.ingredients}
              </p>
            </div>
          )}
          {hasStorage && (
            <div>
              <h3 className="text-xs font-medium text-fg-muted">{t(`${FACTS}.storage_heading`)}</h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-text" data-testid="product-sheet-storage">
                {product.storage_info}
              </p>
            </div>
          )}
          {declaredLine}
        </div>
      </details>
    </div>
  );
}
