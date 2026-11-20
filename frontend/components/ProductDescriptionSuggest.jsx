// @ts-check
"use client";
/**
 * Module:   ProductDescriptionSuggest
 * Purpose:  «הצעת תיאור» under a product's description field (MEH-3479): asks
 *           the server for a short description from what the form holds now,
 *           shows it as an editable preview, and on «שימוש בהצעה» hands it to
 *           the form. The product save stores it — never this component.
 * Touches:  POST {basePath}/product-description/suggest only.
 * Does NOT: save the product, or moderate (the product POST/PUT does both).
 * Used by:  ProductsSection.jsx (owner, new + edit) and
 *           admin/DraftProductsPanel.jsx (admin, basePath /admin/producers/{id}).
 * History:  MEH-3479 (creation); MEH-3480 (the button + preview moved to
 *           AiTextSuggest.jsx, shared with the review-reply draft)
 */
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import AiTextSuggest from "@/components/AiTextSuggest";

/**
 * @typedef {{ name?: string, description?: string|null, group?: string|null,
 *   price_min?: string|number|null, price_unit?: string|null }} DescribeInput
 */

/** @param {DescribeInput} input */
function payload(input) {
  const price = input.price_min === "" || input.price_min == null ? null : String(input.price_min);
  return {
    name: (input.name || "").trim(),
    ...(input.group ? { group: input.group } : {}),
    ...(price ? { price_min: price, price_unit: input.price_unit || null } : {}),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
  };
}

/**
 * @param {{
 *   basePath?: string,
 *   input: DescribeInput,
 *   onUse: (text: string) => void,
 *   idPrefix: string,
 * }} props
 */
export default function ProductDescriptionSuggest({ basePath = "/producers/me", input, onUse, idPrefix }) {
  const t = useTranslations("settings.products.describe");
  return (
    <AiTextSuggest
      t={t}
      testId="description"
      idPrefix={`${idPrefix}-describe`}
      ready={() => Boolean((input.name || "").trim())}
      request={async () => {
        const r = await api.post(`${basePath}/product-description/suggest`, payload(input));
        return typeof r.data?.description === "string" ? r.data.description : "";
      }}
      onUse={onUse}
    />
  );
}
