# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3484 PR)
"""
Module:   delivery_zones
Purpose:  Write a business's named delivery zones and copy each zone's days,
          minimum, fee and free-delivery threshold onto the delivery_areas
          rows of its cities.
Touches:  producers.delivery_zones (JSONB), delivery_areas (zone_name,
          delivery_days, delivery_day, min_order, delivery_fee,
          free_delivery_above).
Does NOT: validate (schemas/catalog.py DeliveryZoneIn + check_zones), or
          replace the city list (routers/producer_me.py _sync_delivery_areas,
          routers/admin.py _write_delivery_areas run first).
Related:  services/product_order_delivery.py (reads the copied threshold),
          services/producer_listing.py _delivery_day_condition (reads
          delivery_days).
History:  MEH-3484 (creation); MEH-3511 (delivery time + own cutoff copied
          too; a nationwide business may hold zones — areas on other terms).

Why copy instead of resolving at read time: every reader of a city's day,
minimum and fee (the public page, DeliveryChecker, the «משלוחים» filter, the
order flow) reads the delivery_areas row. Copying keeps all of them unchanged,
and a business with no zones is untouched by construction. This module is
the only writer of the copy, so the zone stays the authority.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.data.cities import canonical_city
from app.limits import DELIVERY_CITIES_DETAIL, MAX_DELIVERY_CITIES
from app.models.models import DeliveryArea, Producer


def city_key(city: Any) -> str:
    text = str(city or "").strip()
    return canonical_city(text) or text


def _areas(db: Session, producer: Producer) -> list[DeliveryArea]:
    return db.query(DeliveryArea).filter(DeliveryArea.producer_id == producer.id).all()


def memberships(db: Session, producer: Producer) -> dict[str, str]:
    """{city: zone name} as stored — read BEFORE the city rows are replaced,
    so a save that sends only the cities keeps each city in its zone."""
    return {
        city_key(a.city): str(a.zone_name) for a in _areas(db, producer) if a.zone_name
    }


def _store(producer: Producer, zones: list[Any]) -> dict[str, str]:
    # A zone sent without days stores [] — None would 500 every read of it.
    stored = [
        {**z.model_dump(exclude={"cities"}), "delivery_days": z.delivery_days or []}
        for z in zones
    ]
    producer.delivery_zones = stored or None  # type: ignore[assignment]
    return {city_key(c): z.name for z in zones for c in z.cities}


def _add_missing(
    db: Session, producer: Producer, zones: list[Any], areas: list[DeliveryArea]
) -> list[str]:
    """A city put in a zone is a delivery city — add its row if it has none."""
    have = {city_key(a.city) for a in areas}
    added: list[str] = []
    for zone in zones:
        for city in zone.cities:
            if city_key(city) not in have:
                db.add(DeliveryArea(producer_id=producer.id, city=city))
                have.add(city_key(city))
                added.append(city)
    return added


def _copy(area: DeliveryArea, name: str, zone: dict[str, Any]) -> None:
    days = list(zone.get("delivery_days") or [])
    area.zone_name = name  # type: ignore[assignment]
    area.delivery_days = days  # type: ignore[assignment]
    area.delivery_day = days[0] if days else None  # type: ignore[assignment]
    area.min_order = zone.get("min_order")  # type: ignore[assignment]
    area.delivery_fee = zone.get("delivery_fee")  # type: ignore[assignment]
    area.free_delivery_above = zone.get("free_delivery_above")  # type: ignore[assignment]
    # MEH-3511
    for key in _ZONE_ONLY:
        setattr(area, key, zone.get(key))


# MEH-3511: values a city has only through its zone — there is no per-city
# editor for them, so a city that leaves every zone loses them.
_ZONE_ONLY = (
    "delivery_days_min",
    "delivery_days_max",
    "order_cutoff_day",
    "order_cutoff_time",
)


# MEH-3511 review finding 2: «כל הארץ חוץ מ…» and a zone holding the same city
# answered differently on the checker, the filter and the order flow.
EXCLUDED_ZONE_CITY_DETAIL = (
    "עיר לא יכולה להיות גם ברשימת «חוץ מ» וגם באזור משלוח: {city}."
)


def _refuse_excluded_zone_city(producer: Producer, member: dict[str, str]) -> None:
    if not producer.delivery_nationwide:
        return
    excluded = {city_key(c) for c in (producer.delivery_excluded_cities or [])}
    clash = sorted(c for c in member if c in excluded)
    if clash:
        raise HTTPException(
            status_code=422, detail=EXCLUDED_ZONE_CITY_DETAIL.format(city=clash[0])
        )


def sync(
    db: Session,
    producer: Producer,
    zones: list[Any] | None,
    before: dict[str, str],
) -> list[str]:
    """Apply zones after the city rows were written. `zones` None = the body
    did not send them: keep the stored zones and `before` memberships.
    Returns the cities this added (for the new-delivery-city alert)."""
    db.flush()
    if not producer.offers_delivery:
        # Not delivering: no city rows, so no zones either — judged on the
        # saved state, not only on what this body sent.
        zones = []
    # MEH-3511: nationwide keeps its zones (areas on other terms); the loop
    # below drops any city row of a nationwide business that is in no zone.
    areas = _areas(db, producer)
    added: list[str] = []
    if zones is not None:
        member = _store(producer, zones)
        added = _add_missing(db, producer, zones, areas)
        if added:
            db.flush()
            areas = _areas(db, producer)
            # MEH-3022: zone cities count toward the same delivery-city cap.
            if len(areas) > MAX_DELIVERY_CITIES:
                raise HTTPException(status_code=422, detail=DELIVERY_CITIES_DETAIL)
    else:
        member = before
    stored: list[dict[str, Any]] = producer.delivery_zones or []  # type: ignore[assignment]
    by_name = {str(z.get("name")): z for z in stored}
    _refuse_excluded_zone_city(producer, member)
    for area in areas:
        name = member.get(city_key(area.city))
        zone = by_name.get(name) if name else None
        if zone is None:
            # Out of every zone: the city keeps the day, minimum and fee it
            # had; only the zone-only threshold goes.
            if producer.delivery_nationwide and (
                stored or city_key(area.city) in before
            ):
                # MEH-3511: a nationwide business with zones keeps only zone
                # rows — a city outside every zone is just «כל הארץ». A city
                # that just left its zone goes too (review finding 4). Legacy
                # rows of a nationwide business without zones stay as before.
                db.delete(area)
                continue
            area.zone_name = None  # type: ignore[assignment]
            area.free_delivery_above = None  # type: ignore[assignment]
            for key in _ZONE_ONLY:
                setattr(area, key, None)
            continue
        _copy(area, str(name), zone)
    return added
