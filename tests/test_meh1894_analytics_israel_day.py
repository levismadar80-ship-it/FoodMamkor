"""
MEH-1894 — the two 30-day analytics series bucket on the ISRAEL calendar day.

Remainder of MEH-1883 (#2588), which deliberately left these two sites alone
because the fix here is double: the window anchor (`date.today()` →
`israel_today()`) AND the day bucketing (`func.date()` over a naive-UTC column).

Both columns are naive UTC — `ProducerPageView.created_at` (models.py:1461) and
`User.last_active_at` (models.py:504) — so the bucket expression labels them UTC
and then converts to Asia/Jerusalem before `func.date()` cuts the day. Without
that, the day boundary sits at midnight UTC, which is 02:00 (IST) / 03:00 (IDT)
Israel time: a view at 00:30 Israel lands in *yesterday's* bucket.

The two boundary tests below are the discriminating pair. The 23:30 case alone
would pass against the old UTC bucketing too (23:30 Israel is still the same UTC
date in winter), so it is the control, not the evidence. The 00:30 case is the
one that separates the two implementations — under UTC bucketing it lands on the
previous date, under Israel bucketing on the new one.

Clock idiom: monkeypatch the router module's `israel_today`, matching
tests/test_availability_validation.py and tests/test_meh1881_open_now_filter.py.
"""

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.models.models import ProducerPageView
from app.routers import admin_extra, producer_me
from conftest import auth_header, make_producer, make_user

ISRAEL = ZoneInfo("Asia/Jerusalem")


def _utc_naive(israel_dt):
    """Israel-local aware datetime → the naive UTC value the columns store."""
    return israel_dt.astimezone(timezone.utc).replace(tzinfo=None)


def _seed_view_at(db, producer_id, israel_dt):
    row = ProducerPageView(
        producer_id=producer_id,
        viewer_ip_hash="b" * 64,
        created_at=_utc_naive(israel_dt),
    )
    db.add(row)
    db.commit()
    return row


def _series(body):
    return {e["date"]: e["count"] for e in body["views_by_day"]}


# A date well clear of a DST transition so the offset is unambiguous (IDT, +03).
ANCHOR = date(2026, 7, 15)


class TestProducerViewsByDayIsraelBoundary:
    def _setup(self, db, email):
        p = make_producer(db)
        user = make_user(db, email=email, role="producer")
        user.producer_id = p.id
        db.commit()
        return p, user

    def test_view_at_2330_israel_lands_on_that_israel_date(
        self, client, db, monkeypatch
    ):
        """Control: late-evening view stays on its own Israel date."""
        p, user = self._setup(db, "b1@test.com")
        monkeypatch.setattr(producer_me, "israel_today", lambda: ANCHOR)
        _seed_view_at(db, p.id, datetime(2026, 7, 14, 23, 30, tzinfo=ISRAEL))

        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        series = _series(body)
        assert series["2026-07-14"] == 1
        assert series.get("2026-07-15", 0) == 0

    def test_view_at_0030_israel_lands_on_the_NEW_israel_date(
        self, client, db, monkeypatch
    ):
        """THE discriminating case.

        00:30 Israel on 15/07 is 21:30 UTC on 14/07. Bucketing on the raw UTC
        column puts it on 2026-07-14; bucketing on the Israel calendar day puts
        it on 2026-07-15, which is where the viewer actually was.
        """
        p, user = self._setup(db, "b2@test.com")
        monkeypatch.setattr(producer_me, "israel_today", lambda: ANCHOR)
        israel_dt = datetime(2026, 7, 15, 0, 30, tzinfo=ISRAEL)
        # Guard the premise: this really is the previous UTC date.
        assert _utc_naive(israel_dt).date() == date(2026, 7, 14)
        _seed_view_at(db, p.id, israel_dt)

        series = _series(
            client.get("/producers/me/analytics", headers=auth_header(user)).json()
        )
        assert series["2026-07-15"] == 1, (
            "00:30 Israel must count as the NEW Israel day"
        )
        assert series.get("2026-07-14", 0) == 0, "and must NOT count as the UTC day"

    def test_oldest_bucket_keeps_its_first_hours(self, client, db, monkeypatch):
        """The cutoff moves with the buckets.

        The oldest Israel day in the window starts at 21:00 UTC the previous
        day. A cutoff left at naive UTC midnight would silently drop those
        first three hours — a bucket that exists but under-counts.
        """
        p, user = self._setup(db, "b3@test.com")
        monkeypatch.setattr(producer_me, "israel_today", lambda: ANCHOR)
        oldest = ANCHOR - timedelta(days=29)
        _seed_view_at(
            db,
            p.id,
            datetime(oldest.year, oldest.month, oldest.day, 0, 30, tzinfo=ISRAEL),
        )

        series = _series(
            client.get("/producers/me/analytics", headers=auth_header(user)).json()
        )
        assert series[oldest.isoformat()] == 1

    def test_series_still_has_exactly_30_israel_dates(self, client, db, monkeypatch):
        """Response shape is unchanged: 30 entries, keyed to the Israel window."""
        p, user = self._setup(db, "b4@test.com")
        monkeypatch.setattr(producer_me, "israel_today", lambda: ANCHOR)

        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        assert len(body["views_by_day"]) == 30
        assert body["views_by_day"][-1]["date"] == ANCHOR.isoformat()
        assert (
            body["views_by_day"][0]["date"] == (ANCHOR - timedelta(days=29)).isoformat()
        )


class TestAdminDauIsraelBoundary:
    def test_session_at_0030_israel_lands_on_the_NEW_israel_date(
        self, client, db, monkeypatch
    ):
        """Same discriminating case on the admin DAU series."""
        admin = make_user(db, email="adm1@test.com", role="admin")
        member = make_user(db, email="dau1@test.com", role="consumer")
        member.last_active_at = _utc_naive(datetime(2026, 7, 15, 0, 30, tzinfo=ISRAEL))
        db.commit()
        assert member.last_active_at.date() == date(2026, 7, 14)  # premise guard

        monkeypatch.setattr(admin_extra, "israel_today", lambda: ANCHOR)
        body = client.get("/admin/dashboard", headers=auth_header(admin)).json()
        series = {e["date"]: e["count"] for e in body["daily_active_users"]}
        assert series["2026-07-15"] >= 1
        assert series.get("2026-07-14", 0) == 0

    def test_dau_series_still_has_30_entries(self, client, db, monkeypatch):
        admin = make_user(db, email="adm2@test.com", role="admin")
        monkeypatch.setattr(admin_extra, "israel_today", lambda: ANCHOR)
        body = client.get("/admin/dashboard", headers=auth_header(admin)).json()
        assert len(body["daily_active_users"]) == 30
        assert body["daily_active_users"][-1]["date"] == ANCHOR.isoformat()
