"""MEH-3959: a printed pickup line never repeats the city."""

from app.services.address_line import address_line


def test_city_already_last_part_is_not_repeated():
    assert (
        address_line("רחוב המייסדים 12, זכרון יעקב", "זכרון יעקב")
        == "רחוב המייסדים 12, זכרון יעקב"
    )


def test_city_already_last_words_without_comma_is_not_repeated():
    assert address_line("הרצל 5 חיפה", "חיפה") == "הרצל 5 חיפה"


def test_street_named_after_the_city_still_gets_the_city():
    assert address_line("דרך חיפה 5", "חיפה") == "דרך חיפה 5, חיפה"


def test_plain_street_gets_the_city():
    assert address_line("הרצל 5", "חיפה") == "הרצל 5, חיפה"


def test_missing_parts():
    assert address_line(None, "חיפה") == "חיפה"
    assert address_line("הרצל 5", None) == "הרצל 5"
    assert address_line(None, None) == ""
    assert address_line("  ", "") == ""


def test_trailing_comma_and_extra_spaces_are_cleaned():
    assert address_line("הרצל 5,  ", " חיפה ") == "הרצל 5, חיפה"


# The two places the bug was seen, end to end.
from types import SimpleNamespace  # noqa: E402

from app.services import product_order_views as views  # noqa: E402
from app.services.group_buy_pickup_place import place_line  # noqa: E402
from tests import test_meh3263_order_route as route  # noqa: E402
from tests._test_meh3263_order_route__common import Shop, _primary, stored_order  # noqa: E402

flag_on = route.flag_on


def test_a_confirmed_pickup_whose_street_carries_the_city_names_it_once(
    client, db, flag_on
):
    shop = Shop(db)
    _primary(
        db,
        shop,
        address="רחוב המייסדים 12, זכרון יעקב",
        city="זכרון יעקב",
        location_precision="exact",
    )
    order = stored_order(db, shop, status="confirmed", pickup_code="4821")
    assert views.pickup_address(db, order) == "רחוב המייסדים 12, זכרון יעקב"


def test_a_group_buy_email_place_line_names_the_city_once():
    loc = SimpleNamespace(
        id=1,
        label="המאפייה",
        city="זכרון יעקב",
        address="רחוב המייסדים 12, זכרון יעקב",
        lat=None,
        lng=None,
        location_precision="exact",
    )
    assert place_line(loc) == "מקום איסוף: המאפייה — רחוב המייסדים 12, זכרון יעקב\n"
