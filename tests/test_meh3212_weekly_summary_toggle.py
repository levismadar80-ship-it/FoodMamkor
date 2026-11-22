"""MEH-3212: a business can turn the weekly summary back on.

Before this, an unsubscribe (one forwarded email, a mail scanner) stopped the
email for good; only a database edit undid it.

  - GET / PATCH /producers/me/weekly-summary: the owner turns it off and on;
    another business's owner changes only her own row; a consumer gets 403.
  - The email carries List-Unsubscribe + RFC 8058 one-click headers, and
    send_email passes caller headers through to Resend.
  - The one-click URL acts only on POST; a GET changes nothing.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest

from app.config import settings
from app.models.models import Producer, ProducerPageView
from app.services import email as email_module
from app.services import weekly_owner_summary as wos
from conftest import auth_header, israel_days_ago, make_producer, make_user

URL = "/producers/me/weekly-summary"
ONE_CLICK = "/weekly-summary/unsubscribe/one-click"


def _business(db, *, name="מאפיית הטוגל"):
    producer = make_producer(db, name=name, status="approved")
    owner = make_user(db, role="producer", email_verified=True)
    owner.producer_id = producer.id
    db.commit()
    return producer, owner


def _opt_out(db, producer_id) -> bool:
    db.expire_all()
    return bool(db.query(Producer).filter(Producer.id == producer_id).one().weekly_summary_opt_out)


class TestOwnerSwitch:
    def test_get_reports_on_by_default_and_the_site_flag(self, client, db, monkeypatch):
        _, owner = _business(db)
        r = client.get(URL, headers=auth_header(owner))
        assert r.status_code == 200
        assert r.json() == {"enabled": True, "available": False}
        monkeypatch.setattr(
            "app.routers.producer_me_weekly_summary.summary_enabled", lambda: True
        )
        assert client.get(URL, headers=auth_header(owner)).json()["available"] is True

    def test_owner_turns_it_off_and_back_on(self, client, db):
        producer, owner = _business(db)
        off = client.patch(URL, json={"enabled": False}, headers=auth_header(owner))
        assert off.status_code == 200
        assert off.json()["enabled"] is False
        assert _opt_out(db, producer.id) is True

        on = client.patch(URL, json={"enabled": True}, headers=auth_header(owner))
        assert on.status_code == 200
        assert on.json()["enabled"] is True
        assert _opt_out(db, producer.id) is False

    def test_turning_on_after_an_email_unsubscribe(self, client, db):
        """The bug itself: the link in the email opted out, and the owner can
        now undo it from the dashboard."""
        producer, owner = _business(db)
        token = wos.create_unsubscribe_token(producer.id)
        assert client.post("/weekly-summary/unsubscribe", json={"token": token}).status_code == 200
        assert _opt_out(db, producer.id) is True
        r = client.patch(URL, json={"enabled": True}, headers=auth_header(owner))
        assert r.status_code == 200
        assert _opt_out(db, producer.id) is False

    def test_other_business_owner_changes_only_her_own_row(self, client, db):
        mine, _ = _business(db, name="העסק שלי")
        theirs, other_owner = _business(db, name="העסק השני")
        r = client.patch(URL, json={"enabled": False}, headers=auth_header(other_owner))
        assert r.status_code == 200
        assert _opt_out(db, theirs.id) is True
        assert _opt_out(db, mine.id) is False

    def test_consumer_is_403(self, client, db):
        producer, _ = _business(db)
        consumer = make_user(db, role="consumer")
        assert client.patch(URL, json={"enabled": False}, headers=auth_header(consumer)).status_code == 403
        assert client.get(URL, headers=auth_header(consumer)).status_code == 403
        assert _opt_out(db, producer.id) is False

    def test_anonymous_is_401(self, client):
        assert client.patch(URL, json={"enabled": True}).status_code == 401

    def test_producer_user_without_a_business_is_404(self, client, db):
        lone = make_user(db, role="producer")
        assert client.patch(URL, json={"enabled": True}, headers=auth_header(lone)).status_code == 404

    def test_body_must_be_a_boolean(self, client, db):
        _, owner = _business(db)
        r = client.patch(URL, json={"enabled": "maybe"}, headers=auth_header(owner))
        assert r.status_code == 422


class TestOneClick:
    def test_post_opts_out(self, client, db):
        producer, _ = _business(db)
        token = wos.create_unsubscribe_token(producer.id)
        r = client.post(
            f"{ONE_CLICK}?token={token}",
            content="List-Unsubscribe=One-Click",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert r.status_code == 200
        assert _opt_out(db, producer.id) is True

    def test_get_changes_nothing_and_lands_on_the_page(self, client, db):
        producer, _ = _business(db)
        token = wos.create_unsubscribe_token(producer.id)
        r = client.get(f"{ONE_CLICK}?token={token}", follow_redirects=False)
        assert r.status_code == 303
        loc = urlparse(r.headers["location"])
        assert loc.path.endswith(wos.UNSUBSCRIBE_PATH)
        assert loc.netloc == urlparse(settings.frontend_url).netloc
        assert parse_qs(loc.query)["token"] == [token]
        assert _opt_out(db, producer.id) is False

    def test_get_with_a_garbage_token_stays_on_our_page(self, client):
        r = client.get(f"{ONE_CLICK}?token=https://evil.example/x", follow_redirects=False)
        assert r.status_code == 303
        loc = urlparse(r.headers["location"])
        assert loc.netloc == urlparse(settings.frontend_url).netloc
        assert loc.path.endswith(wos.UNSUBSCRIBE_PATH)

    def test_bad_token_is_400(self, client, db):
        producer, _ = _business(db)
        assert client.post(f"{ONE_CLICK}?token=not-a-jwt").status_code == 400
        assert _opt_out(db, producer.id) is False


class TestHeaders:
    def test_summary_email_carries_list_unsubscribe(self):
        make_id = uuid.uuid4()
        token = wos.create_unsubscribe_token(make_id)
        h = wos.unsubscribe_headers("https://mehamakor.co.il", token)
        assert h["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
        url = h["List-Unsubscribe"]
        assert url.startswith("<https://mehamakor.co.il/api" + ONE_CLICK + "?")
        assert url.endswith(">")
        sent_token = parse_qs(urlparse(url[1:-1]).query)["token"][0]
        assert wos.decode_unsubscribe_token(sent_token) == make_id

    def test_send_weekly_summaries_passes_the_headers(self, db, monkeypatch):
        producer, _ = _business(db)
        for i in range(wos.MIN_VIEWS):  # MEH-3476: enough views to send
            db.add(
                ProducerPageView(
                    producer_id=producer.id,
                    viewer_ip_hash=f"{i:064d}",
                    created_at=israel_days_ago(1),
                )
            )
        db.commit()
        calls: list[dict] = []

        def fake_send(to, subject, body, **kwargs):
            calls.append(kwargs)

        monkeypatch.setattr(wos, "send_email", fake_send)
        monkeypatch.setattr(wos, "_sleep", lambda _s: None)
        wos.send_weekly_summaries(db)
        assert len(calls) == 1
        url = calls[0]["headers"]["List-Unsubscribe"]
        token = parse_qs(urlparse(url[1:-1]).query)["token"][0]
        assert wos.decode_unsubscribe_token(token) == producer.id


@pytest.fixture
def resend_box(monkeypatch):
    box: list[dict] = []
    monkeypatch.setattr(settings, "resend_api_key", "re_meh3212_test")
    monkeypatch.setattr(settings, "railway_environment", "production")

    class _Emails:
        @staticmethod
        def send(params):
            box.append(params)

    monkeypatch.setattr(
        email_module, "configure_resend", lambda key: SimpleNamespace(Emails=_Emails)
    )
    return box


class TestSendEmailHeaders:
    def test_headers_reach_resend_and_keep_the_html_encoding(self, resend_box):
        email_module.send_email(
            "owner@mehamakor-mail.co.il", "s", "b", html="<p>x</p>",
            headers={"List-Unsubscribe": "<https://x/y>"},
        )
        assert len(resend_box) == 1
        assert resend_box[0]["headers"] == {
            "Content-Transfer-Encoding": "base64",
            "List-Unsubscribe": "<https://x/y>",
        }

    def test_no_headers_leaves_the_payload_unchanged(self, resend_box):
        # MEH-3587: a text send now carries the layout html, and every html
        # send carries the MEH-2151 CTE header. No caller header is added.
        email_module.send_email("owner@mehamakor-mail.co.il", "s", "b")
        assert len(resend_box) == 1
        assert resend_box[0]["headers"] == {"Content-Transfer-Encoding": "base64"}

    def test_send_email_result_payload_unchanged(self, resend_box):
        assert email_module.send_email_result(
            "owner@mehamakor-mail.co.il", "s", "b", html="<p>x</p>"
        ) == "sent"
        assert resend_box[0]["headers"] == {"Content-Transfer-Encoding": "base64"}


class TestSiteFlag:
    def test_env_var_turns_the_summary_on(self, monkeypatch):
        """Before the config field existed, pydantic dropped the variable and
        the summary could never be turned on (MEH-3212)."""
        from app.config import Settings

        monkeypatch.setenv("WEEKLY_OWNER_SUMMARY_ENABLED", "true")
        assert Settings().weekly_owner_summary_enabled is True
        monkeypatch.setenv("WEEKLY_OWNER_SUMMARY_ENABLED", "false")
        assert Settings().weekly_owner_summary_enabled is False

    def test_gate_reads_the_field(self, monkeypatch):
        monkeypatch.setattr(settings, "weekly_owner_summary_enabled", True)
        assert wos.summary_enabled() is True
        monkeypatch.setattr(settings, "weekly_owner_summary_enabled", False)
        assert wos.summary_enabled() is False
