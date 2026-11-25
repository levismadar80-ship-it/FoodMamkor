"""
MEH-3194 point 2: the one monthly owner email (page_freshness, from the 1st)
opens with LAST Israel calendar month — bookings through the site and their
value first, then views and clicks. A zero row is left out; a month of zeros
has no block and keeps the «הכול עדיין נכון?» subject.

Every send passes NOW (tests/test_page_freshness.py: the real clock moved off
Friday/Saturday); seeds sit 5 days inside last month or outside it, built from
its Israel-clock start (.claude/rules/testing.md).
"""

from __future__ import annotations

import itertools
from datetime import timedelta, timezone
from uuid import uuid4

import pytest
from test_page_freshness import NOW, _business, _naive

from app.models import (
    BillableEvent,
    ContactClick,
    ProducerPageView,
    ProducerWhatsAppClick,
)
from app.services import freshness_month_numbers as fmn
from app.services import page_freshness as pf
from app.services.billing_summary import Month
from app.services.producer_insights import metric_count, metric_count_between

_seq = itertools.count()
LAST = fmn.israel_month(NOW).previous()
IN_LAST = LAST.start() + timedelta(days=5)
BEFORE_LAST = LAST.start() - timedelta(days=5)
ZERO = {
    "bookings": 0,
    "value_agorot": 0,
    "profile_views": 0,
    "whatsapp_clicks": 0,
    "contact_clicks": 0,
}


def _booking(db, producer, *, base, at=IN_LAST, **overrides):
    values = {
        "kind": "event_registration",
        "quantity": 1,
        "status": "counted",
    } | overrides
    db.add(
        BillableEvent(
            producer_id=producer.id,
            source_id=uuid4(),
            price_list_version=1,
            base_amount_agorot=base,
            fee_agorot=0,
            occurred_at=at,
            **values,
        )
    )
    db.commit()


def _views(db, producer, n, at=IN_LAST):
    for _ in range(n):
        db.add(
            ProducerPageView(
                producer_id=producer.id,
                viewer_ip_hash=f"{next(_seq):064d}",
                created_at=_naive(at),
            )
        )
    db.commit()


@pytest.fixture
def sent(monkeypatch):
    calls = []
    monkeypatch.setattr(
        pf,
        "send_email",
        lambda to, subject, body, **kw: calls.append(
            {"subject": subject, "body": body}
        ),
    )
    monkeypatch.setattr(pf, "freshness_enabled", lambda: True)
    return calls


class TestNumbers:
    def test_counts_last_month_only_and_counted_rows_only(self, db):
        p, _ = _business(db)
        _booking(db, p, base=12000)
        _booking(db, p, base=3050, kind="rescue_bag", quantity=3)
        _booking(db, p, base=99900, at=BEFORE_LAST)
        _booking(db, p, base=50000, status="voided")
        _views(db, p, 4)
        _views(db, p, 7, at=BEFORE_LAST)
        db.add(ProducerWhatsAppClick(producer_id=p.id, clicked_at=_naive(IN_LAST)))
        db.add(
            ContactClick(producer_id=p.id, method="phone", clicked_at=_naive(IN_LAST))
        )
        db.commit()
        # A rescue order counts each collected bag (billing_summary._BOOKINGS).
        assert fmn.month_numbers(db, p.id, LAST) == {
            "bookings": 4,
            "value_agorot": 15050,
            "profile_views": 4,
            "whatsapp_clicks": 1,
            "contact_clicks": 1,
        }

    def test_month_starts_on_the_israel_clock(self, db):
        # LAST's Israel start is 22:00 or 21:00 UTC the day before: a view at
        # that instant is in, one a minute earlier is not.
        p, _ = _business(db)
        start = LAST.start().astimezone(timezone.utc)
        _views(db, p, 1, at=start)
        _views(db, p, 1, at=start - timedelta(minutes=1))
        assert fmn.month_numbers(db, p.id, LAST)["profile_views"] == 1


