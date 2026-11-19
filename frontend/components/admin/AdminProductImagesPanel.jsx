// @ts-check
"use client";

/**
 * Module:   AdminProductImagesPanel
 * Purpose:  On the admin edit page of a page that is NOT a draft (live,
 *           pending, hidden), list its products with the photo button, so the
 *           admin can add the photos the owner sent (Sandra, 19.11).
 * Touches:  POST /upload/product-image/{product_id}, via AdminProductImageButton.
 * Does NOT: render for a draft (DraftProductsPanel carries the same button
 *           there), render with 0 products (nothing to put a photo on — the
 *           catalog import above is where products come from), or add, edit
 *           or delete a product (that is the owner's dashboard).
 * History:  MEH-3456 (creation).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import AdminProductImageButton from "@/components/admin/AdminProductImageButton";

/**
 * @param {{ initialProducts?: Array<{ id: string, name: string, image_url?: string | null }> }} props
 */
export default function AdminProductImagesPanel({ initialProducts = [] }) {
  const tProducts = useTranslations("settings.products");
  const [products, setProducts] = useState(initialProducts);

  // 0 products → no panel (see header). 1 or many → one row each.
  if (products.length === 0) return null;

  /** @param {string} id @param {string} url */
  const setImage = (id, url) =>
    setProducts((list) => list.map((p) => (p.id === id ? { ...p, image_url: url } : p)));

  return (
    <section
      data-testid="admin-product-images-panel"
      className="bg-surface rounded-md border border-border p-6 mb-6 max-w-4xl"
    >
      <h2 className="font-semibold text-lg mb-2 text-primary">{tProducts("section_heading")}</h2>
      <ul className="divide-y divide-border">
        {products.map((p) => (
          <li
            key={p.id}
            data-testid="admin-product-images-row"
            className="py-3 flex flex-wrap items-center gap-3"
          >
            <span className="flex-1 min-w-0 font-medium truncate">{p.name}</span>
            <AdminProductImageButton
              productId={p.id}
              name={p.name}
              imageUrl={p.image_url ?? null}
              onUploaded={(url) => setImage(p.id, url)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
