// @ts-check
"use client";
/**
 * Module:   ProductPriceUnitField
 * Purpose:  The «לפי מה המחיר?» dropdown in the owner's product form
 *           (MEH-2936): unit / kg / 100g / bottle / box, with a line that
 *           says where the choice shows.
 * Does NOT: format the price on the public page — lib/product-price.js does.
 * Related:  frontend/lib/product-price.js:PRICE_UNITS (the option list) ·
 *           frontend/components/ProductsSection.jsx (add + edit forms).
 * History:  MEH-2936 (creation).
 */
import { useTranslations } from "next-intl";
import Select from "@/components/ui/Select";
import { PRICE_UNITS } from "@/lib/product-price";

/**
 * @param {{ id: string, value?: string | null, onChange: (unit: string) => void }} props
 */
export default function ProductPriceUnitField({ id, value, onChange }) {
  const tForm = useTranslations("settings.products.form");
  // MEH-2936: one home for the unit labels, shipped to every page (root provider).
  const tUnit = useTranslations("price_unit");
  const current = value && PRICE_UNITS.includes(value) ? value : "unit";
  return (
    <Select
      id={id}
      label={tForm("price_unit_label")}
      helperText={tForm("price_unit_hint")}
      value={current}
      onChange={(/** @type {import("react").ChangeEvent<HTMLSelectElement>} */ e) => onChange(e.target.value)}
    >
      {PRICE_UNITS.map((u) => (
        <option key={u} value={u}>{tUnit(u)}</option>
      ))}
    </Select>
  );
}
