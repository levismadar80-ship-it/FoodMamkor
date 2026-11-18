"""MEH-3402: outside production no message reaches a real person.

Each sender is driven end to end with its transport mocked, in both
environments: staging must not reach the real recipient, production must be
byte-identical to before. The conftest autouse `_outbound_guard_as_production`
is skipped for this file, so the environment here is whatever each test sets.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.config import settings
from app.services import email as email_mod
from app.services import newsletter_sync, outbound_guard, push, whatsapp
from app.services.whatsapp_templates import ProducerWelcomeV1

ADMIN = "sapir.admin@gmail.com"
REAL_OWNER = "owner@realfarm.co.il"


@pytest.fixture
def staging(monkeypatch):
    monkeypatch.setattr(settings, "env", "staging")
    monkeypatch.setattr(settings, "railway_environment", "staging")
    monkeypatch.setattr(settings, "admin_email", ADMIN)
    monkeypatch.setattr(settings, "contact_email", "")
    monkeypatch.setattr(settings, "super_admin_email", "")
    monkeypatch.setattr(settings, "admin_whatsapp_to", "0501234567")
    monkeypatch.setattr(settings, "otp_test_numbers", "+972-52-000-0001")


@pytest.fixture
def production(staging, monkeypatch):
    monkeypatch.setattr(settings, "railway_environment", "production")


@pytest.fixture
def resend_spy(monkeypatch):
    sent: list[dict] = []
    fake = MagicMock()
    fake.Emails.send.side_effect = lambda params: sent.append(params)
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    monkeypatch.setattr(email_mod, "configure_resend", lambda _key: fake)
    return sent


# ── environment detection ────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("env", "railway", "expected"),
    [
        ("production", "", True),
        ("development", "production", True),
        ("development", "Production ", True),
        ("staging", "staging", False),
        ("development", "", False),
        ("", "pr-123", False),
        ("  PRODUCTION\n", "", True),
        ("prod", "prod", False),
    ],
)
def test_is_production(monkeypatch, env, railway, expected):
    monkeypatch.setattr(settings, "env", env)
    monkeypatch.setattr(settings, "railway_environment", railway)
    assert outbound_guard.is_production() is expected


# ── email ────────────────────────────────────────────────────────────────


def test_staging_mail_to_real_owner_goes_to_admin_not_owner(staging, resend_spy):
    email_mod.send_email(REAL_OWNER, "העסק שלך אושר", "גוף", reply_to=REAL_OWNER)
    assert len(resend_spy) == 1
    params = resend_spy[0]
    assert params["to"] == ADMIN
    assert params["subject"] == "[STAGING → ***@realfarm.co.il] העסק שלך אושר"
    assert REAL_OWNER not in params["subject"]  # subject reaches logs/Sentry
    assert params["text"].startswith(f"[STAGING] נשלח במקור אל: {REAL_OWNER}")
    assert params["text"].endswith("גוף")
    assert "reply_to" not in params


def test_redirected_html_carries_escaped_original_recipient(staging, resend_spy):
    email_mod.send_email(REAL_OWNER, "נושא", "גוף", html="<b>גוף</b>")
    html = resend_spy[0]["html"]
    assert REAL_OWNER in html
    assert html.endswith("<b>גוף</b>")


@pytest.mark.parametrize("field", ["contact_email", "super_admin_email"])
def test_staging_mail_to_other_staff_addresses_is_delivered(
    staging, resend_spy, monkeypatch, field
):
    monkeypatch.setattr(settings, field, "team@mehamakor.co.il")
    email_mod.send_email("Team+qa@mehamakor.co.il", "נושא", "גוף")
    assert resend_spy[0]["to"] == "Team+qa@mehamakor.co.il"


@pytest.mark.parametrize(
    "to",
    [
        "sapir.admin+x@gmail.com,victim@gmail.com",
        "sapir.admin+x@gmail.com;victim@gmail.com",
        "victim@gmail.com, sapir.admin@gmail.com",
        "Sapir <sapir.admin@gmail.com>",
    ],
)
def test_staging_multi_recipient_string_is_never_allowed(staging, resend_spy, to):
    email_mod.send_email(to, "נושא", "גוף")
    assert resend_spy[0]["to"] == ADMIN


def test_staging_malformed_admin_email_means_not_sent(staging, resend_spy, monkeypatch):
    monkeypatch.setattr(settings, "admin_email", "not-an-address")
    email_mod.send_email(REAL_OWNER, "נושא", "גוף")
    assert resend_spy == []


def test_guard_failure_fails_closed_and_does_not_raise(
    staging, resend_spy, monkeypatch
):
    def boom(*_a, **_k):
        raise RuntimeError("guard broke")

    monkeypatch.setattr(email_mod, "route_email", boom)
    email_mod.send_email(REAL_OWNER, "נושא", "גוף")  # must not raise
    assert resend_spy == []


def test_staging_mail_to_admin_plus_alias_is_delivered_directly(staging, resend_spy):
    alias = "Sapir.Admin+biz1@gmail.com"
    email_mod.send_email(alias, "בדיקה", "גוף", reply_to="x@y.com")
    assert resend_spy[0]["to"] == alias
    assert resend_spy[0]["subject"] == "בדיקה"
    assert resend_spy[0]["reply_to"] == "x@y.com"


def test_staging_mail_without_admin_email_is_not_sent(staging, resend_spy, monkeypatch):
    monkeypatch.setattr(settings, "admin_email", "")
    email_mod.send_email(REAL_OWNER, "נושא", "גוף")
    assert resend_spy == []


def test_production_mail_is_unchanged(production, resend_spy):
    email_mod.send_email(REAL_OWNER, "נושא", "גוף", reply_to="r@x.com")
    assert resend_spy[0]["to"] == REAL_OWNER
    assert resend_spy[0]["subject"] == "נושא"
    assert resend_spy[0]["reply_to"] == "r@x.com"


def test_lookalike_domain_is_not_an_alias(staging, resend_spy):
    email_mod.send_email("sapir.admin@gmail.com.evil.io", "נושא", "גוף")
    assert resend_spy[0]["to"] == ADMIN


# ── WhatsApp ─────────────────────────────────────────────────────────────


@pytest.fixture
def graph_spy(monkeypatch):
    calls: list[str] = []
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "pid")
    monkeypatch.setattr(settings, "whatsapp_access_token", "tok")

    def fake_post(payload, *, kind, to):
        calls.append(to)
        return True

    monkeypatch.setattr(whatsapp, "_post", fake_post)
    return calls


def test_staging_dropped_whatsapp_makes_no_http_and_persists_nothing(
    staging, monkeypatch
):
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "pid")
    monkeypatch.setattr(settings, "whatsapp_access_token", "tok")
    http = MagicMock()
    persist = MagicMock()
    monkeypatch.setattr(whatsapp.httpx, "post", http)
    monkeypatch.setattr(whatsapp, "_persist_outbound", persist)
    assert whatsapp.send_text("+972541112233", "שלום") is False
    assert not http.called
    assert not persist.called


def test_staging_whatsapp_with_no_staff_numbers_sends_nothing(
    staging, graph_spy, monkeypatch
):
    monkeypatch.setattr(settings, "admin_whatsapp_to", "")
    monkeypatch.setattr(settings, "otp_test_numbers", "")
    assert whatsapp.send_text("0501234567", "שלום") is False
    assert whatsapp.send_text("", "שלום") is False
    assert graph_spy == []


def test_staging_whatsapp_to_real_number_is_dropped(staging, graph_spy):
    assert whatsapp.send_text("+972541112233", "שלום") is False
    template = ProducerWelcomeV1(producer_name="משק")
    assert whatsapp.send_template("0541112233", template) is False
    assert graph_spy == []


@pytest.mark.parametrize("to", ["+972501234567", "0501234567", "972520000001"])
def test_staging_whatsapp_to_staff_numbers_is_sent(staging, graph_spy, to):
    assert whatsapp.send_text(to, "שלום") is True
    assert graph_spy == [to]


def test_production_whatsapp_is_unchanged(production, graph_spy):
    assert whatsapp.send_text("+972541112233", "שלום") is True
    assert graph_spy == ["+972541112233"]


# ── push ─────────────────────────────────────────────────────────────────


@pytest.fixture
def webpush_spy(monkeypatch):
    import pywebpush

    calls: list[dict] = []
    monkeypatch.setattr(settings, "vapid_private_key", "priv")
    monkeypatch.setattr(settings, "vapid_public_key", "pub")
    monkeypatch.setattr(pywebpush, "webpush", lambda **kw: calls.append(kw))
    return calls


SUB = {"endpoint": "https://push.example/1", "keys": {"p256dh": "a", "auth": "b"}}


def test_staging_push_is_not_sent(staging, webpush_spy):
    push.send_push_notification(SUB, title="t", body="b")
    assert webpush_spy == []


def test_production_push_is_sent(production, webpush_spy):
    push.send_push_notification(SUB, title="t", body="b")
    assert len(webpush_spy) == 1


# ── newsletter (Resend Contacts) ─────────────────────────────────────────


@pytest.fixture
def contacts_spy(monkeypatch):
    fake = MagicMock()
    monkeypatch.setattr(newsletter_sync, "_resend", lambda: fake)
    monkeypatch.setattr(newsletter_sync, "_get_segment_id", lambda _r: "seg")
    monkeypatch.setattr(newsletter_sync, "_contact_exists", lambda _r, _e: False)
    return fake


def test_staging_newsletter_does_not_touch_resend(staging, contacts_spy):
    newsletter_sync.sync_subscribe(REAL_OWNER)
    newsletter_sync.sync_unsubscribe(REAL_OWNER)
    assert contacts_spy.mock_calls == []


def test_production_newsletter_syncs(production, contacts_spy):
    newsletter_sync.sync_subscribe(REAL_OWNER)
    assert contacts_spy.Contacts.create.called
