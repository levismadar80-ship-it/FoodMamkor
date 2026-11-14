"""MEH-3181 — the monthly billing summary and the gallery capability.

Nothing is charged. These tests pin what a business and the admin are SHOWN:
  - 0 / 1 / many bookings in a month, by kind, with their value;
  - a voided row and a row from another month are not counted;
  - the month is an Israel calendar month (pinned at the edge);
  - what each route would cost, with and without a subscription;
  - a business sees only its own summary; a consumer sees none;
  - the admin list: who passed the threshold and for how many months in a row;
  - the gallery cap moved to `capabilities` without changing.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.models.billing import BillableEvent
from app.pricing import current_price_list
from app.services import billing_summary
from app.services.billing_summary import Month
from app.services.capabilities import gallery_image_limit, gallery_is_full
from conftest import auth_header, make_producer, make_user
from uuid import uuid4

NOV = Month(2026, 11)
MID_NOV = datetime(2026, 11, 14, 10, 0, tzinfo=timezone.utc)


def _row(db, producer, **overrides):
    """One ledger row; `at`, `base`, `fee` are short names for the long columns."""
    values = {
        "kind": "event_registration",
        "occurred_at": overrides.pop("at", MID_NOV),
        "quantity": 1,
        "base_amount_agorot": overrides.pop("base", 20000),
        "fee_agorot": overrides.pop("fee", 1000),
        "status": "counted",
    } | overrides
    row = BillableEvent(
        producer_id=producer.id, source_id=uuid4(), price_list_version=1, **values
    )
    db.add(row)
    db.commit()
    return row


def _owner(db, producer, email):
    user = make_user(db, role="producer", email=email)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return user


class TestSummarize:
    def test_a_month_with_no_rows_is_all_zeros(self, db):
        producer = make_producer(db)
        s = billing_summary.summarize(db, producer.id, NOV)
        assert (s["bookings"], s["value_agorot"], s["over_threshold"]) == (0, 0, False)
        assert s["fee_without_subscription_agorot"] == 0
        assert s["charged_agorot"] == 0
        assert [k["bookings"] for k in s["by_kind"]] == [0, 0, 0, 0]

    def test_one_paid_signup(self, db):
        producer = make_producer(db)
        _row(db, producer)
        s = billing_summary.summarize(db, producer.id, NOV)
        assert (s["bookings"], s["value_agorot"]) == (1, 20000)
        assert s["fee_without_subscription_agorot"] == 1000  # 5% of 200 ₪
        # 49 ₪ + 2% of 200 ₪
        assert s["fee_with_subscription_agorot"] == 4900 + 400

    def test_many_rows_of_every_kind(self, db):
        producer = make_producer(db)
        _row(db, producer)
        _row(db, producer, kind="experience_registration", base=12000, fee=600)
        _row(db, producer, kind="group_buy_order", base=27000, fee=1350, quantity=3)
        _row(db, producer, kind="rescue_bag", base=3000, fee=400, quantity=2)
        s = billing_summary.summarize(db, producer.id, NOV)
        by_kind = {k["kind"]: k["bookings"] for k in s["by_kind"]}
        # A group-buy order is one booking whatever its units; each bag is one.
        assert by_kind == {
            "event_registration": 1,
            "experience_registration": 1,
            "group_buy_order": 1,
            "rescue_bag": 2,
        }
        assert s["bookings"] == 5
        assert s["value_agorot"] == 62000
        assert s["fee_without_subscription_agorot"] == 3350
        # 2% of 590 ₪ of paid bookings = 11.80 ₪, plus 2 bags at 1 ₪, plus 49 ₪.
        assert s["fee_with_subscription_agorot"] == 4900 + 1180 + 200

    def test_voided_and_other_months_are_not_counted(self, db):
        producer = make_producer(db)
        _row(db, producer)
        _row(db, producer, status="voided")
        _row(db, producer, at=MID_NOV - timedelta(days=30))
        other = make_producer(db, name="עסק אחר")
        _row(db, other)
        assert billing_summary.summarize(db, producer.id, NOV)["bookings"] == 1

    def test_the_month_edge_is_on_the_israel_clock(self, db):
        """30/11 22:30 UTC is already 1/12 in Israel (UTC+2 in winter)."""
        producer = make_producer(db)
        _row(db, producer, at=datetime(2026, 11, 30, 21, 59, tzinfo=timezone.utc))
        _row(db, producer, at=datetime(2026, 11, 30, 22, 30, tzinfo=timezone.utc))
        _row(db, producer, at=datetime(2026, 10, 31, 22, 30, tzinfo=timezone.utc))
        assert billing_summary.summarize(db, producer.id, NOV)["bookings"] == 2
        assert (
            billing_summary.summarize(db, producer.id, Month(2026, 12))["bookings"] == 1
        )

    def test_the_month_edge_follows_the_clock_change(self, db):
        """In summer Israel is UTC+3: April starts 31/3 21:00 UTC and October
        30/9 21:00 UTC. A fixed +02:00 would put both rows a month early."""
        producer = make_producer(db)
        _row(db, producer, at=datetime(2026, 3, 31, 21, 30, tzinfo=timezone.utc))
        _row(db, producer, at=datetime(2026, 9, 30, 21, 30, tzinfo=timezone.utc))
        counts = {
            m: billing_summary.summarize(db, producer.id, Month(2026, m))["bookings"]
            for m in (3, 4, 9, 10)
        }
        assert counts == {3: 0, 4: 1, 9: 0, 10: 1}

    def test_nothing_is_charged_even_in_a_busy_month(self, db):
        producer = make_producer(db)
        _row(db, producer)
        s = billing_summary.summarize(db, producer.id, NOV)
        pl = current_price_list()
        assert s["fee_without_subscription_agorot"] > 0  # control: a fee exists
        assert (s["phase"], s["charged_agorot"]) == ("launch", 0)
        assert (s["threshold_agorot"], s["price_list_version"]) == (
            pl.threshold_paid_bookings_agorot,
            pl.version,
        )

    def test_the_subscriber_fee_is_rounded_per_booking(self, db):
        """Like the stored plain fee: each booking is rounded to a whole agora.
        20 bookings of 1.25 ₪ at 2% are 2.5 agorot each → 3 each → 60, where
        rounding the month once would give 50."""
        producer = make_producer(db)
        for _ in range(20):
            _row(db, producer, base=125, fee=6)
        s = billing_summary.summarize(db, producer.id, NOV)
        assert s["fee_with_subscription_agorot"] == 4900 + 60

    def test_the_summary_carries_counts_and_amounts_only(self, db):
        producer = make_producer(db)
        _row(db, producer)
        s = billing_summary.summarize(db, producer.id, NOV)
        assert set(s) == {
            "month",
            "phase",
            "bookings",
            "value_agorot",
            "by_kind",
            "threshold_agorot",
            "over_threshold",
            "fee_without_subscription_agorot",
            "fee_with_subscription_agorot",
            "charged_agorot",
            "price_list_version",
        }
        assert set(s["by_kind"][0]) == {"kind", "bookings", "value_agorot"}

    def test_the_threshold_is_an_amount_reached_at_exactly_its_value(self, db):
        producer = make_producer(db)
        threshold = current_price_list().threshold_paid_bookings_agorot
        _row(db, producer, base=threshold - 1, fee=0)
        assert (
            billing_summary.summarize(db, producer.id, NOV)["over_threshold"] is False
        )
        _row(db, producer, base=1, fee=0)
        assert billing_summary.summarize(db, producer.id, NOV)["over_threshold"] is True

    def test_free_sign_ups_never_reach_the_threshold(self, db):
        """Under the old rule (20 bookings a month) this month was over."""
        producer = make_producer(db)
        for _ in range(25):
            _row(db, producer, base=0, fee=0)
        s = billing_summary.summarize(db, producer.id, NOV)
        assert (s["bookings"], s["over_threshold"]) == (25, False)

    def test_a_few_large_orders_reach_the_threshold(self, db):
        """Under the old rule five bookings were far below the threshold."""
        producer = make_producer(db)
        for _ in range(5):
            _row(db, producer, kind="group_buy_order", base=200000, fee=10000)
        s = billing_summary.summarize(db, producer.id, NOV)
        assert (s["bookings"], s["over_threshold"]) == (5, True)


class TestRoutes:
    def test_owner_sees_her_own_business_only(self, client, db):
        mine = make_producer(db, name="שלי")
        theirs = make_producer(db, name="שלהם")
        _row(db, mine)
        _row(db, theirs)
        _row(db, theirs)
        owner = _owner(db, mine, "billing-owner@example.com")
        r = client.get(
            "/producers/me/billing/summary?month=2026-11", headers=auth_header(owner)
        )
        assert r.status_code == 200, r.text
        assert r.json()["bookings"] == 1
        assert r.json()["month"] == "2026-11"

    def test_guest_and_consumer_are_refused(self, client, db):
        consumer = make_user(db, email="billing-consumer@example.com")
        db.commit()
        assert client.get("/producers/me/billing/summary").status_code == 401
        r = client.get("/producers/me/billing/summary", headers=auth_header(consumer))
        assert r.status_code == 403

    def test_admin_overview_is_admin_only(self, client, db):
        producer = make_producer(db)
        owner = _owner(db, producer, "billing-owner2@example.com")
        assert client.get("/admin/billing/overview").status_code == 401
        r = client.get("/admin/billing/overview", headers=auth_header(owner))
        assert r.status_code == 403

    @pytest.mark.parametrize(
        "month", ["2026-13", "2026-00", "11-2026", "2026-1", "9999-12", "0001-01"]
    )
    def test_a_bad_month_is_422(self, client, db, month):
        producer = make_producer(db)
        owner = _owner(db, producer, "billing-owner3@example.com")
        r = client.get(
            f"/producers/me/billing/summary?month={month}", headers=auth_header(owner)
        )
        assert r.status_code == 422


class TestAdminOverview:
    def _busy(self, db, producer, month_start, value_agorot):
        """One paid booking of `value_agorot` in that month."""
        _row(db, producer, at=month_start + timedelta(days=5), base=value_agorot, fee=0)

    def test_who_passed_the_threshold_and_for_how_long(self, client, db):
        threshold = current_price_list().threshold_paid_bookings_agorot
        nov = datetime(2026, 11, 1, 12, tzinfo=timezone.utc)
        octo = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)
        sep = datetime(2026, 9, 1, 12, tzinfo=timezone.utc)
        steady = make_producer(db, name="א קבוע")  # over in Sep, Oct and Nov
        fresh = make_producer(db, name="ב חדש")  # over in Nov only
        gap = make_producer(db, name="ג עם הפסקה")  # over in Sep and Nov, not Oct
        small = make_producer(db, name="ד קטן")  # under in Nov
        for start in (sep, octo, nov):
            self._busy(db, steady, start, threshold)
        self._busy(db, fresh, nov, threshold + 2)
        self._busy(db, gap, sep, threshold)
        self._busy(db, gap, nov, threshold)
        self._busy(db, small, nov, threshold - 1)
        test_biz = make_producer(db, name="עסק בדיקה")
        test_biz.is_test = True
        db.commit()
        self._busy(db, test_biz, nov, threshold)

        admin = make_user(db, role="admin", email="billing-admin@example.com")
        db.commit()
        r = client.get(
            "/admin/billing/overview?month=2026-11", headers=auth_header(admin)
        )
        assert r.status_code == 200, r.text
        body = r.json()
        rows = {x["name"]: x for x in body["rows"]}
        assert set(rows) == {
            "א קבוע",
            "ב חדש",
            "ג עם הפסקה",
            "ד קטן",
        }  # no test business
        assert rows["א קבוע"]["months_over_in_a_row"] == 3
        assert rows["ב חדש"]["months_over_in_a_row"] == 1
        assert rows["ג עם הפסקה"]["months_over_in_a_row"] == 1
        assert (
            rows["ד קטן"]["over_threshold"],
            rows["ד קטן"]["months_over_in_a_row"],
        ) == (
            False,
            0,
        )
        assert body["businesses_over_threshold"] == 3
        assert body["businesses_over_two_months"] == 1
        assert (body["phase"], body["start_billing_businesses"]) == ("launch", 10)
        assert body["rows"][0]["name"] == "ב חדש"  # highest value first

    def test_the_overview_counts_like_the_summary(self, client, db):
        """Bags count by quantity, a group-buy order counts once whatever its
        units, a voided row counts nothing, and the value is summed."""
        producer = make_producer(db, name="מעורב")
        _row(db, producer, kind="rescue_bag", quantity=3, base=4500, fee=600)
        _row(db, producer, kind="group_buy_order", quantity=3, base=27000, fee=1350)
        _row(db, producer, status="voided")
        admin = make_user(db, role="admin", email="billing-admin3@example.com")
        db.commit()
        r = client.get(
            "/admin/billing/overview?month=2026-11", headers=auth_header(admin)
        )
        assert r.status_code == 200, r.text
        (row,) = r.json()["rows"]
        assert (row["bookings"], row["value_agorot"]) == (4, 31500)
        # 315 ₪ is under the threshold: the fees exist (600 + 1350; the voided
        # row's 1000 is not counted) and the month would still cost nothing.
        assert (row["over_threshold"], row["would_pay_agorot"]) == (False, 0)
        assert r.json()["would_pay_total_agorot"] == 0
        assert set(row) == {
            "producer_id",
            "name",
            "bookings",
            "value_agorot",
            "over_threshold",
            "months_over_in_a_row",
            "would_pay_agorot",
        }
        mine = billing_summary.summarize(db, producer.id, NOV)
        assert (mine["bookings"], mine["value_agorot"]) == (4, 31500)

    def test_a_month_over_the_threshold_would_pay_its_stored_fees(self, client, db):
        over = make_producer(db, name="מעל")
        under = make_producer(db, name="מתחת")
        _row(db, over, base=90000, fee=4500)
        _row(db, over, base=10000, fee=500)
        _row(db, over, status="voided", base=50000, fee=2500)
        _row(db, under, base=99999, fee=5000)
        admin = make_user(db, role="admin", email="billing-admin4@example.com")
        db.commit()
        r = client.get(
            "/admin/billing/overview?month=2026-11", headers=auth_header(admin)
        )
        assert r.status_code == 200, r.text
        rows = {x["name"]: x for x in r.json()["rows"]}
        assert rows["מעל"]["would_pay_agorot"] == 5000
        assert rows["מתחת"]["would_pay_agorot"] == 0
        assert r.json()["would_pay_total_agorot"] == 5000
        # The rule the screen states comes from the server, not from its copy.
        assert (
            r.json()["start_billing_businesses"],
            r.json()["start_billing_months"],
        ) == (
            billing_summary.START_BILLING_BUSINESSES,
            billing_summary.START_BILLING_MONTHS,
        )

    def test_the_history_is_six_months_newest_first_each_with_its_own_totals(
        self, client, db
    ):
        """Shadow billing: what each of the last months would have brought in."""
        steady = make_producer(db, name="קבוע")
        once = make_producer(db, name="פעם אחת")
        _row(db, steady, base=120000, fee=6000)
        _row(
            db,
            steady,
            base=150000,
            fee=7500,
            at=datetime(2026, 10, 15, tzinfo=timezone.utc),
        )
        # Under the threshold in September: value counts, would-pay does not.
        _row(
            db,
            steady,
            base=40000,
            fee=2000,
            at=datetime(2026, 9, 15, tzinfo=timezone.utc),
        )
        _row(
            db,
            once,
            base=200000,
            fee=10000,
            at=datetime(2026, 10, 20, tzinfo=timezone.utc),
        )
        _row(
            db,
            once,
            status="voided",
            base=300000,
            fee=15000,
            at=datetime(2026, 10, 21, tzinfo=timezone.utc),
        )
        # A test business never appears, in the month or in the history.
        demo = make_producer(db, name="דמו")
        demo.is_test = True
        db.commit()
        _row(
            db,
            demo,
            base=500000,
            fee=25000,
            at=datetime(2026, 10, 10, tzinfo=timezone.utc),
        )
        admin = make_user(db, role="admin", email="billing-admin5@example.com")
        db.commit()
        r = client.get(
            "/admin/billing/overview?month=2026-11", headers=auth_header(admin)
        )
        assert r.status_code == 200, r.text
        history = r.json()["history"]
        assert [h["month"] for h in history] == [
            "2026-11",
            "2026-10",
            "2026-09",
            "2026-08",
            "2026-07",
            "2026-06",
        ]
        by_month = {h["month"]: h for h in history}
        assert by_month["2026-11"] == {
            "month": "2026-11",
            "businesses": 1,
            "businesses_over_threshold": 1,
            "value_agorot": 120000,
            "would_pay_total_agorot": 6000,
        }
        assert by_month["2026-10"] == {
            "month": "2026-10",
            "businesses": 2,
            "businesses_over_threshold": 2,
            "value_agorot": 350000,
            "would_pay_total_agorot": 17500,
        }
        assert by_month["2026-09"] == {
            "month": "2026-09",
            "businesses": 1,
            "businesses_over_threshold": 0,
            "value_agorot": 40000,
            "would_pay_total_agorot": 0,
        }
        assert by_month["2026-08"]["businesses"] == 0
        # The newest history line and the page's own totals are one computation.
        assert (
            history[0]["would_pay_total_agorot"] == r.json()["would_pay_total_agorot"]
        )
        # The streak still reads off the same months.
        (row,) = r.json()["rows"]
        assert row["months_over_in_a_row"] == 2

    def test_an_empty_month(self, client, db):
        admin = make_user(db, role="admin", email="billing-admin2@example.com")
        db.commit()
        r = client.get(
            "/admin/billing/overview?month=2026-11", headers=auth_header(admin)
        )
        assert r.status_code == 200
        assert r.json()["rows"] == []
        assert r.json()["businesses_over_threshold"] == 0
        assert (
            r.json()["threshold_agorot"]
            == current_price_list().threshold_paid_bookings_agorot
        )


class TestMonth:
    def test_previous_and_next_cross_the_year(self):
        assert Month(2026, 1).previous() == Month(2025, 12)
        assert Month(2026, 12).next() == Month(2027, 1)
        assert Month.parse("2026-11") == NOV

    @pytest.mark.parametrize("text", ["2026-13", "abcd-11", "2026", "2026-11-01"])
    def test_parse_refuses_anything_else(self, text):
        with pytest.raises(ValueError):
            Month.parse(text)


class _Biz:
    def __init__(self, plan, images):
        self.plan, self.images = plan, images


class TestGalleryCapability:
    """The cap as it was in upload.py: free plan, 3 images."""

    def test_free_plan_is_capped_at_three(self):
        assert gallery_image_limit(_Biz("free", [])) == 3
        assert gallery_is_full(_Biz("free", ["a", "b"])) is False
        assert gallery_is_full(_Biz("free", ["a", "b", "c"])) is True

    def test_any_other_plan_and_a_missing_plan_are_not_capped(self):
        assert gallery_is_full(_Biz("premium", ["a"] * 9)) is False
        assert gallery_is_full(_Biz(None, ["a"] * 9)) is False
        assert gallery_is_full(None) is False

    def test_no_images_is_not_full(self):
        assert gallery_is_full(_Biz("free", None)) is False


def test_the_start_billing_rule_in_the_price_doc_equals_the_code():
    """docs/PRICING.md states the rule for people; the code owns the numbers.

    Without this the doc (or a sentence copied from it) keeps the old numbers
    when the rule changes: the mistake of 14/11, «חודשיים» typed into copy.
    """
    import re
    from pathlib import Path

    doc = (Path(__file__).resolve().parents[1] / "docs" / "PRICING.md").read_text(
        encoding="utf-8"
    )
    found = re.search(r"כש-(\d+) בתי עסק מגיעים לסף התוצאות (\d+) חודשים ברצף", doc)
    assert found, "the start-billing rule line is missing from docs/PRICING.md"
    assert (int(found.group(1)), int(found.group(2))) == (
        billing_summary.START_BILLING_BUSINESSES,
        billing_summary.START_BILLING_MONTHS,
    )
