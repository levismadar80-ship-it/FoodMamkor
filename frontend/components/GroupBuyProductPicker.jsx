"use client";
// @ts-check

/**
 * Module:   GroupBuyProductPicker
 * Purpose:  «מילוי ממוצר קיים» above the group-buy product name: picking one of
 *           the business's own products fills the name and the regular price,
 *           both still editable. Saves the owner retyping what her page has.
 * Does NOT: save anything or own the form — it reports the picked product up.
 *           Renders nothing when the business has no products or the list
 *           cannot be read (0 items = no control, not an empty dropdown).
 * Related:  app/[locale]/producer/dashboard/group-buys/page.js NewGroupBuyForm;
 *           components/ProductsSection.jsx (same GET /producers/me/products).
 * History:  MEH-3438 (creation).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import Select from "@/components/ui/Select";

/** @param {{ onPick: (product: { name: string, regularPrice: string }) => void }} props */
export default function GroupBuyProductPicker({ onPick }) {
  const t = useTranslations("group_buys.dashboard.form");
  const [products, setProducts] = useState(/** @type {any[]} */ ([]));

  useEffect(() => {
    let alive = true;
    api
      .get("/producers/me/products")
      .then((r) => {
        if (alive && Array.isArray(r.data)) setProducts(r.data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (products.length === 0) return null;

  const handleChange = (/** @type {import("react").ChangeEvent<HTMLSelectElement>} */ e) => {
    const product = products.find((p) => String(p.id) === e.target.value);
    if (!product) return;
    // price_min is the product's regular (lowest) price; a range keeps its
    // floor, and no price leaves the field for her to fill.
    const regularPrice = product.price_min == null ? "" : String(Number(product.price_min));
    onPick({ name: product.name, regularPrice });
    // A one-shot fill, not a binding: the select returns to «בחירת מוצר», so it
    // never claims to match fields she has since edited.
    e.target.value = "";
  };

  return (
    <Select
      label={t("prefill_label")}
      helperText={t("prefill_helper")}
      defaultValue=""
      onChange={handleChange}
      data-testid="group-buy-product-picker"
    >
      <option value="">{t("prefill_placeholder")}</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}
