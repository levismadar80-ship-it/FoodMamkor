"""MEH-1508 chunk 3ב (backend half) — the standalone 100% axes.

WHAT THIS ADDS THAT CHUNK 3א DID NOT
------------------------------------
Chunk 3א widened the EXPOSED axis: `?vegan=true` became
`EXISTS(products.is_vegan) OR vegan_scope='all'`. That closed a contradiction,
but it also means the exposed axis can no longer distinguish the two
populations the card exists to separate:

    a bakery with one vegan cookie      -> vegan_scope='some',    one is_vegan product
    a business that is entirely vegan   -> vegan_scope='all'

Both satisfy `?vegan=true`, and they should — «מתאים לטבעונים» is true of both.
What a consumer looking for «100% טבעוני» needs is an axis that selects ONLY the
second, and that is `?vegan_all=true`: the DECLARATION ALONE, no EXISTS.

So the discriminating case in this file is not "does the declaration match" —
chunk 3א already proves that — it is **the bakery must NOT come back**. A
`vegan_all` implemented by copying the widened `vegan` branch would pass every
headline assertion and fail exactly that one.

`false` IS THE COMPLEMENT OF 'all', WHICH INCLUDES 'unknown'
-----------------------------------------------------------
`unknown` is the column default, so `?vegan_all=false` means "has not declared
100%", NOT "declared it is not 100%". Those differ and only the first is
supportable — we have no signal for the second. Pinned below so the reading is
a recorded decision rather than an artifact.

NO 100% AXIS FOR THE FACILITY FIELDS
------------------------------------
`gluten_free` / `lactose_free` carry `*_facility`, not `*_scope`. The card
(§6.3, §2) rules cross-contamination a question about the PRODUCTION SITE and a
medical one, which "everything I sell is X" does not answer. There is therefore
no `gluten_free_all` to add here later by analogy, and the request must not
quietly succeed by being ignored.
"""

from __future__ import annotations

from app.models.models import Product
from tests.conftest import make_producer


def _scoped(db, *, name, vegan_scope="unknown", vegetarian_scope="unknown"):
    p = make_producer(db, name=name)
    p.vegan_scope = vegan_scope
    p.vegetarian_scope = vegetarian_scope
    db.commit()
    db.refresh(p)
    return p


def _add_product(db, producer, *, name="מוצר", **flags):
    db.add(Product(producer_id=producer.id, name=name, **flags))
    db.commit()


def _names(client, params):
    r = client.get("/producers", params=params)
    assert r.status_code == 200, r.text
    return {row["name"] for row in r.json()}


# ---------------------------------------------------------------------------
# CONTROL FIRST — an unfiltered listing must return the fixtures, or every
# "not in the results" assertion below is green because nothing is listed.
# ---------------------------------------------------------------------------
def test_control_the_fixtures_are_listable_at_all(client, db):
    _scoped(db, name="עסק טבעוני לגמרי", vegan_scope="all")
    bakery = _scoped(db, name="מאפייה עם עוגייה טבעונית", vegan_scope="some")
    _add_product(db, bakery, name="עוגייה", is_vegan=True)
    everything = _names(client, {})
    assert "עסק טבעוני לגמרי" in everything
    assert "מאפייה עם עוגייה טבעונית" in everything


# ---------------------------------------------------------------------------
# The axis itself.
# ---------------------------------------------------------------------------
# NOTE on the shape of these two. A bare `name in results` would pass in a world
# where the parameter does not exist AT ALL: FastAPI ignores an unknown query
# param, the listing comes back unfiltered, and the name is in it. So each
# asserts the exact SET against a fixture that also contains a non-qualifying
# row — that is what makes them evidence rather than decoration.
def test_vegan_all_selects_the_declaration_and_nothing_else(client, db):
    _scoped(db, name="עסק טבעוני לגמרי", vegan_scope="all")
    _scoped(db, name="חלקי", vegan_scope="some")
    assert _names(client, {"vegan_all": "true"}) == {"עסק טבעוני לגמרי"}


