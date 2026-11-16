"""MEH-293 — dietary filter via EXISTS subquery on product flags.

Replaces the legacy `Producer.vegan == TRUE` filter with
`Producer.products.any(Product.is_vegan == TRUE)`. These tests pin the
behavior matrix from the spec:

  - producer with at least one is_vegan=TRUE product → in `?vegan=true`
  - producer with only is_vegan=FALSE products → NOT in `?vegan=true`
  - producer with zero products → NOT in `?vegan=true` (intentional;
    the imprecision MEH-293 set out to fix)
  - flipping the last vegan product to FALSE drops the producer

Also pins the aggregated output field `has_vegan_products` on
ProducerListOut, which the frontend reads for badge display during the
7-day overlap.
"""
from __future__ import annotations

from app.models.models import Product
from tests.conftest import make_producer


def _add_product(
    db,
    producer,
    *,
    name="מוצר",
    is_vegan=False,
    is_gluten_free=False,
    is_lactose_free=False,
    is_vegetarian=False,
    is_no_added_sugar=False,
    is_low_carb=False,
):
    p = Product(
        producer_id=producer.id,
        name=name,
        is_vegan=is_vegan,
        is_gluten_free=is_gluten_free,
        is_lactose_free=is_lactose_free,
        is_vegetarian=is_vegetarian,
        is_no_added_sugar=is_no_added_sugar,
        is_low_carb=is_low_carb,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def test_vegan_filter_returns_producer_with_at_least_one_vegan_product(client, db):
    p_with_vegan = make_producer(db, name="חוות הטבעוניות")
    _add_product(db, p_with_vegan, name="חומוס טבעוני", is_vegan=True)
    _add_product(db, p_with_vegan, name="גבינה לבנה", is_vegan=False)

    p_without = make_producer(db, name="גבינות הכפר")
    _add_product(db, p_without, name="גבינת עיזים", is_vegan=False)

    r = client.get("/producers", params={"vegan": "true"})
    assert r.status_code == 200
    names = [row["name"] for row in r.json()]
    assert "חוות הטבעוניות" in names
    assert "גבינות הכפר" not in names


def test_vegan_filter_excludes_producer_with_zero_products(client, db):
    """Intentional MEH-293 behavior change — a producer with no products
    cannot offer anything vegan, so they correctly drop out of the filter
    once dietary flags live on products instead of on the business."""
    p_empty = make_producer(db, name="עסק בלי מוצרים")

    r = client.get("/producers", params={"vegan": "true"})
    assert r.status_code == 200
    names = [row["name"] for row in r.json()]
    assert "עסק בלי מוצרים" not in names


def test_removing_last_vegan_flag_drops_producer_from_filter(client, db):
    p = make_producer(db, name="חווה אחת בלבד")
    only_vegan = _add_product(db, p, name="טופו ביתי", is_vegan=True)

    r = client.get("/producers", params={"vegan": "true"})
    assert "חווה אחת בלבד" in [row["name"] for row in r.json()]

    only_vegan.is_vegan = False
    db.commit()

    r = client.get("/producers", params={"vegan": "true"})
    assert "חווה אחת בלבד" not in [row["name"] for row in r.json()]


def test_aggregated_has_vegan_products_field_reflects_any_product(client, db):
    p_yes = make_producer(db, name="עם טבעוני")
    _add_product(db, p_yes, name="פיתה", is_vegan=True)

    p_no = make_producer(db, name="בלי טבעוני")
    _add_product(db, p_no, name="חמאה", is_vegan=False)

    r = client.get("/producers")
    assert r.status_code == 200
    by_name = {row["name"]: row for row in r.json()}
    assert by_name["עם טבעוני"]["has_vegan_products"] is True
    assert by_name["בלי טבעוני"]["has_vegan_products"] is False


def test_dietary_filters_independent_per_flag(client, db):
    """gluten_free and lactose_free filter on their own product flags
    (each flag is independent — no fall-through to the other two)."""
    p_gf_only = make_producer(db, name="ללא גלוטן בלבד")
    _add_product(db, p_gf_only, name="עוגיות שיבולת שועל", is_gluten_free=True)

    p_lf_only = make_producer(db, name="ללא לקטוז בלבד")
    _add_product(db, p_lf_only, name="חלב שקדים", is_lactose_free=True)

    r = client.get("/producers", params={"gluten_free": "true"})
    names = [row["name"] for row in r.json()]
    assert "ללא גלוטן בלבד" in names
    assert "ללא לקטוז בלבד" not in names

    r = client.get("/producers", params={"lactose_free": "true"})
    names = [row["name"] for row in r.json()]
    assert "ללא לקטוז בלבד" in names
    assert "ללא גלוטן בלבד" not in names


# --- MEH-1438: vegetarian axis (is_vegetarian OR is_vegan) --------------------


def test_vegetarian_filter_returns_producer_with_vegetarian_product(client, db):
    p_veg = make_producer(db, name="מטבח צמחוני")
    _add_product(db, p_veg, name="קציצות עדשים", is_vegetarian=True)

    p_none = make_producer(db, name="קצביית הכפר")
    _add_product(db, p_none, name="שניצל עוף", is_vegetarian=False, is_vegan=False)

    r = client.get("/producers", params={"vegetarian": "true"})
    assert r.status_code == 200
    names = [row["name"] for row in r.json()]
    assert "מטבח צמחוני" in names
    assert "קצביית הכפר" not in names


def test_vegan_product_implies_vegetarian(client, db):
    """A vegan product is vegetarian by definition — the ?vegetarian filter
    matches `is_vegetarian OR is_vegan`, so a product marked vegan-only (the
    migration-backfill scenario: is_vegan=TRUE, is_vegetarian never set) still
    surfaces under ?vegetarian=true without the owner marking both."""
    p_vegan_only = make_producer(db, name="חוות הטופו")
    _add_product(db, p_vegan_only, name="טופו מעושן", is_vegan=True, is_vegetarian=False)

    r = client.get("/producers", params={"vegetarian": "true"})
    assert r.status_code == 200
    names = [row["name"] for row in r.json()]
    assert "חוות הטופו" in names


def test_vegetarian_filter_false_excludes_vegetarian_and_vegan(client, db):
    """?vegetarian=false is the complement — a producer with any vegetarian OR
    vegan product is excluded; a producer with only non-veg products remains."""
    p_veg = make_producer(db, name="פלאפל השכונה")
    _add_product(db, p_veg, name="פלאפל", is_vegetarian=True)

    p_vegan = make_producer(db, name="גלידה טבעונית")
    _add_product(db, p_vegan, name="גלידת קוקוס", is_vegan=True)

    p_meat = make_producer(db, name="גריל בשרים")
    _add_product(db, p_meat, name="המבורגר", is_vegetarian=False, is_vegan=False)

    r = client.get("/producers", params={"vegetarian": "false"})
    assert r.status_code == 200
    names = [row["name"] for row in r.json()]
    assert "גריל בשרים" in names
    assert "פלאפל השכונה" not in names
    assert "גלידה טבעונית" not in names


def test_aggregated_has_vegetarian_products_counts_vegan_too(client, db):
    p_veg = make_producer(db, name="עם צמחוני")
    _add_product(db, p_veg, name="חביתה", is_vegetarian=True)

    p_vegan = make_producer(db, name="עם טבעוני בלבד")
    _add_product(db, p_vegan, name="חומוס", is_vegan=True, is_vegetarian=False)

    p_no = make_producer(db, name="בלי צמחוני")
    _add_product(db, p_no, name="סטייק", is_vegetarian=False, is_vegan=False)

    r = client.get("/producers")
    assert r.status_code == 200
    by_name = {row["name"]: row for row in r.json()}
    assert by_name["עם צמחוני"]["has_vegetarian_products"] is True
    assert by_name["עם טבעוני בלבד"]["has_vegetarian_products"] is True
    assert by_name["בלי צמחוני"]["has_vegetarian_products"] is False


# ---------------------------------------------------------------------------
# MEH-1934 — no_added_sugar + low_carb axes.
#
# Same EXISTS-over-products mechanic as MEH-293. What these pin that the four
# older axes do not: the two flags are INDEPENDENT of every other axis. There
# is no implication in either direction (unlike MEH-1438's vegan⇒vegetarian),
# so the migration ships no backfill and nothing may leak between them.
# ---------------------------------------------------------------------------


def test_no_added_sugar_filter_returns_producer_with_matching_product(client, db):
    match = make_producer(db, name="מאפיית ללא סוכר")
    _add_product(db, match, name="עוגת תמרים", is_no_added_sugar=True)
    _add_product(db, match, name="עוגת שוקולד", is_no_added_sugar=False)

    other = make_producer(db, name="קונדיטוריה מתוקה")
    _add_product(db, other, name="עוגת דבש", is_no_added_sugar=False)

    r = client.get("/producers", params={"no_added_sugar": "true"})
    assert r.status_code == 200
    names = [row["name"] for row in r.json()]
    assert "מאפיית ללא סוכר" in names
    assert "קונדיטוריה מתוקה" not in names


def test_low_carb_filter_returns_producer_with_matching_product(client, db):
    match = make_producer(db, name="מטבח דל פחמימות")
    _add_product(db, match, name="לחם אגוזים", is_low_carb=True)

    other = make_producer(db, name="מאפיית הכפר")
    _add_product(db, other, name="באגט", is_low_carb=False)

    r = client.get("/producers", params={"low_carb": "true"})
    assert r.status_code == 200
    names = [row["name"] for row in r.json()]
    assert "מטבח דל פחמימות" in names
    assert "מאפיית הכפר" not in names


def test_no_added_sugar_excludes_producer_with_zero_products(client, db):
    """Mirrors the MEH-293 rule: no products means nothing to offer."""
    empty = make_producer(db, name="עסק בלי קטלוג")

    r = client.get("/producers", params={"no_added_sugar": "true"})
    assert r.status_code == 200
    assert "עסק בלי קטלוג" not in [row["name"] for row in r.json()]
    assert empty is not None


def test_false_value_selects_producers_without_the_flag(client, db):
    with_flag = make_producer(db, name="עם סימון")
    _add_product(db, with_flag, name="קינוח", is_low_carb=True)
    without = make_producer(db, name="בלי סימון")
    _add_product(db, without, name="לחמנייה", is_low_carb=False)

    r = client.get("/producers", params={"low_carb": "false"})
    assert r.status_code == 200
    names = [row["name"] for row in r.json()]
    assert "בלי סימון" in names
    assert "עם סימון" not in names


def test_the_two_new_axes_do_not_leak_into_each_other(client, db):
    """The discriminating case for 'no implication between the axes'.

    A product marked ONLY no-added-sugar must not surface under ?low_carb, and
    vice versa. If anyone later 'helpfully' seeds one from the other — the
    MEH-1438 vegan⇒vegetarian shape, which is exactly what this ticket declined
    to do — this test is what goes red.
    """
    sugar_only = make_producer(db, name="רק ללא סוכר")
    _add_product(db, sugar_only, name="ריבה", is_no_added_sugar=True)

    carb_only = make_producer(db, name="רק דל פחמימות")
    _add_product(db, carb_only, name="קרקר", is_low_carb=True)

    sugar_names = [r["name"] for r in client.get("/producers", params={"no_added_sugar": "true"}).json()]
    carb_names = [r["name"] for r in client.get("/producers", params={"low_carb": "true"}).json()]

    assert "רק ללא סוכר" in sugar_names and "רק דל פחמימות" not in sugar_names
    assert "רק דל פחמימות" in carb_names and "רק ללא סוכר" not in carb_names


def test_new_axes_do_not_leak_into_the_older_four(client, db):
    """A no-added-sugar product is not vegan/vegetarian/GF/lactose-free."""
    p = make_producer(db, name="עסק סוכר בלבד")
    _add_product(db, p, name="ממרח פרי", is_no_added_sugar=True, is_low_carb=True)

    for axis in ("vegan", "vegetarian", "gluten_free", "lactose_free"):
        names = [row["name"] for row in client.get("/producers", params={axis: "true"}).json()]
        assert "עסק סוכר בלבד" not in names, f"leaked into ?{axis}=true"


def test_aggregated_has_fields_reflect_any_product(client, db):
    p = make_producer(db, name="עסק מעורב")
    _add_product(db, p, name="עוגייה", is_no_added_sugar=True)
    _add_product(db, p, name="לחם", is_no_added_sugar=False)

    row = next(r for r in client.get("/producers").json() if r["name"] == "עסק מעורב")
    assert row["has_no_added_sugar_products"] is True
    # Nothing was marked low-carb, so the sibling aggregate stays False —
    # the aggregation must not fold one axis into the other either.
    assert row["has_low_carb_products"] is False


# --- MEH-388: one dedicated filter test per tag for the two axes that had none --
# vegan / vegetarian each have their own behaviour tests above; gluten_free and
# lactose_free were only covered together by test_dietary_filters_independent_per_flag,
# which checks inclusion and no cross-leak but never a mixed catalog, an
# all-False catalog, an empty catalog, or the last flag being removed. These two
# mirror the vegan matrix (at-least-one / all-False / zero products / un-flag).


def _names(client, **params):
    r = client.get("/producers", params=params)
    assert r.status_code == 200
    return [row["name"] for row in r.json()]


def test_gluten_free_filter_matches_any_gluten_free_product_only(client, db):
    p_mixed = make_producer(db, name="מאפיית שיבולת")
    gf = _add_product(db, p_mixed, name="עוגיות ללא גלוטן", is_gluten_free=True)
    _add_product(db, p_mixed, name="לחם חיטה", is_gluten_free=False)

    p_none = make_producer(db, name="מאפיית חיטה")
    _add_product(db, p_none, name="חלה", is_gluten_free=False)

    make_producer(db, name="מאפייה ריקה")

    # A dedicated-facility declaration with no gluten-free product does NOT
    # satisfy ?gluten_free — the facility column is not read by the filter
    # (producer_listing._SCOPE_COLUMN_FOR_AXIS holds only `vegan`; MEH-1508 §6.3).
    p_facility = make_producer(db, name="מתקן ללא גלוטן בלי מוצר מסומן")
    p_facility.gluten_free_facility = "dedicated"
    db.commit()
    _add_product(db, p_facility, name="מוצר לא מסומן", is_gluten_free=False)

    names = _names(client, gluten_free="true")
    assert "מאפיית שיבולת" in names
    assert "מאפיית חיטה" not in names
    assert "מאפייה ריקה" not in names
    assert "מתקן ללא גלוטן בלי מוצר מסומן" not in names

    gf.is_gluten_free = False
    db.commit()
    assert "מאפיית שיבולת" not in _names(client, gluten_free="true")


def test_lactose_free_filter_matches_any_lactose_free_product_only(client, db):
    p_mixed = make_producer(db, name="מחלבת שקדים")
    lf = _add_product(db, p_mixed, name="משקה שקדים", is_lactose_free=True)
    _add_product(db, p_mixed, name="יוגורט פרה", is_lactose_free=False)

    p_none = make_producer(db, name="מחלבת פרות")
    _add_product(db, p_none, name="גבינה צהובה", is_lactose_free=False)

    make_producer(db, name="מחלבה ריקה")

    # Same rule as gluten above: the facility column is not read by the filter.
    p_facility = make_producer(db, name="מתקן ללא לקטוז בלי מוצר מסומן")
    p_facility.lactose_free_facility = "dedicated"
    db.commit()
    _add_product(db, p_facility, name="מוצר לא מסומן", is_lactose_free=False)

    names = _names(client, lactose_free="true")
    assert "מחלבת שקדים" in names
    assert "מחלבת פרות" not in names
    assert "מחלבה ריקה" not in names
    assert "מתקן ללא לקטוז בלי מוצר מסומן" not in names

    lf.is_lactose_free = False
    db.commit()
    assert "מחלבת שקדים" not in _names(client, lactose_free="true")
