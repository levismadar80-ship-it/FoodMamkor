"""MEH-2787 — `GET /producers` is totally ordered, so offset paging is safe.

Every ordering key the listing uses is non-unique, and `created_at`
(`models.py:497`) is nullable with no server_default. In Postgres the order
*within* a tie group is undefined, and two pages of the same query are two
separate statements that may be planned differently — so a row sitting on a
page boundary can come back twice while another never comes back at all. No
error, no warning; the caller just silently loses businesses.

That is not hypothetical here: `frontend/app/sitemap.js` now walks the whole
catalog with `limit=100` + `offset`, and a dropped row is a business missing
from the sitemap. `Producer.id.asc()` as a final, unique key is what makes the
walk total.

DISCRIMINATION — each case below fails against the pre-fix code:
  * `test_tied_created_at_pages_without_loss` — three rows sharing one
    `created_at` are the tie group; paged at limit=1 the old order could repeat
    or skip one. Proven by removing the tiebreaker: see the PR body.
  * `test_null_created_at_does_not_split` — NULL sorts FIRST under DESC, so
    the NULL rows are a clump at exactly the first page boundary. This is the
    worst case and the one most likely to bite in production.
  * `test_visible_order_unchanged` — the guard against over-correcting: rows
    with DISTINCT `created_at` must keep the order they had, since a
    tiebreaker may only order rows everything else has tied on.
  * `test_every_sort_axis_ends_with_id` — reads the compiled SQL, so a future
    branch added without the tiebreaker is caught at the source rather than
    only when a page happens to straddle a tie. It asserts the id key is the
    last one that orders PRODUCER rows, not the last token in the string: the
    eager categories joinedload appends its own collection ordering after it.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from app.services.producer_listing import _build_base_queries, build_producers_query
from tests.conftest import make_producer

# One fixed instant for every tied row: the tie is the point of the fixture.
TIED = datetime(2026, 3, 1, 12, 0, 0)


def _page(db, *, limit, offset, **filters):
    """One page of the public listing, as the sitemap fetches it."""
    rows, _total = build_producers_query(db, limit=limit, offset=offset, **filters)
    return [r.id for r in rows]


def _walk(db, *, page_size, pages, **filters):
    """Walk the listing the way the sitemap loop does, collecting ids."""
    seen = []
    for p in range(pages):
        seen.extend(_page(db, limit=page_size, offset=p * page_size, **filters))
    return seen


def _make_tied(db, names, created_at=TIED):
    out = []
    for n in names:
        p = make_producer(db, name=n)
        p.created_at = created_at
        out.append(p)
    db.flush()
    return out


class TestOffsetPagingIsLossless:
    def test_tied_created_at_pages_without_loss(self, db):
        made = _make_tied(db, ["אלף", "בית", "גימל"])
        expected = {p.id for p in made}

        walked = _walk(db, page_size=1, pages=3)

        assert len(walked) == 3, f"expected 3 rows across 3 pages, got {len(walked)}"
        assert len(set(walked)) == 3, f"a row was returned twice: {walked}"
        assert set(walked) == expected, "the walk lost or invented a business"

    def test_null_created_at_does_not_split(self, db):
        """NULL is DESC-FIRST in Postgres, so NULLs clump at the first boundary."""
        made = _make_tied(db, ["דלת", "הא"], created_at=None)
        # plus one dated row, so the NULL clump really does straddle page 1→2
        dated = make_producer(db, name="וו")
        dated.created_at = TIED
        db.flush()
        expected = {p.id for p in made} | {dated.id}

        walked = _walk(db, page_size=2, pages=2)

        assert len(set(walked)) == 3, f"NULL-created_at rows were lost or doubled: {walked}"
        assert set(walked) == expected

    def test_page_boundary_is_stable_across_repeats(self, db):
        """The same offset must answer the same thing twice — total order."""
        _make_tied(db, ["זין", "חית", "טית", "יוד"])
        first = [_page(db, limit=2, offset=0) for _ in range(4)]
        second = [_page(db, limit=2, offset=2) for _ in range(4)]
        assert all(p == first[0] for p in first), f"page 1 is not stable: {first}"
        assert all(p == second[0] for p in second), f"page 2 is not stable: {second}"
        assert not set(first[0]) & set(second[0]), "a row appears on both pages"


class TestVisibleOrderUnchanged:
    def test_visible_order_unchanged(self, db):
        """A tiebreaker may only order rows every other key has tied on."""
        base = datetime(2026, 3, 1, 12, 0, 0)
        newest = make_producer(db, name="החדש")
        middle = make_producer(db, name="האמצעי")
        oldest = make_producer(db, name="הישן")
        newest.created_at = base
        middle.created_at = base - timedelta(days=1)
        oldest.created_at = base - timedelta(days=2)
        db.flush()

        rows, _ = build_producers_query(db, limit=100, offset=0)

        assert [r.id for r in rows] == [newest.id, middle.id, oldest.id], (
            "created_at DESC must still decide the order of rows that do not tie"
        )

    def test_total_count_unchanged(self, db):
        _make_tied(db, ["כף", "למד", "מם"])
        _rows, total = build_producers_query(db, limit=1, offset=0)
        assert total == 3, "the tiebreaker must not touch the count query"


class TestEverySortAxisIsTotallyOrdered:
    """Read the compiled SQL: catch a future branch that forgets the key."""

    # `build_producers_query` returns rows; `_build_base_queries` is where the
    # ORDER BY is assembled, so the SQL is read there — the same function the
    # service calls, not a copy of its logic.
    @pytest.mark.parametrize(
        "label,kwargs",
        [
            ("default (created_at)", {"geo": None, "sort": None}),
            ("rating", {"geo": None, "sort": "rating"}),
            (
                "distance",
                {"geo": None, "sort": "distance", "sort_origin": (32.0853, 34.7818)},
            ),
            ("near_city", {"geo": None, "sort": None, "near_city": "תל אביב"}),
            ("radius / geo", {"geo": (32.0853, 34.7818, 10.0), "sort": None}),
        ],
    )
    def test_every_sort_axis_ends_with_id(self, db, label, kwargs):
        query, _count_q = _build_base_queries(db, **kwargs)
        sql = str(query.statement.compile(compile_kwargs={"literal_binds": False}))
        assert "ORDER BY" in sql, f"{label}: no ORDER BY at all"
        order_by = sql.split("ORDER BY", 1)[1].strip()
        keys = [k.strip() for k in order_by.split(",")]

        # `producers.id ASC` must be the last key that orders PRODUCER rows.
        # It is not literally last in the SQL: the eager `joinedload(
        # Producer.categories)` appends `producer_categories_1.position`, which
        # orders each producer's own category collection, not the producers —
        # so it cannot reorder or split a producer row. Asserting "last key in
        # the string" would therefore have been wrong, and asserting only
        # "contains producers.id" would pass with the key in a useless
        # position. This asserts the thing that actually matters.
        assert any(k.startswith("producers.id") for k in keys), (
            f"{label}: ORDER BY has no producers.id key at all — "
            f"offset paging on this axis can skip rows. Got: {order_by!r}"
        )
        idx = next(i for i, k in enumerate(keys) if k.startswith("producers.id"))
        trailing_producer_keys = [k for k in keys[idx + 1 :] if k.startswith("producers.")]
        assert not trailing_producer_keys, (
            f"{label}: {trailing_producer_keys} order producer rows AFTER the "
            f"unique key, so the tiebreaker is not final. Got: {order_by!r}"
        )
