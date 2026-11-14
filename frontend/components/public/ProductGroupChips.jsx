// @ts-check
"use client";
/**
 * Module:   ProductGroupChips
 * Purpose:  The business page's product filter by the owner's own groups
 *           (MEH-3055) — «הכל», one chip per group that holds products, and
 *           «עוד מוצרים» for products in no group. Etsy shows shop sections
 *           the same way: a short list of the seller's sections as filters.
 * Does NOT: decide when it is shown (ProducerSections: 2+ groups with
 *           products) or the order (lib/product-order.js).
 * History:  MEH-3055 (creation)
 */
import { useTranslations } from "next-intl";

/** Sentinel for «עוד מוצרים» — never a real group id (those are UUIDs). */
export const UNGROUPED = "__ungrouped";

const PILL =
  "shrink-0 inline-flex items-center min-h-touch px-3.5 rounded-full border text-sm transition focus-visible:ring-2 focus-visible:ring-primary/40";

/**
 * @param {{
 *   groups: { id: string, name: string }[],
 *   withUngrouped: boolean,
 *   active: string | null,
 *   onChange: (id: string | null) => void,
 * }} props
 */
export default function ProductGroupChips({ groups, withUngrouped, active, onChange }) {
  const t = useTranslations("producer.detail.sections.products");
  /** @type {{ id: string | null, label: string }[]} */
  const chips = [
    { id: null, label: t("groups_all") },
    ...groups.map((g) => ({ id: g.id, label: g.name })),
    ...(withUngrouped ? [{ id: UNGROUPED, label: t("groups_other") }] : []),
  ];
  return (
    <div
      role="group"
      aria-label={t("groups_aria")}
      data-testid="product-group-chips"
      className="flex gap-2 overflow-x-auto pb-1 mb-3 -mx-1 px-1"
    >
      {chips.map((chip) => {
        const on = active === chip.id;
        return (
          <button
            key={chip.id ?? "all"}
            type="button"
            aria-pressed={on}
            data-testid="product-group-chip"
            onClick={() => onChange(chip.id)}
            className={`${PILL} ${
              on
                ? "bg-primary text-white border-primary"
                : "bg-surface-card text-text border-border hover:border-primary/40"
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
