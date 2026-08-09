"""
MEH-160 — profile views dedupe per window on `viewer_ip_hash`.

The column has existed since the table did, and `models.py`'s own docstring
says it is there so we can "dedupe uniques inside a window". Nothing ever read
it: `git grep viewer_ip_hash backend/app` returned exactly three hits — the
docstring, the column definition and the single write in `analytics.py`. So one
visitor refreshing N times counted as N profile views, which is the inflation
the ticket describes, and it needed no spoofed user-agent at all.

WHY THESE PARTICULAR CASES
--------------------------
The naive fix — `COUNT(DISTINCT viewer_ip_hash)` — trades over-counting for
UNDER-counting, because SQL's COUNT(DISTINCT col) silently drops NULL rows and
`viewer_ip_hash` is nullable. `test_null_hashes_each_count_once` is the case
that separates the shipped implementation from that naive one: under a bare
COUNT(DISTINCT) it returns 0 and fails. It is the discriminating test, not the
happy path.

`test_repeat_views_from_one_ip_count_once` fails against the PREVIOUS
implementation (plain `func.count(id)` → 3), so the pair covers both directions:
the old code fails the dedupe test, a naive dedupe fails the NULL test, and only
the shipped form passes both.
"""

from datetime import datetime, timedelta

from app.models.models import ProducerPageView
from conftest import auth_header, make_producer, make_user


def _seed(db, producer_id, ip_hash, *, days_ago=0, referrer=None):
    db.add(
        ProducerPageView(
            producer_id=producer_id,
            viewer_ip_hash=ip_hash,
            referrer=referrer,
            created_at=datetime.utcnow() - timedelta(days=days_ago),
        )
    )
    db.commit()


def _setup(db, email):
    p = make_producer(db)
    user = make_user(db, email=email, role="producer")
    user.producer_id = p.id
    db.commit()
    return p, user


class TestProfileViewDedupe:
    def test_repeat_views_from_one_ip_count_once(self, client, db):
        """Three hits, one visitor → one view.

        Fails against the pre-MEH-160 code, which returned 3.
        """
        p, user = _setup(db, "dedupe1@test.com")
        for _ in range(3):
            _seed(db, p.id, "a" * 64)

        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        assert body["profile_views"]["last_7d"] == 1
        assert body["profile_views"]["total"] == 1

    def test_distinct_ips_still_count_separately(self, client, db):
        """Dedupe must not collapse genuinely different visitors."""
        p, user = _setup(db, "dedupe2@test.com")
        _seed(db, p.id, "a" * 64)
        _seed(db, p.id, "b" * 64)
        _seed(db, p.id, "c" * 64)

        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        assert body["profile_views"]["last_7d"] == 3

    def test_null_hashes_each_count_once(self, client, db):
        """THE discriminating case for the NULL handling.

        A row with no hash cannot be deduped against anything, so it counts
        individually. A bare COUNT(DISTINCT viewer_ip_hash) drops these rows
        entirely and returns 0 here.
        """
        p, user = _setup(db, "dedupe3@test.com")
        _seed(db, p.id, None)
        _seed(db, p.id, None)

        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        assert body["profile_views"]["last_7d"] == 2

    def test_mixed_null_and_repeat_hashes(self, client, db):
        """The combination: 4 rows → 1 (repeated hash) + 2 (un-attributable)."""
        p, user = _setup(db, "dedupe4@test.com")
        _seed(db, p.id, "a" * 64)
        _seed(db, p.id, "a" * 64)
        _seed(db, p.id, None)
        _seed(db, p.id, None)

        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        assert body["profile_views"]["last_7d"] == 3

    def test_windows_dedupe_independently(self, client, db):
        """Each window dedupes on its own rows.

        The same visitor 20 days ago and today is one unique in `last_30d` and
        one in `last_7d` — not one across both. This is what "unique inside a
        window" means, and it is why the counters are not simply nested sums.
        """
        p, user = _setup(db, "dedupe5@test.com")
        _seed(db, p.id, "a" * 64, days_ago=0)
        _seed(db, p.id, "a" * 64, days_ago=20)

        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        assert body["profile_views"]["last_7d"] == 1
        assert body["profile_views"]["last_30d"] == 1
        assert body["profile_views"]["total"] == 1

    def test_search_appearances_dedupe_too(self, client, db):
        """Same table, same inflation — the referrer filter does not exempt it."""
        p, user = _setup(db, "dedupe6@test.com")
        for _ in range(3):
            _seed(db, p.id, "a" * 64, referrer="search")

        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        assert body["search_appearances"]["last_7d"] == 1

    def test_views_by_day_dedupes_per_day(self, client, db):
        """The chart must agree with the headline number.

        Three hits from one visitor today is one point on the series, not three
        — otherwise the chart and `profile_views` tell the owner two different
        stories about the same day.
        """
        p, user = _setup(db, "dedupe7@test.com")
        for _ in range(3):
            _seed(db, p.id, "a" * 64)

        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        assert sum(e["count"] for e in body["views_by_day"]) == 1
