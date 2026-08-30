"""MEH-1508 chunk 3א — the business-level 100% declaration must satisfy the
exposed dietary filter.

THE CONTRADICTION THIS CLOSES
-----------------------------
Chunk 1 added `producers.vegan_scope` / `vegetarian_scope` ('unknown' | 'some' |
'all'), and chunk 2 gave the owner a way to declare `all`. But the filter has
been an EXISTS over `products` since MEH-293, so a business that declares
everything it sells is vegan and has NOT tagged an individual product is
invisible under `?vegan=true` — while the card's own chunk-3 plan puts it under
a "100% טבעוני" chip. Two surfaces, one business, opposite answers.

The fix is the one the card prescribes:
    ?vegan=true       ->  EXISTS(products.is_vegan)                  OR vegan_scope='all'
    ?vegetarian=true  ->  EXISTS(is_vegetarian OR is_vegan)          OR vegetarian_scope='all'

WHY THE CONTROLS ARE HALF THIS FILE
-----------------------------------
An OR that widens a filter is the easiest thing in the world to over-apply, and
every over-application looks like a pass on the headline case. So each widening
assertion is paired with one that must STAY excluded: 'some' and 'unknown' with
zero products, the other four dietary axes, and the `false` half of the same
axis. Delete the OR and the first group reddens; replace the condition with
something permanently true and the second group reddens. Neither group alone
discriminates.

`gluten_free` / `lactose_free` are deliberately NOT part of this: the card
(§6.3, §2) rules them a FACILITY question, not a catalog one, and they have no
`*_scope` column to read. Asserted below rather than left to inference.
"""

from __future__ import annotations

from app.models.models import Product
from tests.conftest import make_producer


def _scoped(db, *, name, vegan_scope="unknown", vegetarian_scope="unknown"):
    """A producer carrying a business-level declaration and NO products.

    Zero products is the whole point — it is the state in which the EXISTS
    subquery and the declaration disagree.
    """
    p = make_producer(db, name=name)
    p.vegan_scope = vegan_scope
    p.vegetarian_scope = vegetarian_scope
    db.commit()
    db.refresh(p)
    return p


def _add_product(db, producer, *, name="מוצר", **flags):
    p = Product(producer_id=producer.id, name=name, **flags)
    db.add(p)
    db.commit()
    return p


def _names(client, params):
    r = client.get("/producers", params=params)
    assert r.status_code == 200, r.text
    return {row["name"] for row in r.json()}


# --------------------------------------------------------------------------
# CONTROL FIRST. If the fixture cannot even produce a listable producer, every
# "not in the results" assertion below is green for the wrong reason.
# --------------------------------------------------------------------------
def test_control_a_scoped_producer_is_listed_at_all(client, db):
    _scoped(db, name="מטבח ירוק", vegan_scope="all")
    assert "מטבח ירוק" in _names(client, {})


# --------------------------------------------------------------------------
# The bug, both axes.
# --------------------------------------------------------------------------
def test_vegan_scope_all_with_zero_products_matches_the_vegan_filter(client, db):
    _scoped(db, name="הכל טבעוני כאן", vegan_scope="all")
    assert "הכל טבעוני כאן" in _names(client, {"vegan": "true"})


def test_vegetarian_scope_all_with_zero_products_matches_the_vegetarian_filter(client, db):
    _scoped(db, name="הכל צמחוני כאן", vegetarian_scope="all")
    assert "הכל צמחוני כאן" in _names(client, {"vegetarian": "true"})


def test_vegan_scope_all_matches_even_when_products_are_untagged(client, db):
    """The declaration is about the BUSINESS, so an untagged catalog does not
    contradict it. Distinct from the zero-product case above: here the EXISTS
    subquery has rows to look at and still returns false."""
    p = _scoped(db, name="מאפייה טבעונית", vegan_scope="all")
    _add_product(db, p, name="לחם", is_vegan=False)
    assert "מאפייה טבעונית" in _names(client, {"vegan": "true"})


# --------------------------------------------------------------------------
# Controls: what must STAY out. Without these the OR could be anything.
# --------------------------------------------------------------------------
def test_scope_some_with_zero_products_still_excluded(client, db):
    """'some' means "not everything" — it is not a declaration about the
    catalog and never matched before. If this reddens, the fix widened the
    filter to any producer carrying a scope value at all."""
    _scoped(db, name="חלקית טבעוני", vegan_scope="some")
    assert "חלקית טבעוני" not in _names(client, {"vegan": "true"})


