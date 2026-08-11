"""
MEH-1483 — GET /producers ?sort= axis.

Locks the backend contract the new /producers sort select drives:

  * ?sort=rating  → avg_rating DESC, NULLs LAST, tiebreak reviews_count DESC,
                    then created_at DESC.
  * no sort / ?sort=newest → created_at DESC (default, unchanged).
  * an unknown ?sort value → 422 (the router's manual-422 pattern), never a
    silent fallback.

Note on NULLs: `Producer.avg_rating` defaults to 0 and `ProducerListOut`
serializes it as a required float, so a NULL rating can never round-trip
through the API — an "unrated" producer has rating 0, which the DESC order
already puts last. The explicit NULLs-last order key is therefore defensive;
it is exercised directly at the service layer (`TestNullsLastAtServiceLayer`)
where the raw ORM rows bypass response serialization.

Only the non-geo listing path is exercised — geo results always order by
distance and ignore the sort axis (producer_listing.py:_build_base_queries).
"""

from __future__ import annotations

from datetime import datetime, timedelta

from app.services.producer_listing import build_producers_query
from tests.conftest import make_producer

BASE = datetime(2026, 1, 1, 12, 0, 0)


def _set(db, producer, *, avg_rating, reviews_count, created_at):
    producer.avg_rating = avg_rating
    producer.reviews_count = reviews_count
    producer.created_at = created_at
    db.commit()
    db.refresh(producer)


def _names(resp):
    return [row["name"] for row in resp.json()]


class TestSortRating:
    def test_rating_desc_unrated_last(self, client, db):
        top = make_producer(db, name="Top")
        mid = make_producer(db, name="Mid")
        unrated = make_producer(db, name="Unrated")
        _set(db, top, avg_rating=5.0, reviews_count=1, created_at=BASE)
        _set(db, mid, avg_rating=4.5, reviews_count=100, created_at=BASE)
        # rating 0 is the real "unrated" state (column default) — sorts LAST
        # under DESC despite the highest review count.
        _set(db, unrated, avg_rating=0.0, reviews_count=999, created_at=BASE)

        resp = client.get("/producers", params={"sort": "rating"})
        assert resp.status_code == 200
        assert _names(resp) == ["Top", "Mid", "Unrated"]

    def test_tiebreak_reviews_then_created_at(self, client, db):
        # All three share avg_rating 4.0 → the tiebreaks decide the order:
        # reviews_count DESC first, then created_at DESC.
        many = make_producer(db, name="ManyReviews")
        new = make_producer(db, name="FewNew")
        old = make_producer(db, name="FewOld")
        _set(
            db,
            many,
            avg_rating=4.0,
            reviews_count=50,
            created_at=BASE - timedelta(days=5),
        )
        _set(db, new, avg_rating=4.0, reviews_count=5, created_at=BASE)
        _set(
            db,
            old,
            avg_rating=4.0,
            reviews_count=5,
            created_at=BASE - timedelta(days=10),
        )

        resp = client.get("/producers", params={"sort": "rating"})
        assert resp.status_code == 200
        # ManyReviews (reviews 50) first; then the reviews=5 pair broken by
        # created_at DESC → FewNew before FewOld.
        assert _names(resp) == ["ManyReviews", "FewNew", "FewOld"]


class TestNullsLastAtServiceLayer:
    def test_null_rating_sorts_after_zero_and_positive(self, db):
        rated = make_producer(db, name="Rated")
        zero = make_producer(db, name="Zero")
        nullish = make_producer(db, name="Null")
        _set(db, rated, avg_rating=4.0, reviews_count=10, created_at=BASE)
        _set(db, zero, avg_rating=0.0, reviews_count=10, created_at=BASE)
        # A raw NULL rating — only reachable via a direct DB write, never the API.
        _set(db, nullish, avg_rating=None, reviews_count=10, created_at=BASE)

        results, _ = build_producers_query(db, sort="rating")
        names = [p.name for p in results]
        # 4.0 first, then 0.0, then NULL LAST (the defensive `is_(None)` key).
        assert names == ["Rated", "Zero", "Null"]


class TestSortDefault:
    def test_default_and_newest_are_created_at_desc(self, client, db):
        first = make_producer(db, name="First")
        second = make_producer(db, name="Second")
        third = make_producer(db, name="Third")
        # Deliberately give the OLDEST row the highest rating so a default sort
        # can't accidentally look rating-ordered.
        _set(
            db,
            first,
            avg_rating=5.0,
            reviews_count=9,
            created_at=BASE - timedelta(days=2),
        )
        _set(
            db,
            second,
            avg_rating=1.0,
            reviews_count=1,
            created_at=BASE - timedelta(days=1),
        )
        _set(db, third, avg_rating=1.0, reviews_count=1, created_at=BASE)

        default = client.get("/producers")
        newest = client.get("/producers", params={"sort": "newest"})
        assert default.status_code == 200
        assert newest.status_code == 200
        # created_at DESC → Third (newest), Second, First (oldest).
        assert _names(default) == ["Third", "Second", "First"]
        assert _names(newest) == _names(default)


class TestSortValidation:
    def test_unknown_sort_value_is_422(self, client, db):
        make_producer(db, name="Whatever")
        resp = client.get("/producers", params={"sort": "bogus"})
        assert resp.status_code == 422
