"""
MEH-1465 Chunk A — category filter accepts MULTIPLE ids (OR semantics).

The public ``GET /producers?category=`` filter changed from a single int to
a repeatable list. Two behaviours are asserted:

  1. Multiple ``?category=X&category=Y`` returns the UNION of both categories
     (OR), not the intersection.
  2. A producer linked to two of the selected categories appears EXACTLY ONCE
     — the JOIN→EXISTS switch (``producer_listing.py``) prevents the row
     multiplication a plain ``JOIN ... IN (...)`` would cause.

Backward compatibility (a single ``?category=X`` behaving exactly as before)
is still covered by ``TestListProducers.test_filter_by_category`` in
``test_api.py`` — a single value parses to ``[X]`` at the FastAPI layer.

Why this ticket exists: the aggregate /map chips ("בשר ודגים" etc.) map to
several DB category rows, but the frontend only ever sent the FIRST matched
id (``resolveCategoryId``), so a meat producer filed under "דגים" was invisible
under the "בשר ודגים" chip. The full fix needs the backend to accept the whole
id list; this module locks that backend contract.
"""

from __future__ import annotations

from app.models.models import ProducerCategory
from tests.conftest import make_category, make_producer


def _link(db, producer, category, position=0):
    """Attach an extra category to an already-created producer."""
    db.add(
        ProducerCategory(
            producer_id=producer.id, category_id=category.id, position=position
        )
    )
    db.commit()


class TestCategoryOrFilter:
    def test_multiple_categories_returns_union(self, client, db):
        veg = make_category(db, name="ירקות")
        meat = make_category(db, name="בשר")
        dairy = make_category(db, name="חלב")
        make_producer(db, name="Veg", category=veg)
        make_producer(db, name="Meat", category=meat)
        make_producer(db, name="Dairy", category=dairy)

        resp = client.get("/producers", params={"category": [veg.id, meat.id]})
        assert resp.status_code == 200
        names = sorted(p["name"] for p in resp.json())
        # OR — both selected categories, NOT the third.
        assert names == ["Meat", "Veg"]

    def test_producer_in_two_selected_categories_appears_once(self, client, db):
        """Row-multiplication guard — the crux of the JOIN→EXISTS switch."""
        veg = make_category(db, name="ירקות")
        meat = make_category(db, name="בשר")
        # One producer filed under BOTH selected categories.
        both = make_producer(db, name="Both", category=veg)
        _link(db, both, meat, position=1)

        resp = client.get("/producers", params={"category": [veg.id, meat.id]})
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        # Exactly once — a plain JOIN would emit "Both" twice.
        assert names == ["Both"]

        # X-Total-Count must agree with the deduped page (count_q stays distinct).
        assert resp.headers["x-total-count"] == "1"

    def test_single_category_still_filters(self, client, db):
        """Backward compat — a lone ?category=X is the [X] list case."""
        veg = make_category(db, name="ירקות")
        meat = make_category(db, name="בשר")
        make_producer(db, name="Veg", category=veg)
        make_producer(db, name="Meat", category=meat)

        resp = client.get("/producers", params={"category": veg.id})
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert names == ["Veg"]