def test_vegetarian_all_selects_the_declaration_and_nothing_else(client, db):
    _scoped(db, name="עסק צמחוני לגמרי", vegetarian_scope="all")
    _scoped(db, name="חלקי", vegetarian_scope="some")
    assert _names(client, {"vegetarian_all": "true"}) == {"עסק צמחוני לגמרי"}


def test_the_bakery_with_one_vegan_product_is_NOT_100_percent(client, db):
    """THE discriminating case. This is what separates the new axis from the
    exposed one, and it is the assertion a `vegan_all` built by copying the
    widened `vegan` branch would fail while passing everything else."""
    bakery = _scoped(db, name="מאפייה עם עוגייה טבעונית", vegan_scope="some")
    _add_product(db, bakery, name="עוגייה", is_vegan=True)

    # It IS suitable-for-vegans …
    assert "מאפייה עם עוגייה טבעונית" in _names(client, {"vegan": "true"})
    # … and it is NOT 100%.
    assert "מאפייה עם עוגייה טבעונית" not in _names(client, {"vegan_all": "true"})


def test_products_alone_never_earn_the_100_percent_axis(client, db):
    """Same point without the `some` declaration: a catalog of vegan products
    is still not a business-level claim. The owner has to say it."""
    p = _scoped(db, name="הכל במקרה טבעוני", vegan_scope="unknown")
    _add_product(db, p, name="מוצר א", is_vegan=True)
    _add_product(db, p, name="מוצר ב", is_vegan=True)
    assert "הכל במקרה טבעוני" not in _names(client, {"vegan_all": "true"})


def test_some_and_unknown_are_excluded(client, db):
    _scoped(db, name="חלקי", vegan_scope="some")
    _scoped(db, name="לא נענה", vegan_scope="unknown")
    due = _names(client, {"vegan_all": "true"})
    assert "חלקי" not in due
    assert "לא נענה" not in due
    # Count, not membership: exactly nothing qualifies here, so a filter that
    # silently no-ops (returning the full listing) fails even though both
    # named assertions above would still hold on a per-name basis.
    assert due == set(), due


# ---------------------------------------------------------------------------
# The complement.
# ---------------------------------------------------------------------------
def test_false_is_everything_that_has_not_declared_100_percent(client, db):
    _scoped(db, name="עסק טבעוני לגמרי", vegan_scope="all")
    _scoped(db, name="חלקי", vegan_scope="some")
    _scoped(db, name="לא נענה", vegan_scope="unknown")

    not_all = _names(client, {"vegan_all": "false"})
    assert "עסק טבעוני לגמרי" not in not_all
    assert "חלקי" in not_all
    assert "לא נענה" in not_all, (
        "the default 'unknown' fell out of the complement — ?vegan_all=false "
        "would then mean 'declared not-100%', a claim no business has made"
    )


# ---------------------------------------------------------------------------
# The two axes are independent, and the facility fields have no 100% axis.
# ---------------------------------------------------------------------------
def test_the_two_axes_do_not_leak_into_each_other(client, db):
    _scoped(db, name="טבעוני בלבד", vegan_scope="all", vegetarian_scope="some")
    _scoped(db, name="צמחוני בלבד", vegan_scope="some", vegetarian_scope="all")

    assert _names(client, {"vegan_all": "true"}) == {"טבעוני בלבד"}
    assert _names(client, {"vegetarian_all": "true"}) == {"צמחוני בלבד"}


def test_there_is_no_gluten_free_all_axis(client, db):
    """The facility fields answer a different question (§6.3), so no analogous
    axis exists. FastAPI ignores an unknown query param, so the request must
    come back as an UNFILTERED listing — the failure this pins is someone
    adding `gluten_free_all` by symmetry without the card's ruling."""
    p = make_producer(db, name="מתקן ייעודי")
    p.gluten_free_facility = "dedicated"
    other = make_producer(db, name="מתקן משותף")
    other.gluten_free_facility = "shared"
    db.commit()

    both = _names(client, {"gluten_free_all": "true"})
    assert both == {"מתקן ייעודי", "מתקן משותף"}, (
        "an unknown param filtered something — a gluten_free_all axis exists, "
        "and §6.3 says it must not"
    )
