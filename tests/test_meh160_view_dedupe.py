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

THE GRAIN (ruling 09/08): dedupe is per (israel-day, hash) — a visitor counts
once per 24h calendar day, so the windowed counters equal the sum of their
days' uniques and always agree with the views_by_day chart.
`test_dedupe_grain_is_the_24h_day_not_the_window` separates this from
whole-window dedupe, which an earlier draft of this change shipped.
"""

from datetime import datetime, timedelta

from app.models.models import Producer, ProducerPageView, ProducerWhatsAppClick
from app.services.analytics import israel_day_of, unique_views_count
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

    def test_dedupe_grain_is_the_24h_day_not_the_window(self, client, db):
        """THE discriminating case for the ruled 24h grain (Sapir 09/08).

        The same visitor on three different days inside the 7d window counts
        THREE times — once per day. Under whole-window dedupe (the previous
        draft of this change) this returns 1, so this test separates the two
        dedupe semantics, not just deduped-vs-raw.
        """
        p, user = _setup(db, "dedupe5@test.com")
        _seed(db, p.id, "a" * 64, days_ago=0)
        _seed(db, p.id, "a" * 64, days_ago=2)
        _seed(db, p.id, "a" * 64, days_ago=4)

        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        assert body["profile_views"]["last_7d"] == 3

    def test_windows_count_daily_uniques(self, client, db):
        """A returning visitor is one count per day they visited, per window."""
        p, user = _setup(db, "dedupe5b@test.com")
        _seed(db, p.id, "a" * 64, days_ago=0)
        _seed(db, p.id, "a" * 64, days_ago=20)

        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        assert body["profile_views"]["last_7d"] == 1
        assert body["profile_views"]["last_30d"] == 2
        assert body["profile_views"]["total"] == 2

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


class TestTheOtherThreeReaders:
    """MEH-160 round 2 — the three readers the first round left raw.

    `producer_page_views` feeds SIX metrics on one dashboard screen. Round one
    deduped `profile_views`, `search_appearances` and `views_by_day` and left
    `top_cities`, `rank_in_city` and `weekly_trend`'s comparison arm counting
    rows — a screen showing visitors in one number and refreshes in the next.

    WHICH RIVAL EACH TEST SEPARATES — measured, not assumed. This docstring
    first claimed "every one of these fails against round 1", and running the
    construction disproved it for two of the four. They are kept, re-aimed and
    labelled, because a test that cannot fail against the thing you changed is
    not evidence for the change (ORDERS §3 item 6):

    | Test | Separates the shipped code from |
    |---|---|
    | `top_cities_counts_visitors_not_refreshes` | round 1 — returns 3, fails |
    | `weekly_trend_is_stable_on_flat_repeat_traffic` | round 1 — reads "down", fails |
    | `unique_views_count_scores_a_viewless_producer_zero` | round 2 written WITHOUT `row_id_col` — returns 1, fails |
    | `conversion_rate_denominator_is_the_deduped_view_count` | the rejected option B (raw denominator) — returns 50.0, fails |
    | `rank_in_city_still_ranks_on_real_views` | nothing — a refactor anchor, and says so |
    """

    def test_top_cities_counts_visitors_not_refreshes(self, client, db):
        """One visitor refreshing 3× from Tel Aviv is ONE Tel Aviv viewer.

        Fails at 3 against `func.count(id)`. The second city is the control:
        two DIFFERENT visitors must still count 2, so this cannot be passed by
        an implementation that simply collapses every group to 1.
        """
        p, user = _setup(db, "readers1@test.com")
        for _ in range(3):
            db.add(
                ProducerPageView(
                    producer_id=p.id, viewer_ip_hash="a" * 64, city="תל אביב"
                )
            )
        for i in range(2):
            db.add(
                ProducerPageView(
                    producer_id=p.id, viewer_ip_hash=f"{i:064d}", city="חיפה"
                )
            )
        db.commit()

        cities = {
            row["city"]: row["count"]
            for row in client.get(
                "/producers/me/analytics", headers=auth_header(user)
            ).json()["top_cities"]
        }
        assert cities["תל אביב"] == 1
        assert cities["חיפה"] == 2

    def test_unique_views_count_scores_a_viewless_producer_zero(self, db):
        """The LEFT JOIN trap, asserted where it is observable.

        A producer with no views at all still yields one all-NULL row under an
        outer join. An ungated `hash IS NULL` arm counts that phantom as a
        view and the view-less producer scores 1.

        DISCRIMINATION — this test does NOT separate round 1 from round 2.
        `func.count(id)` gets this right too. It separates the shipped
        `unique_views_count` from the OBVIOUS way to write round 2: reusing
        the windowed dedupe expression as-is, without `row_id_col`. Measured
        against that rival, this returns 1 and fails.

        It is asserted against the expression rather than through
        `rank_in_city` on purpose: with the ungated arm the phantom scores 1
        and TIES our single-view producer, and a tie in `ORDER BY … DESC` has
        no defined winner — the endpoint-level assertion would have been a
        coin flip dressed as a guard.
        """
        rival = make_producer(db)
        expr = unique_views_count(day_col=israel_day_of(ProducerPageView.created_at))
        score = (
            db.query(expr)
            .select_from(Producer)
            .outerjoin(
                ProducerPageView, ProducerPageView.producer_id == Producer.id
            )
            .filter(Producer.id == rival.id)
            .scalar()
        )
        assert score == 0

    def test_rank_in_city_still_ranks_on_real_views(self, client, db):
        """Regression anchor for the endpoint after the extraction to
        `_rank_in_city`. Passes in round 1 too — it is here to catch the
        refactor breaking the query, not to prove the dedupe."""
        p, user = _setup(db, "readers2@test.com")
        p.city = "חיפה"
        p.status = "approved"
        rival = make_producer(db)
        rival.city = "חיפה"
        rival.status = "approved"
        db.commit()
        _seed(db, p.id, "b" * 64)

        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        assert body["rank_in_city"] == 1

    def test_weekly_trend_is_stable_on_flat_repeat_traffic(self, client, db):
        """The permanent regression round one shipped.

        Identical traffic in both weeks — one visitor, three hits, on one day
        each side. Comparing a deduped `last_7d` (1) against a raw
        `prev_7d_views` (3) reads "down" forever, on every producer with any
        repeat visitor. It is not a rounding wobble: only one side of the
        subtraction is deflated.
        """
        p, user = _setup(db, "readers3@test.com")
        for _ in range(3):
            _seed(db, p.id, "c" * 64, days_ago=2)
        for _ in range(3):
            _seed(db, p.id, "d" * 64, days_ago=9)

        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        assert body["profile_views"]["last_7d"] == 1
        assert body["weekly_trend"] == "stable"

    def test_conversion_rate_denominator_is_the_deduped_view_count(self, client, db):
        """Pins the contract decision so it cannot drift back silently.

        `producer_whatsapp_clicks` has no viewer hash, so the numerator stays
        raw and the ratio can legitimately exceed 100: here one visitor, one
        counted view, two clicks → 200.0. The API returns the honest number;
        the clamp that used to hide it in the UI is gone, and the copy says
        "per 100 distinct visitors" rather than "% of viewers".
        """
        p, user = _setup(db, "readers4@test.com")
        for _ in range(4):
            _seed(db, p.id, "e" * 64)
        for _ in range(2):
            db.add(ProducerWhatsAppClick(producer_id=p.id))
        db.commit()

        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        assert body["profile_views"]["last_30d"] == 1
        assert body["whatsapp_clicks"]["last_30d"] == 2
        assert body["conversion_rate"] == 200.0
