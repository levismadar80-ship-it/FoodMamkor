// @ts-check
/**
 * Module:   ProductPrice
 * Purpose:  A product's numeric price with what it is per (MEH-2936):
 *           «80₪ לבקבוק». The price sits in its own dir="ltr" span (MEH-1140
 *           bidi isolation); the unit label follows in natural direction.
 * Does NOT: render a free-text `price_range` label — callers keep that path.
 * Related:  frontend/lib/product-price.js (productNumericPrice, productUnitLabel).
 * History:  MEH-2936 (creation).
 */
import { useTranslations } from "next-intl";
import { productNumericPrice, productUnitLabel } from "@/lib/product-price";

/**
 * @param {{ product: { price_min?: number | string | null, price_max?: number | string | null, price_unit?: string | null } }} props
 */
export default function ProductPrice({ product }) {
  const tUnit = useTranslations("admin.producers.product_import.unit");
  const price = productNumericPrice(product);
  if (!price) return null;
  const unit = productUnitLabel(product, tUnit);
  return (
    <>
      <span dir="ltr">{price}</span>
      {unit && <span data-testid="product-price-unit"> {unit}</span>}
    </>
  );
}
