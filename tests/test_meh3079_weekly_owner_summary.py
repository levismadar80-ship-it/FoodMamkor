"""
MEH-3079 — weekly summary email for business owners.

Covers:
  - services/producer_insights.py: the 7-day numbers the email sends are the
    numbers GET /producers/me/analytics returns (and those are unchanged by
    the extraction — pinned against seeded counts, not against the service);
  - services/weekly_owner_summary.py: who gets the email (skips zero views,
    opted out, recently sent, not live, test rows, no verified owner), that a
    send stamps weekly_summary_sent_at, and what the email says;
  - POST /weekly-summary/unsubscribe: a valid token sets the opt-out, a token
    of another scope (the newsletter's) or a garbage token is refused;
  - app/startup.py: the job is registered only when the flag is on.

Every timestamp is seeded from the Israel clock (israel_days_ago), per
.claude/rules/testing.md.
"""

from __future__ import annotations

import itertools
import uuid
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from apscheduler.schedulers.background import BackgroundScheduler

from app import startup
from app.models.models import (
    ContactClick,
    Favorite,
    Producer,
    ProducerPageView,
    ProducerWhatsAppClick,
)
from app.routers.marketing import create_unsubscribe_token as newsletter_token
from app.services import weekly_owner_summary as wos
from app.services.producer_insights import weekly_numbers
from conftest import auth_header, israel_days_ago, make_producer, make_user

_seq = itertools.count()


# ---------------------------------------------------------------------------
# seed helpers
# ---------------------------------------------------------------------------


def _business(db, *, name="מאפיית הבדיקה", email_verified=True, status="approved"):
    producer = make_producer(db, name=name, status=status)
    owner = make_user(db, role="producer", email_verified=email_verified)
    owner.producer_id = producer.id
    db.commit()
    return producer, owner


def _views(db, producer_id, n, *, days_ago=1, ip_hash=None):
    """n page views; distinct visitors unless `ip_hash` pins one visitor."""
    for _ in range(n):
        db.add(
            ProducerPageView(
                producer_id=producer_id,
                viewer_ip_hash=ip_hash or f"{next(_seq):064d}",
                created_at=israel_days_ago(days_ago),
            )
        )
    db.commit()


def _whatsapp(db, producer_id, n, *, days_ago=1):
    for _ in range(n):
        db.add(
            ProducerWhatsAppClick(
                producer_id=producer_id, clicked_at=israel_days_ago(days_ago)
            )
        )
    db.commit()


def _contact(db, producer_id, n, *, days_ago=1):
    for _ in range(n):
        db.add(
            ContactClick(
                producer_id=producer_id,
                method="phone",
                clicked_at=israel_days_ago(days_ago),
            )
        )
    db.commit()


def _favorite(db, producer_id, *, days_ago=1):
    fan = make_user(db)
    db.add(
        Favorite(
            user_id=fan.id,
            producer_id=producer_id,
            created_at=israel_days_ago(days_ago),
        )
    )
    db.commit()


@pytest.fixture
def sent(monkeypatch):
    """Capture every send_email call the service makes."""
    calls: list[dict] = []

    def fake_send(to, subject, body, html=None, reply_to=None, test_cause=False):
        calls.append(
            {"to": to, "subject": subject, "body": body, "html": html,
             "test_cause": test_cause}
        )

    monkeypatch.setattr(wos, "send_email", fake_send)
    return calls


# ---------------------------------------------------------------------------
# Shared numbers — the email and the dashboard read one computation
# ---------------------------------------------------------------------------


