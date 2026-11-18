// @ts-check
"use client";

/**
 * Module:   MenuReviewRow
 * Purpose:  One product the menu reader found, editable before it is
 *           published (MEH-3430): name, description, price from/to, unit.
 *           A field the model was unsure of carries «כדאי לבדוק»; a row with
 *           no price says so and blocks the publish until one is typed.
 * Touches:  nothing — the parent (MenuImport.jsx) owns the rows.
 * Does NOT: set allergens / diet flags / photos (those stay in the product
 *           form; the publish route refuses them).
 * History:  MEH-3430 (creation).
 */

import { useTranslations } from "next-intl";
import { Trash } from "@phosphor-icons/react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

const UNITS = ["unit", "kg", "100g"];
const MIN_PRICE = 1;
const MAX_PRICE = 10000; // backend ProductCreate: 1 – 10,000 ₪

/**
 * What blocks this row from publishing, as a `settings.products` key, or
 * null. Checked here so a 422 never reaches a screen that cannot name the row
 * (review 18/11); the server still checks the same ranges.
 * @param {{ name: string, price_min: string, price_max: string }} row
 * @returns {string | null}
 */
export function rowProblem(row) {
  if (!row.name.trim()) return "errors.name_required";
  if (row.price_min.trim() === "") return "menu_import.no_price";
  const min = Number(row.price_min);
  if (!(min >= MIN_PRICE)) return "errors.price_min_too_low";
  if (min > MAX_PRICE) return "errors.price_too_high";
  if (row.price_max.trim() === "") return null;
  const max = Number(row.price_max);
  if (max > MAX_PRICE) return "errors.price_too_high";
  return max > min ? null : "errors.price_max_below_min";
}

/**
 * @typedef {{ key: string, name: string, description: string, price_min: string,
 *   price_max: string, price_unit: string, uncertain: string[] }} MenuDraftRow
 */

/** @param {{ flag: boolean }} props */
function CheckFlag({ flag }) {
  const t = useTranslations("settings.products.menu_import");
  if (!flag) return null;
  return <span className="text-2xs font-medium text-warning-700 ms-1">{t("check")}</span>;
}

/**
 * @param {{ row: MenuDraftRow, onChange: (key: string, patch: Partial<MenuDraftRow>) => void, onRemove: (key: string) => void }} props
 */
export default function MenuReviewRow({ row, onChange, onRemove }) {
  const t = useTranslations("settings.products");
  const tUnit = useTranslations("admin.producers.product_import.unit");
  const unsure = (/** @type {string} */ f) => row.uncertain.includes(f);
  const set = (/** @type {Partial<MenuDraftRow>} */ patch) => onChange(row.key, patch);
  const problem = rowProblem(row);
  const noPrice = row.price_min.trim() === "";
  const label = (/** @type {string} */ key, /** @type {string} */ flag) => (
    <>
      {t(`form.${key}`)}
      <CheckFlag flag={unsure(flag)} />
    </>
  );

  return (
    <li data-testid="menu-row" className="border border-border rounded-md p-3 bg-surface-card space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <Input size="sm" label={label("name_label", "name")} value={row.name}
            onChange={(e) => set({ name: e.target.value })} maxLength={120} required />
        </div>
        <button
          type="button"
          onClick={() => onRemove(row.key)}
          aria-label={t("card.delete_aria_template", { name: row.name })}
          className="min-h-touch min-w-touch inline-flex items-center justify-center text-fg-muted hover:text-error shrink-0"
        >
          <Trash size={18} aria-hidden="true" />
        </button>
      </div>
      <Input size="sm" label={label("description_label", "description")} value={row.description}
        onChange={(e) => set({ description: e.target.value })} maxLength={500} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-24">
          <Input size="sm" type="number" inputMode="decimal" min="1"
            label={label("price_min_label", "price")} value={row.price_min}
            onChange={(e) => set({ price_min: e.target.value })} invalid={noPrice} />
        </div>
        <div className="w-24">
          <Input size="sm" type="number" inputMode="decimal" min="1" label={t("form.price_max_label")}
            value={row.price_max} onChange={(e) => set({ price_max: e.target.value })} />
        </div>
        <div className="w-28">
          <CheckFlag flag={unsure("unit")} />
          <Select inline aria-label={t("form.price_min_label")} value={row.price_unit}
            onChange={(e) => set({ price_unit: e.target.value })}>
            {UNITS.map((u) => <option key={u} value={u}>{tUnit(u)}</option>)}
          </Select>
        </div>
      </div>
      {problem && (
        <p className="text-xs text-error" data-testid={noPrice ? "menu-row-no-price" : "menu-row-problem"}>
          {t(problem)}
        </p>
      )}
    </li>
  );
}
