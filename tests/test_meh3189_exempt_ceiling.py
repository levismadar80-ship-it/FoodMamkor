"""MEH-3189 — year-to-date income against the exempt-dealer ceiling.

Pins what the admin is SHOWN on /admin/billing:
  - 0 income → 0%, no warning;
  - only months at or over the results threshold count (the same rule as
    the month's «would pay»), January to the asked month, that year only;
  - the warning level is the highest one reached (70, then 90);
  - the ceiling amount and its year come from app/pricing.py.
"""

from datetime import datetime, timezone
from uuid import uuid4

from app import pricing
from app.models.billing import BillableEvent
from app.pricing import current_price_list
from app.services import billing_summary
from app.services.billing_summary import Month
from conftest import auth_header, make_producer, make_user


def _row(db, producer, at, base, fee):
    db.add(
        BillableEvent(
            producer_id=producer.id,
            source_id=uuid4(),
            price_list_version=1,
            kind="event_registration",
            occurred_at=at,
            quantity=1,
            base_amount_agorot=base,
            fee_agorot=fee,
            status="counted",
        )
    )
    db.commit()


def _at(year, month):
    return datetime(year, month, 14, 10, 0, tzinfo=timezone.utc)


class TestYearToDate:
    def test_no_income_is_zero_with_no_warning(self, db):
        y = billing_summary.year_to_date(db, Month(2026, 11))
        assert (y["income_agorot"], y["percent"], y["alert_percent"]) == (0, 0, 0)
        assert y["ceiling_agorot"] == pricing.EXEMPT_DEALER_CEILING_AGOROT
        assert y["ceiling_year"] == pricing.EXEMPT_DEALER_CEILING_YEAR
        assert y["year"] == 2026

    def test_counts_only_months_over_threshold_this_year_up_to_month(self, db):
        threshold = current_price_list().threshold_paid_bookings_agorot
        p = make_producer(db)
        _row(db, p, _at(2026, 3), threshold, 111)  # over → counts
        _row(db, p, _at(2026, 4), threshold - 1, 222)  # under → not billed
        _row(db, p, _at(2026, 11), threshold, 333)  # the month itself counts
        _row(db, p, _at(2026, 12), threshold, 444)  # after the month
        _row(db, p, _at(2025, 6), threshold, 555)  # last year
        y = billing_summary.year_to_date(db, Month(2026, 11))
        assert y["income_agorot"] == 111 + 333

    def test_warning_levels(self, db, monkeypatch):
        threshold = current_price_list().threshold_paid_bookings_agorot
        p = make_producer(db)
        _row(db, p, _at(2026, 2), threshold, 75)
        monkeypatch.setattr(pricing, "EXEMPT_DEALER_CEILING_AGOROT", 100)
        y = billing_summary.year_to_date(db, Month(2026, 2))
        assert (y["percent"], y["alert_percent"]) == (75, 70)
        _row(db, p, _at(2026, 2), threshold, 20)
        y = billing_summary.year_to_date(db, Month(2026, 2))
        assert (y["percent"], y["alert_percent"]) == (95, 90)
        monkeypatch.setattr(pricing, "EXEMPT_DEALER_CEILING_AGOROT", 1000)
        y = billing_summary.year_to_date(db, Month(2026, 2))
        assert (y["percent"], y["alert_percent"]) == (9, 0)

    def test_the_overview_carries_the_year(self, client, db):
        threshold = current_price_list().threshold_paid_bookings_agorot
        p = make_producer(db)
        _row(db, p, _at(2026, 11), threshold, 5000)
        admin = make_user(db, role="admin", email="ceiling-admin@example.com")
        db.commit()
        r = client.get(
            "/admin/billing/overview?month=2026-11", headers=auth_header(admin)
        )
        assert r.status_code == 200, r.text
        year = r.json()["year"]
        assert (year["year"], year["income_agorot"]) == (2026, 5000)