class TestBetweenMatchesTheDashboard:
    @pytest.mark.parametrize(
        "metric", ["profile_views", "whatsapp_clicks", "contact_clicks"]
    )
    def test_same_span_same_number(self, db, metric):
        # One visitor twice on one Israel day counts once on the dashboard;
        # the span counter must agree on every metric it is asked for.
        p, _ = _business(db)
        _views(db, p, 1)
        db.add(
            ProducerPageView(
                producer_id=p.id, viewer_ip_hash="f" * 64, created_at=_naive(IN_LAST)
            )
        )
        db.add(
            ProducerPageView(
                producer_id=p.id,
                viewer_ip_hash="f" * 64,
                created_at=_naive(IN_LAST + timedelta(hours=1)),
            )
        )
        db.add(ProducerWhatsAppClick(producer_id=p.id, clicked_at=_naive(IN_LAST)))
        db.add(
            ContactClick(producer_id=p.id, method="phone", clicked_at=_naive(IN_LAST))
        )
        db.commit()
        end = _naive(IN_LAST + timedelta(days=3))
        dashboard = metric_count(db, p.id, metric, 30, end)
        assert dashboard > 0
        assert (
            metric_count_between(db, p.id, metric, (end - timedelta(days=30), end))
            == dashboard
        )


class TestCopy:
    OCT = Month(2026, 10)

    def test_all_zero_is_no_block_and_no_subject(self):
        assert fmn.block("גבינות", self.OCT, ZERO) == ""
        assert fmn.subject("גבינות", self.OCT, ZERO) is None

    def test_views_only(self):
        n = ZERO | {"profile_views": 12}
        assert fmn.block("גבינות", self.OCT, n) == (
            "כך נראה אוקטובר בעמוד של גבינות במהמקור:\nצפיות בעמוד: 12\n\n"
        )
        assert fmn.subject("גבינות", self.OCT, n) == "גבינות באוקטובר: 12 צפיות בעמוד"
        assert fmn.subject("גבינות", self.OCT, ZERO | {"profile_views": 1}) == (
            "גבינות באוקטובר: צפייה אחת בעמוד"
        )

    def test_one_free_booking_has_no_value_row(self):
        n = ZERO | {"bookings": 1}
        out = fmn.block("גבינות", self.OCT, n)
        assert "הזמנות דרך האתר: 1" in out
        assert "שווי" not in out
        assert (
            fmn.subject("גבינות", self.OCT, n)
            == "גבינות באוקטובר: הזמנה אחת דרך מהמקור"
        )

    def test_many_bookings_lead_with_count_then_value(self):
        n = ZERO | {"bookings": 12, "value_agorot": 120050, "profile_views": 3}
        lines = fmn.block("גבינות", self.OCT, n).splitlines()
        assert lines[1:4] == [
            "הזמנות דרך האתר: 12",
            "שווי ההזמנות: 1200.50 ₪",
            "צפיות בעמוד: 3",
        ]
        assert (
            fmn.subject("גבינות", self.OCT, n)
            == "גבינות באוקטובר: 12 הזמנות דרך מהמקור"
        )


class TestEmail:
    def test_block_sits_after_the_greeting_and_before_the_question(self, db, sent):
        p, _ = _business(db, name="גבינות הגליל")
        _booking(db, p, base=8600)
        assert pf.send_freshness_emails(db, now=NOW)["sent"] == 1
        name = fmn.month_name(LAST)
        assert sent[0]["subject"] == f"גבינות הגליל ב{name}: הזמנה אחת דרך מהמקור"
        assert sent[0]["body"].startswith(
            "היי גבינות הגליל,\n\n"
            f"כך נראה {name} בעמוד של גבינות הגליל במהמקור:\n"
            "הזמנות דרך האתר: 1\nשווי ההזמנות: 86 ₪\n\n"
            "פעם בחודש אנחנו מוודאים"
        )

    def test_quiet_month_is_the_approved_email(self, db, sent):
        _business(db, name="גבינות הגליל")
        pf.send_freshness_emails(db, now=NOW)
        assert sent[0]["subject"] == "העמוד של גבינות הגליל במהמקור: הכול עדיין נכון?"
        assert sent[0]["body"].startswith(
            "היי גבינות הגליל,\n\nפעם בחודש אנחנו מוודאים"
        )

    def test_name_with_placeholders_is_text(self):
        _, body = pf.build_email(
            "x{name}{numbers}{confirm_url}",
            "https://c.example.com",
            "https://d.example.com",
            pf.MonthLead(block="BLOCK\n\n"),
        )
        assert body.startswith("היי x{name}{numbers}{confirm_url},\n\nBLOCK\n\nפעם")
        assert body.count("https://c.example.com") == 1

    def test_numbers_failure_still_sends_the_plain_email(self, db, sent, monkeypatch):
        _business(db, name="גבינות הגליל")

        def boom(*args, **kwargs):
            raise RuntimeError("analytics down")

        monkeypatch.setattr(fmn, "month_numbers", boom)
        assert pf.send_freshness_emails(db, now=NOW)["sent"] == 1
        assert sent[0]["subject"] == "העמוד של גבינות הגליל במהמקור: הכול עדיין נכון?"
