"""
Module:   address_line
Purpose:  One printed «street, city» line for every place the site shows or
          sends: the city is added only when the street a business typed
          does not already end with it, so «הרצל 5, חיפה» is never printed
          as «הרצל 5, חיפה, חיפה» (MEH-3959).
Does NOT: decide what is public. Callers pass the street only when the
          location is `exact` (product_order_views.pickup_address,
          group_buy_pickup_place.location_out).
Related:  frontend/lib/address-line.js (the same rule for the screens).
History:  MEH-3959 (creation, after a pickup line read «…, זכרון יעקב,
          זכרון יעקב»).
"""


def _ends_with_city(address: str, city: str) -> bool:
    """True when the city is the last comma part of the address, or its last
    words. A street NAMED after a city («דרך חיפה 5») does not end with it,
    so it still gets the city."""
    last = address.rsplit(",", 1)[-1].strip()
    return last == city or address.endswith(" " + city)


def address_line(address: str | None, city: str | None) -> str:
    """«<address>, <city>», without repeating a city the address already
    carries. Either part may be missing; both missing gives ""."""
    street = " ".join((address or "").split()).rstrip(" ,")
    town = " ".join((city or "").split())
    if street and town and _ends_with_city(street, town):
        return street
    return ", ".join(p for p in (street, town) if p)