class TestSharedNumbers:
    def test_analytics_endpoint_numbers_after_extraction(self, client, db):
        """Pinned against the seed, so the extraction cannot move them."""
        producer, owner = _business(db)
        _views(db, producer.id, 3, days_ago=1)
        # MEH-160 dedupe: one visitor refreshing 3x on one day counts once.
        _views(db, producer.id, 3, days_ago=2, ip_hash="f" * 64)
        _views(db, producer.id, 1, days_ago=20)  # outside 7d, inside 30d
        _whatsapp(db, producer.id, 2, days_ago=2)
        _whatsapp(db, producer.id, 1, days_ago=10)
        _contact(db, producer.id, 1, days_ago=3)
        _favorite(db, producer.id, days_ago=1)
        _favorite(db, producer.id, days_ago=12)

        r = client.get("/producers/me/analytics", headers=auth_header(owner))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["profile_views"] == {"last_7d": 4, "last_30d": 5, "total": 5}
        assert body["whatsapp_clicks"] == {"last_7d": 2, "last_30d": 3, "total": 3}
        assert body["contact_clicks"] == {"last_7d": 1, "last_30d": 1, "total": 1}
        assert body["search_appearances"] == {"last_7d": 0, "last_30d": 0, "total": 0}
        assert body["follower_count"] == 2
        assert body["new_followers_this_week"] == 1

    def test_weekly_numbers_equal_the_dashboard_last_7d(self, client, db):
        producer, owner = _business(db)
        _views(db, producer.id, 5, days_ago=1)
        _views(db, producer.id, 2, days_ago=15)
        _whatsapp(db, producer.id, 3, days_ago=2)
        _contact(db, producer.id, 2, days_ago=4)
        _favorite(db, producer.id, days_ago=2)

        body = client.get("/producers/me/analytics", headers=auth_header(owner)).json()
        assert weekly_numbers(db, producer.id) == {
            "profile_views": body["profile_views"]["last_7d"],
            "whatsapp_clicks": body["whatsapp_clicks"]["last_7d"],
            "contact_clicks": body["contact_clicks"]["last_7d"],
            "new_followers": body["new_followers_this_week"],
        }
        assert body["profile_views"]["last_7d"] == 5  # the seed, not 0 == 0


# ---------------------------------------------------------------------------
# Who gets the email
# ---------------------------------------------------------------------------


class TestWhoGetsIt:
    def test_sends_and_stamps_sent_at(self, db, sent):
        producer, owner = _business(db)
        _views(db, producer.id, 4)
        counters = wos.send_weekly_summaries(db)
        assert counters["sent"] == 1
        assert [c["to"] for c in sent] == [owner.email]
        db.refresh(producer)
        assert producer.weekly_summary_sent_at is not None

    def test_skips_zero_views(self, db, sent):
        producer, _ = _business(db)
        _whatsapp(db, producer.id, 3)  # clicks but no views → still a zero email
        _views(db, producer.id, 2, days_ago=20)  # views, but not this week
        counters = wos.send_weekly_summaries(db)
        assert sent == []
        assert counters["zero_views"] == 1
        db.refresh(producer)
        assert producer.weekly_summary_sent_at is None  # looked at again next week

    def test_skips_opted_out(self, db, sent):
        producer, _ = _business(db)
        _views(db, producer.id, 4)
        producer.weekly_summary_opt_out = True
        db.commit()
        wos.send_weekly_summaries(db)
        assert sent == []

    def test_skips_recently_sent(self, db, sent):
        producer, _ = _business(db)
        _views(db, producer.id, 4)
        producer.weekly_summary_sent_at = israel_days_ago(3)
        db.commit()
        wos.send_weekly_summaries(db)
        assert sent == []

    def test_sends_again_a_week_later(self, db, sent):
        producer, _ = _business(db)
        _views(db, producer.id, 4)
        producer.weekly_summary_sent_at = israel_days_ago(7)
        db.commit()
        wos.send_weekly_summaries(db)
        assert len(sent) == 1

    def test_second_run_same_day_sends_nothing(self, db, sent):
        producer, _ = _business(db)
        _views(db, producer.id, 4)
        wos.send_weekly_summaries(db)
        wos.send_weekly_summaries(db)
        assert len(sent) == 1

    def test_skips_a_business_that_is_not_live(self, db, sent):
        producer, _ = _business(db, status="pending")
        _views(db, producer.id, 4)
        wos.send_weekly_summaries(db)
        assert sent == []

    def test_skips_a_test_business(self, db, sent):
        producer, _ = _business(db)
        _views(db, producer.id, 4)
        producer.is_test = True
        db.commit()
        wos.send_weekly_summaries(db)
        assert sent == []

    def test_skips_an_owner_without_a_verified_email(self, db, sent):
        producer, _ = _business(db, email_verified=False)
        _views(db, producer.id, 4)
        counters = wos.send_weekly_summaries(db)
        assert sent == []
        assert counters["no_owner"] == 1

    def test_one_live_one_zero_sends_exactly_one(self, db, sent):
        live, owner = _business(db, name="עם צפיות")
        _views(db, live.id, 2)
        _business(db, name="בלי צפיות")
        counters = wos.send_weekly_summaries(db)
        assert [c["to"] for c in sent] == [owner.email]
        assert counters["scanned"] == 2


