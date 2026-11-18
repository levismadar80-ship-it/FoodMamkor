"""MEH-3402 follow-up: a WhatsApp message dropped outside production is
recorded with its content, so it can be checked on /admin without being sent.

Production must stay byte-identical (nothing recorded, the send goes out).
The conftest autouse `_outbound_guard_as_production` pins the guard to
production; the `staging` fixture here pins it back to staging.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.config import settings
from app.models.models import OutboundMessage
from app.services import outbound_guard, whatsapp
from app.services.whatsapp_templates import OtpCodeV1, ProducerWelcomeV1
from app.utils.clock import utc_now
from datetime import timedelta
from conftest import auth_header, make_user

REAL = "+972541112233"
_ENDPOINT = "/admin/whatsapp/blocked"


@pytest.fixture
def staging(monkeypatch):
    monkeypatch.setattr(outbound_guard, "is_production", lambda: False)
    monkeypatch.setattr(settings, "admin_whatsapp_to", "0501234567")
    monkeypatch.setattr(settings, "otp_test_numbers", "")
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "pid")
    monkeypatch.setattr(settings, "whatsapp_access_token", "tok")
    http = MagicMock()
    monkeypatch.setattr(whatsapp.httpx, "post", http)
    return http


def _rows(db):
    db.expire_all()
    return db.query(OutboundMessage).all()


def test_blocked_text_is_recorded_with_its_body(staging, db):
    assert whatsapp.send_text(REAL, "ההזמנה שלך אושרה") is False
    assert not staging.called
    rows = _rows(db)
    assert len(rows) == 1
    assert rows[0].status == whatsapp.OUTCOME_BLOCKED_NON_PROD
    assert rows[0].kind == "text"
    assert rows[0].error_message == "ההזמנה שלך אושרה"
    assert rows[0].to_phone == "972541112233"


def test_blocked_template_is_recorded_with_name_and_params(staging, db):
    template = ProducerWelcomeV1(producer_name="משק הגליל")
    assert whatsapp.send_template("0541112233", template) is False
    rows = _rows(db)
    assert len(rows) == 1
    assert rows[0].kind == "template[producer_welcome_v1]"
    assert rows[0].error_message == "producer_welcome_v1: משק הגליל"


def test_a_login_code_is_never_stored(staging, client, db):
    assert whatsapp.send_template(REAL, OtpCodeV1(code="482913")) is False
    rows = _rows(db)
    assert len(rows) == 1
    assert rows[0].error_message == "producer_otp_v1: ******"
    admin = make_user(db, role="admin")
    resp = client.get(_ENDPOINT, headers=auth_header(admin))
    assert resp.status_code == 200
    assert "482913" not in resp.text


def test_a_retried_send_is_recorded_once(staging, db):
    for _ in range(3):
        whatsapp.send_text(REAL, "תזכורת")
    whatsapp.send_text(REAL, "הודעה אחרת")
    assert sorted(r.error_message for r in _rows(db)) == ["הודעה אחרת", "תזכורת"]


def test_rows_past_the_window_are_dropped_on_the_next_capture(staging, db):
    old = OutboundMessage(
        to_phone="972500000000", kind="text", status=whatsapp.OUTCOME_BLOCKED_NON_PROD,
        error_message="ישנה",
    )
    old.created_at = utc_now() - timedelta(days=8)
    kept = OutboundMessage(to_phone="972500000000", kind="text", status="failed")
    kept.created_at = utc_now() - timedelta(days=8)
    db.add_all([old, kept])
    db.commit()
    whatsapp.send_text(REAL, "חדשה")
    assert sorted((r.status, r.error_message) for r in _rows(db)) == [
        ("blocked_nonprod", "חדשה"),
        ("failed", None),
    ]


def test_allowed_number_is_sent_not_recorded_as_blocked(staging, db, monkeypatch):
    sent = []
    monkeypatch.setattr(whatsapp, "_post", lambda p, *, kind, to: sent.append(to) or True)
    assert whatsapp.send_text("0501234567", "שלום") is True
    assert sent == ["0501234567"]
    assert _rows(db) == []


def test_production_records_nothing_blocked(staging, db, monkeypatch):
    monkeypatch.setattr(outbound_guard, "is_production", lambda: True)
    monkeypatch.setattr(whatsapp, "_post", lambda p, *, kind, to: True)
    assert whatsapp.send_text(REAL, "שלום") is True
    assert _rows(db) == []


def test_a_db_error_never_breaks_the_caller(staging, monkeypatch):
    def boom():
        raise RuntimeError("db down")

    monkeypatch.setattr("app.database.SessionLocal", boom)
    assert whatsapp.send_text(REAL, "שלום") is False


# ── admin list ─────────────────────────────────────────────────────────


def test_admin_sees_blocked_rows_newest_first(staging, client, db):
    whatsapp.send_text(REAL, "ראשונה")
    whatsapp.send_text(REAL, "שנייה")
    admin = make_user(db, role="admin")
    resp = client.get(_ENDPOINT, headers=auth_header(admin))
    assert resp.status_code == 200
    assert [row["error_message"] for row in resp.json()] == ["שנייה", "ראשונה"]


def test_blocked_rows_stay_out_of_the_undelivered_list(staging, client, db):
    whatsapp.send_text(REAL, "נחסמה")
    admin = make_user(db, role="admin")
    r = client.get("/admin/whatsapp/failed", headers=auth_header(admin))
    assert r.status_code == 200
    assert r.json() == []


def test_consumer_gets_403(client, db):
    user = make_user(db, role="consumer")
    resp = client.get(_ENDPOINT, headers=auth_header(user))
    assert resp.status_code == 403


def test_producer_role_also_blocked(client, db):
    producer = make_user(db, role="producer")
    resp = client.get(_ENDPOINT, headers=auth_header(producer))
    assert resp.status_code == 403


def test_unauthenticated_gets_401(client):
    resp = client.get(_ENDPOINT)
    assert resp.status_code == 401