def test_scope_unknown_with_zero_products_still_excluded(client, db):
    """'unknown' is the column default, so every legacy producer carries it.
    A fix that matched it would put the entire table into ?vegan=true."""
    _scoped(db, name="לא נענתה", vegan_scope="unknown")
    assert "לא נענתה" not in _names(client, {"vegan": "true"})


def test_the_declaration_does_not_leak_into_the_facility_axes(client, db):
    """gluten_free / lactose_free are a FACILITY question (card §2, §6.3) with
    no scope column. A 100%-vegan declaration says nothing about either."""
    _scoped(db, name="טבעונית בלבד", vegan_scope="all")
    assert "טבעונית בלבד" not in _names(client, {"gluten_free": "true"})
    assert "טבעונית בלבד" not in _names(client, {"lactose_free": "true"})


def test_the_declaration_does_not_leak_into_the_other_catalog_axes(client, db):
    _scoped(db, name="רק טבעוני", vegan_scope="all")
    assert "רק טבעוני" not in _names(client, {"no_added_sugar": "true"})
    assert "רק טבעוני" not in _names(client, {"low_carb": "true"})


def test_each_scope_column_drives_only_its_own_axis(client, db):
    """vegetarian_scope='all' must not satisfy ?vegan=true. The reverse
    direction is a separate, open product question — see the test below."""
    _scoped(db, name="צמחוני בלבד", vegetarian_scope="all")
    assert "צמחוני בלבד" not in _names(client, {"vegan": "true"})


def test_vegan_scope_all_does_not_currently_satisfy_the_vegetarian_filter(client, db):
    """PINS THE SPEC AS WRITTEN, AND FLAGS IT AS A QUESTION.

    Logically a 100%-vegan business is 100% vegetarian, and this file's
    neighbour `test_vegan_product_implies_vegetarian` makes exactly that
    inference at the PRODUCT level (MEH-1438). The card's chunk-3 spec maps
    each axis to its own column and does not extend it to the business level,
    so that is what ships — deciding otherwise is a product call, not a code
    tidy-up, and rule 24 keeps it out of this chunk.

    This test exists so the asymmetry is a recorded decision rather than an
    oversight nobody notices. If Sapir rules the other way, this is the test
    to invert, and its failure will name the reason.
    """
    _scoped(db, name="טבעוני מלא", vegan_scope="all")
    assert "טבעוני מלא" not in _names(client, {"vegetarian": "true"})


# --------------------------------------------------------------------------
# The two halves must still partition the table.
# --------------------------------------------------------------------------
def test_false_half_excludes_the_declared_producer(client, db):
    """?vegan=false is the complement. A business that now matches `true`
    through its declaration must drop out of `false` in the same change —
    otherwise it is in both halves, which no filter should allow."""
    _scoped(db, name="טבעונית מוצהרת", vegan_scope="all")
    assert "טבעונית מוצהרת" in _names(client, {"vegan": "true"})
    assert "טבעונית מוצהרת" not in _names(client, {"vegan": "false"})


def test_false_half_still_includes_an_undeclared_producer(client, db):
    """The mirror: without the declaration the producer belongs to `false`.
    Without this, the assertion above is satisfied by a `false` half that
    returns nothing at all."""
    _scoped(db, name="ללא הצהרה", vegan_scope="unknown")
    assert "ללא הצהרה" in _names(client, {"vegan": "false"})


# --------------------------------------------------------------------------
# The counter reads a SECOND query object (`count_q`). Widening one and not the
# other is the silent half of this change: the list would show the business and
# the "X מתוך Y" counter would not count it.
# --------------------------------------------------------------------------
def test_the_count_endpoint_agrees_with_the_listing(client, db):
    _scoped(db, name="ספירה טבעונית", vegan_scope="all")
    listed = client.get("/producers", params={"vegan": "true"})
    counted = client.get("/producers/count", params={"vegan": "true"})
    assert listed.status_code == 200 and counted.status_code == 200
    assert counted.json()["count"] == len(listed.json())
    assert counted.json()["count"] >= 1