# ---------------------------------------------------------------------------
# What the email says
# ---------------------------------------------------------------------------


class TestEmailContent:
    def test_subject_body_and_links(self, db, sent):
        producer, _ = _business(db, name="מאפיית הבדיקה")
        _views(db, producer.id, 7)
        _whatsapp(db, producer.id, 2)
        _favorite(db, producer.id)
        wos.send_weekly_summaries(db)
        (mail,) = sent
        assert mail["subject"] == "השבוע 7 אנשים צפו בעמוד שלכם"
        assert "מאפיית הבדיקה" in mail["body"]
        assert "צפיות בעמוד: 7" in mail["body"]
        assert "קליקים בוואטסאפ: 2" in mail["body"]
        assert "שמרו את העסק במועדפים: 1" in mail["body"]
        # zero rows are left out, never shown as 0
        assert "קליקים על טלפון" not in mail["body"]
        assert "/producer/dashboard/insights" in mail["body"]
        assert 'dir="rtl"' in mail["html"]
        # the unsubscribe link carries a token for THIS business
        link = next(w for w in mail["body"].split() if "/unsubscribe/weekly?" in w)
        token = parse_qs(urlparse(link).query)["token"][0]
        assert wos.decode_unsubscribe_token(token) == producer.id

    def test_subject_singular(self):
        assert wos.subject_for(1) == "השבוע אדם אחד צפה בעמוד שלכם"


# ---------------------------------------------------------------------------
# Unsubscribe
# ---------------------------------------------------------------------------


class TestUnsubscribe:
    def test_valid_token_sets_opt_out(self, client, db):
        producer, _ = _business(db)
        token = wos.create_unsubscribe_token(producer.id)
        r = client.post("/weekly-summary/unsubscribe", json={"token": token})
        assert r.status_code == 200, r.text
        db.refresh(producer)
        assert producer.weekly_summary_opt_out is True

    def test_newsletter_scope_token_is_rejected(self, client, db):
        producer, _ = _business(db)
        # Same key, same algorithm, a real signed token — only the scope differs.
        wrong = newsletter_token(str(producer.id))
        r = client.post("/weekly-summary/unsubscribe", json={"token": wrong})
        assert r.status_code == 400
        assert r.json()["detail"] == "הקישור אינו תקין או שפג תוקפו."
        db.refresh(producer)
        assert producer.weekly_summary_opt_out is False

    def test_weekly_token_does_not_unsubscribe_the_newsletter(self, client, db):
        producer, _ = _business(db)
        token = wos.create_unsubscribe_token(producer.id)
        r = client.post("/newsletter/unsubscribe", json={"token": token})
        assert r.status_code == 400

    def test_garbage_token_is_rejected(self, client):
        r = client.post("/weekly-summary/unsubscribe", json={"token": "not-a-jwt"})
        assert r.status_code == 400

    def test_unknown_business_is_a_calm_200(self, client):
        token = wos.create_unsubscribe_token(uuid.uuid4())
        r = client.post("/weekly-summary/unsubscribe", json={"token": token})
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Scheduler gate
# ---------------------------------------------------------------------------


class TestJobRegistration:
    def test_flag_defaults_off(self):
        assert wos.summary_enabled() is False

    def test_not_registered_when_flag_off(self):
        scheduler = BackgroundScheduler(timezone="UTC")
        assert startup._register_weekly_owner_summary(scheduler) is False
        assert scheduler.get_job(wos.JOB_ID) is None

    def test_registered_sunday_0800_israel_when_flag_on(self, monkeypatch):
        monkeypatch.setattr(wos, "summary_enabled", lambda: True)
        scheduler = BackgroundScheduler(timezone="UTC")
        assert startup._register_weekly_owner_summary(scheduler) is True
        job = scheduler.get_job(wos.JOB_ID)
        assert job is not None
        fields = {f.name: str(f) for f in job.trigger.fields}
        assert fields["day_of_week"] == "sun"
        assert fields["hour"] == "8"
        assert fields["minute"] == "0"
        assert str(job.trigger.timezone) == "Asia/Jerusalem"
        assert job.max_instances == 1
        assert job.coalesce is True
        assert job.misfire_grace_time >= 6 * 3600


def test_sent_at_window_is_six_days():
    assert wos.RESEND_AFTER == timedelta(days=6)
    assert Producer.weekly_summary_opt_out.property.columns[0].nullable is False
