"""
Module:   product_variants (service)
Purpose:  The rules every surface shares about a product's sizes or flavours:
          which variants can be ordered, what one unit of each costs, and
          which variant an order line means.
Touches:  No side effects. Reads Product.variants (loaded with the product).
Does NOT: write anything — the owner's list is written by
          app/routers/product_variants.py. Does NOT trust a price from the
          client: a line's price comes from here or from the product.
Related:  app/services/product_order_create.py::order_lines (the order),
          app/routers/product_order_offer.py::_menu_product (the order menu)
History:  MEH-3617 (creation)
"""

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.models.catalog import Product, ProductVariant

# Approved copy class (Sapir 20/11, checked in the PR body).
VARIANT_REQUIRED_DETAIL = "צריך לבחור אפשרות למוצר"
VARIANT_GONE_DETAIL = "האפשרות שנבחרה כבר לא זמינה. צריך לעדכן את ההזמנה"


@dataclass(frozen=True)
class VariantChoice:
    """What a line resolves to: `variant` None = a product with no variants."""

    variant: ProductVariant | None


class VariantRefused(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def variants_of(product: Product) -> list[ProductVariant]:
    return list(product.variants or [])


def has_stock(product: Product) -> bool:
    """A product is in stock when its own flag says so AND, if it has
    variants, at least one of them is. All variants out = the product is out."""
    if not product.in_stock:
        return False
    variants = variants_of(product)
    return not variants or any(v.in_stock for v in variants)


def choose(product: Product, variant_id: UUID | None) -> VariantChoice:
    """The variant an order line means, or VariantRefused.

    0 variants: the line must not name one. 1 variant: it is applied even when
    the line names none (the page shows no choice). Many: the line must name
    an in-stock variant of THIS product.
    """
    variants = variants_of(product)
    if not variants:
        if variant_id is not None:
            raise VariantRefused(VARIANT_GONE_DETAIL, 409)
        return VariantChoice(None)
    if variant_id is None:
        if len(variants) == 1 and variants[0].in_stock:
            return VariantChoice(variants[0])
        if len(variants) == 1:
            raise VariantRefused(VARIANT_GONE_DETAIL, 409)
        raise VariantRefused(VARIANT_REQUIRED_DETAIL, 422)
    for variant in variants:
        if variant.id == variant_id:
            if not variant.in_stock:
                raise VariantRefused(VARIANT_GONE_DETAIL, 409)
            return VariantChoice(variant)
    raise VariantRefused(VARIANT_GONE_DETAIL, 409)


def unit_price(low: int, high: int, variant: ProductVariant | None) -> tuple[int, bool]:
    """(agorot for one unit, whether the price is a range). A variant with its
    own price is exact; one without takes the product's price, a range at its
    high end — the same rule as a product with no variants."""
    if variant is not None and variant.price_agorot is not None:
        return int(variant.price_agorot), False
    return max(low, high), high != low


def menu_variants(
    product: Product, low: int, high: int, weighed: bool
) -> list[dict[str, Any]]:
    """The variants as the order menu hands them out, each with the price the
    order route will store for it."""
    rows = []
    for variant in variants_of(product):
        price, is_range = unit_price(low, high, variant)
        rows.append(
            {
                "id": variant.id,
                "name": variant.name,
                "price_agorot": price,
                "price_is_estimate": is_range or weighed,
                "in_stock": bool(variant.in_stock),
            }
        )
    return rows
