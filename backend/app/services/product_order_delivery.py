"""
Module:   product_order_delivery
Purpose:  Decide whether a business delivers an order to a city, and what the
          delivery costs, from the delivery facts the business already keeps.
Touches:  Reads producers (delivery columns) and delivery_areas. Writes
          nothing.
Does NOT: own any delivery fact. The columns stay owned by the dashboard's
          delivery form (routers/producer_me.py); this module only reads them
          and converts whole shekels to agorot.
          Does NOT guess: a business that publishes no delivery fee cannot be
          ordered from for delivery, because the buyer must see the cost
          before she sends the request.
Related:  app/models/models.py (Producer.delivery_*, DeliveryArea),
          app/services/product_order_create.py (the caller)
History:  MEH-3263 (creation; stage 2b of MEH-3216); MEH-3970 (the fee
          before the minimum; can_price_some_city for the menu)
"""

from dataclasses import dataclass
from typing import Any, cast

from sqlalchemy.orm import Session

from app.data.cities import canonical_city
from app.models.models import DeliveryArea, Producer

AGOROT_PER_SHEKEL = 100

NO_DELIVERY_DETAIL = "בית העסק לא עושה משלוחים"
CITY_NOT_SERVED_DETAIL = "בית העסק לא עושה משלוחים לעיר הזאת"
FEE_NOT_PUBLISHED_DETAIL = (
    "בית העסק עוד לא פרסם דמי משלוח, ולכן אפשר להזמין ממנו רק באיסוף"
)
# MEH-3511: no «לעיר הזאת» — the minimum may now be the business-wide one.
AREA_MINIMUM_DETAIL = "סכום ההזמנה נמוך מהמינימום למשלוח"


class DeliveryRefused(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


@dataclass(frozen=True)
class DeliveryFacts:
    """A business's delivery rules, detached from the ORM rows. Money in
    whole shekels, as stored. `area_*` describe the row of `delivery_areas`
    for the buyer's city, when there is one."""

    offers_delivery: bool
    nationwide: bool
    cities: frozenset[str]
    excluded_cities: frozenset[str]
    fee: int | None
    free_above: int | None
    has_area: bool = False
    area_fee: int | None = None
    area_min_order: int | None = None


def quote(facts: DeliveryFacts, city: str, subtotal_agorot: int) -> int:
    """The delivery fee in agorot for `city`, or DeliveryRefused.

    `city` is already canonical. Order of the fee: the city's own override,
    else the business's fee; then the free-delivery threshold zeroes it.
    0 is a real fee ("free"), None is "not stated" — never mixed.
    """
    if not facts.offers_delivery:
        raise DeliveryRefused(NO_DELIVERY_DETAIL)
    served = (
        facts.has_area
        or city in facts.cities
        or (facts.nationwide and city not in facts.excluded_cities)
    )
    if not served:
        raise DeliveryRefused(CITY_NOT_SERVED_DETAIL)
    # MEH-3970: the hard «no» before the soft «add more» — a buyer who adds
    # items to pass the minimum must not then learn there is no fee at all.
    fee = facts.area_fee if facts.area_fee is not None else facts.fee
    if fee is None:
        raise DeliveryRefused(FEE_NOT_PUBLISHED_DETAIL)
    if (
        facts.area_min_order is not None
        and subtotal_agorot < facts.area_min_order * AGOROT_PER_SHEKEL
    ):
        raise DeliveryRefused(AREA_MINIMUM_DETAIL)
    if (
        facts.free_above is not None
        and subtotal_agorot >= facts.free_above * AGOROT_PER_SHEKEL
    ):
        return 0
    return fee * AGOROT_PER_SHEKEL


def can_price_some_city(db: Session, producer: Producer) -> bool:
    """MEH-3970: whether `quote` can succeed for at least one city.

    False when she switched delivery off, serves no city, or published no fee
    — none for the business and none on any city. The order menu offers no
    delivery slot then, so the buyer never picks «משלוח» to be refused after
    typing her city."""
    if not producer.offers_delivery:
        return False
    areas = db.query(DeliveryArea).filter(DeliveryArea.producer_id == producer.id).all()
    if any(area.delivery_fee is not None for area in areas):
        return True
    if producer.delivery_fee is None:
        return False
    return bool(areas or producer.delivery_nationwide or producer.delivery_cities)


def unpriced_detail(producer: Producer) -> str:
    """The refusal for a delivery when can_price_some_city is False — the
    same words quote() would give, so a weekly repeat that is skipped still
    says why (fresh review of MEH-3970)."""
    if not producer.offers_delivery:
        return NO_DELIVERY_DETAIL
    if producer.delivery_fee is None:
        return FEE_NOT_PUBLISHED_DETAIL
    return CITY_NOT_SERVED_DETAIL


def _canonical_set(values: Any) -> frozenset[str]:
    return frozenset(canonical_city(v) or "" for v in (values or []))


def _free_above(area: DeliveryArea | None, producer: Producer) -> int | None:
    # MEH-3484: the city's zone threshold first, else the business's.
    if area is not None and area.free_delivery_above is not None:
        return int(area.free_delivery_above)
    return cast("int | None", producer.free_delivery_above)


def _min_order(area: DeliveryArea | None, producer: Producer) -> int | None:
    if area is not None and area.min_order is not None:
        return int(area.min_order)
    return cast("int | None", producer.delivery_min_order)


def facts_for(db: Session, producer: Producer, city: str) -> DeliveryFacts:
    areas = db.query(DeliveryArea).filter(DeliveryArea.producer_id == producer.id).all()
    area = next((a for a in areas if canonical_city(str(a.city)) == city), None)
    return DeliveryFacts(
        offers_delivery=bool(producer.offers_delivery),
        nationwide=bool(producer.delivery_nationwide),
        cities=_canonical_set(producer.delivery_cities),
        excluded_cities=_canonical_set(producer.delivery_excluded_cities),
        fee=producer.delivery_fee,  # type: ignore[arg-type]
        free_above=_free_above(area, producer),
        has_area=area is not None,
        area_fee=area.delivery_fee if area is not None else None,  # type: ignore[arg-type]
        # MEH-3511: the city's own minimum, else the business-wide one.
        area_min_order=_min_order(area, producer),
    )
