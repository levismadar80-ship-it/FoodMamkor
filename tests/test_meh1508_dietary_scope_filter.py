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


def test_vegan_scope_all_matches_even_when_products_are_marked_is_vegan_false(client, db):
    """The declaration is about the BUSINESS, so a catalog whose products carry
    `is_vegan=False` does not contradict it. Distinct from the zero-product case
    above: here the EXISTS subquery has rows to look at and still returns false.

    MEH-1508: this was named "...products_are_untagged", which implies `NULL`.
    The fixture sets an explicit `False`, and the two are not the same case — a
    reader checking NULL handling would have read this as covering it. The name
    now states the input, per the rule that a case is named after what it covers
    rather than the class it belongs to. NULL `is_vegan` is NOT exercised here
    by anyone."""
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


def test_vegetarian_false_half_excludes_the_declared_producer(client, db):
    """CI reviewer, #3191. The vegetarian widening lives in its OWN branch (a
    two-column OR, not the dispatch loop), so the vegan axis's partition tests
    say nothing about it — dropping `Producer.vegetarian_scope == "all"` from
    `veg_cond` would leave every `true`-side assertion above still green while
    silently putting the declared business into BOTH halves.

    This is the discriminating one of the pair: without the widening,
    `~veg_cond` matches a zero-product producer, so it lands in `false` — and
    this assertion reddens."""
    _scoped(db, name="צמחונית מוצהרת", vegetarian_scope="all")
    assert "צמחונית מוצהרת" in _names(client, {"vegetarian": "true"})
    assert "צמחונית מוצהרת" not in _names(client, {"vegetarian": "false"})


def test_vegetarian_false_half_still_includes_an_undeclared_producer(client, db):
    """Its mirror — otherwise the assertion above is satisfied by a `false`
    half that returns nothing at all."""
    _scoped(db, name="ללא הצהרה צמחונית", vegetarian_scope="unknown")
    assert "ללא הצהרה צמחונית" in _names(client, {"vegetarian": "false"})


def test_false_half_still_includes_an_undeclared_producer(client, db):
    """The mirror: without the declaration the producer belongs to `false`.
    Without this, the assertion above is satisfied by a `false` half that
    returns nothing at all."""
    _scoped(db, name="ללא הצהרה", vegan_scope="unknown")
    assert "ללא הצהרה" in _names(client, {"vegan": "false"})


# --------------------------------------------------------------------------
# The counter reads a SECOND query object (`count_q`). Widening one and not the
# other is the silent half of this change: the listing would show the business
# and the "X מתוך Y" counter would not count it.
#
# THE CONSUMER IS THE `X-Total-Count` HEADER, NOT `/producers/count`.
# That distinction is the whole reason these tests work. `/producers/count`
# (producers.py:253) takes NO filter parameters — it is an unfiltered total of
# approved, available producers — so `client.get("/producers/count",
# params={"vegan": "true"})` silently ignores the param and answers a different
# question. An earlier version of this file compared THAT against the filtered
# listing and passed, because a single-producer fixture makes the two numbers
# coincide. It was green while proving nothing, and a probe that broke `count_q`
# on purpose did not move it. `count_q` reaches the caller through
# `producers.py:245` and nowhere else.
# --------------------------------------------------------------------------
def _assert_counter_matches_listing(client, params):
    r = client.get("/producers", params=params)
    assert r.status_code == 200, r.text
    rows = len(r.json())
    header = r.headers.get("X-Total-Count")
    assert header is not None, f"no X-Total-Count on {params} — count_q never reached the caller"
    assert int(header) == rows, (
        f"count_q and q disagree for {params}: header {header} vs {rows} rows"
    )
    # >= 1, so the equality cannot be satisfied by 0 == 0 — which is exactly
    # what a filter matching nothing would produce.
    assert rows >= 1, f"nothing matched {params} — 0 == 0 proves nothing"


def test_the_counter_agrees_with_the_listing_on_the_vegan_axis(client, db):
    _scoped(db, name="ספירה טבעונית", vegan_scope="all")
    _assert_counter_matches_listing(client, {"vegan": "true"})


def test_the_counter_agrees_with_the_listing_on_the_vegetarian_axis(client, db):
    """CI reviewer, #3191 (Minor). The vegan case exercises the dispatch loop;
    the vegetarian widening is a separate branch, so it needs its own counter
    assertion. A claim about `count_q` that covered one of the two sites it
    applies to is the artifact-asserting-coverage shape, one level down."""
    _scoped(db, name="ספירה צמחונית", vegetarian_scope="all")
    _assert_counter_matches_listing(client, {"vegetarian": "true"})
