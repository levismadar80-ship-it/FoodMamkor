"""
MEH-3840: the day-30 onboarding email («חודש איתנו»).

Covers:
  - Email 5A no longer promises materials that no email sends, and no longer
    asks «קיבלתם הודעות ראשונות?»;
  - both variants show the last 30 days' numbers from producer_insights,
    with a zero row hidden: 0 / 1 / many views;
  - the monthly «הכול עדיין נכון?» email skips a business whose «חודש איתנו»
    went out within the last 7 days, and still reaches one after that.
"""

from __future__ import annotations

from datetime import timedelta

from app.models import ContactClick, Favorite, ProducerPageView, ProducerWhatsAppClick
from app.services import onboarding_day30_numbers as day30
from app.services import onboarding_followup
from app.services import page_freshness as pf
from conftest import israel_days_ago, make_user
from test_onboarding_followup import _make_producer_user, sent_log  # noqa: F401
from test_page_freshness import NOW, _business, enabled, sent  # noqa: F401


def _step5(sent_log):
    subjects = {
        onboarding_followup._EMAIL_5A_SUBJECT,
        onboarding_followup._EMAIL_5B_SUBJECT,
    }
    found = [s for s in sent_log if s[1] in subjects]
    assert len(found) == 1
    return found[0]


def _views(db, producer, count):
    for i in range(count):
        db.add(
            ProducerPageView(
                producer_id=producer.id,
                viewer_ip_hash=f"{i:064d}",
                created_at=israel_days_ago(2),
            )
        )
    db.commit()


def _numbers(views=0, whatsapp=0, contact=0, saves=0):
    return {
        "profile_views": views,
        "whatsapp_clicks": whatsapp,
        "contact_clicks": contact,
        "new_followers": saves,
    }


class TestCopy:
    def test_5a_drops_the_promise_and_the_question(self, db, sent_log):
        _make_producer_user(db, days_old=30, license_number="12345")
        onboarding_followup.send_due_followups(db)
        _to, subject, body = _step5(sent_log)
        assert subject == "חודש איתנו — סיכום קצר"
        assert "מה הלאה" not in subject + body
        assert "חומרים מעמיקים" not in body
        assert "קיבלתם הודעות ראשונות" not in body
        assert "מה עובד אצלכם ומה פחות?" in body


class TestNumbers:
    def test_zero_views_shows_no_block(self, db, sent_log):
        _make_producer_user(db, days_old=30, license_number="12345")
        onboarding_followup.send_due_followups(db)
        _to, _subject, body = _step5(sent_log)
        assert "כך נראו 30 הימים האחרונים" not in body
        assert ": 0" not in body
        assert "{numbers}" not in body

    def test_one_view_from_the_real_tables(self, db, sent_log):
        producer, _ = _make_producer_user(db, days_old=30, license_number="12345")
        _views(db, producer, 1)
        onboarding_followup.send_due_followups(db)
        _to, _subject, body = _step5(sent_log)
        assert "כך נראו 30 הימים האחרונים של חוות הניסוי במהמקור:" in body
        assert "צפיות בעמוד: 1\n" in body
        assert "קליקים בוואטסאפ" not in body
        assert "/producer/dashboard/insights" in body

    def test_many_views_in_variant_b(self, db, sent_log):
        producer, _ = _make_producer_user(db, days_old=30, license_number=None)
        _views(db, producer, 3)
        onboarding_followup.send_due_followups(db)
        _to, subject, body = _step5(sent_log)
        assert subject == onboarding_followup._EMAIL_5B_SUBJECT
        assert "צפיות בעמוד: 3\n" in body
        assert body.index("צפיות בעמוד") < body.index('תג "מאומת"')

    def test_every_row_from_the_real_tables(self, db, sent_log):
        """Review finding: each of the four cells is read from its own table,
        so a wrong metric key cannot silently drop the block (fail-open)."""
        producer, _ = _make_producer_user(db, days_old=30, license_number="12345")
        _views(db, producer, 2)
        fan = make_user(db, role="consumer", email_verified=True)
        db.add(
            ProducerWhatsAppClick(
                producer_id=producer.id, clicked_at=israel_days_ago(3)
            )
        )
        db.add(ContactClick(producer_id=producer.id, user_id=None, method="phone"))
        db.add(Favorite(user_id=fan.id, producer_id=producer.id))
        db.commit()
        onboarding_followup.send_due_followups(db)
        _to, _subject, body = _step5(sent_log)
        for line in (
            "צפיות בעמוד: 2\n",
            "קליקים בוואטסאפ: 1\n",
            "קליקים על טלפון, אתר ועוד: 1\n",
            "שמירות במועדפים: 1\n",
        ):
            assert line in body

    def test_rows_hide_zeros_and_keep_order(self):
        assert day30.rows(_numbers()) == []
        assert day30.rows(_numbers(views=12, saves=2)) == [
            ("צפיות בעמוד", 12),
            ("שמירות במועדפים", 2),
        ]
        # No views but a click still shows, without a «צפיות בעמוד: 0» row.
        assert day30.rows(_numbers(whatsapp=1)) == [("קליקים בוואטסאפ", 1)]

    def test_a_numbers_failure_never_costs_the_email(self, db, sent_log, monkeypatch):
        _make_producer_user(db, days_old=30, license_number="12345")

        def boom(*_a, **_k):
            raise RuntimeError("analytics down")

        monkeypatch.setattr(day30, "day30_numbers", boom)
        onboarding_followup.send_due_followups(db)
        _to, _subject, body = _step5(sent_log)
        assert "כך נראו" not in body


class TestNotOnTheSameDayAsFreshness:
    def test_skipped_when_day30_email_went_out_yesterday(self, db, sent, enabled):
        producer, _owner = _business(db, age_days=90)
        producer.email_followup_5_sent_at = NOW - timedelta(days=1)
        db.commit()
        counters = pf.send_freshness_emails(db, now=NOW)
        assert counters["sent"] == 0
        assert sent == []
        db.refresh(producer)
        assert producer.freshness_email_sent_at is None  # asked on a later day

    def test_exactly_seven_days_still_waits(self, db, sent, enabled):
        producer, _owner = _business(db, age_days=90)
        producer.email_followup_5_sent_at = NOW - pf.AFTER_ONBOARDING_DAY30
        db.commit()
        assert pf.send_freshness_emails(db, now=NOW)["sent"] == 0

    def test_sent_once_day30_email_is_over_a_week_old(self, db, sent, enabled):
        producer, _owner = _business(db, age_days=90)
        producer.email_followup_5_sent_at = NOW - timedelta(days=8)
        db.commit()
        counters = pf.send_freshness_emails(db, now=NOW)
        assert counters["sent"] == 1
        assert len(sent) == 1
