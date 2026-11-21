// @ts-check
/**
 * Module:   ProductPrice
 * Purpose:  A product's numeric price with what it is per (MEH-2936):
 *           «80₪ לבקבוק». The price sits in its own dir="ltr" span (MEH-1140
 *           bidi isolation); the unit label follows in natural direction.
 * Does NOT: render a free-text `price_range` label — callers keep that path.
 * Related:  frontend/lib/product-price.js (productNumericPrice, productUnitLabel).
 * History:  MEH-2936 (creation); MEH-3617 (with variants: one shows its
 *           price, several that differ «מ-20₪», the lowest in stock).
 */
import { useTranslations } from "next-intl";
import { productNumericPrice, productUnitLabel } from "@/lib/product-price";
import { variantPrice } from "@/lib/product-variants";
import { formatPriceRange } from "@/lib/utils";

/**
 * @param {{ product: { price_min?: number | string | null, price_max?: number | string | null, price_unit?: string | null } }} props
 */
export default function ProductPrice({ product }) {
  const tUnit = useTranslations("price_unit");
  const t = useTranslations("product_variants");
  const variant = variantPrice(product);
  const price = variant ? formatPriceRange(variant.shekels, variant.shekels) : productNumericPrice(product);
  if (!price) return null;
  const unit = productUnitLabel(product, tUnit);
  return (
    <>
      {variant?.from && <span data-testid="product-price-from">{t("from")}</span>}
      <span dir="ltr">{price}</span>
      {unit && <span data-testid="product-price-unit"> {unit}</span>}
    </>
  );
}
