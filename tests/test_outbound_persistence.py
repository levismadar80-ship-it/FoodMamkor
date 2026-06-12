"""MEH-771 Chunk A — outbound_messages persistence in the send layer.

Asserts that every real WhatsApp send writes one `outbound_messages`
row, with `status` taken from the AUD-009/010 (#991) classification and
the wamid stored as `meta_message_id`. Also pins the fail-open contract:
a persistence-layer error must never turn a real send into a failure, and
an unconfigured (no-op) send must not write a row.

Network is stubbed (`httpx.post` monkeypatched) — no live Graph call. DB
is the per-test-truncated test database via the `db` fixture.
"""

from __future__ import annotations

import httpx

from app.models.models import OutboundMessage
from app.services import whatsapp as wa
from app.services.whatsapp import (
    OUTCOME_ACCEPTED,
    OUTCOME_FAILED,
    OUTCOME_WINDOW_EXPIRED,
)
from app.services.whatsapp_templates import OtpCodeV1


class _FakeResponse:
    def __init__(self, status_code: int, body, *, raise_status: bool = False):
        self.status_code = status_code
        self._body = body
        self._raise_status = raise_status

    def json(self):
        return self._body

    def raise_for_status(self):
        if self._raise_status:
            raise httpx.HTTPStatusError(
                "error",
                request=httpx.Request("POST", "https://graph.facebook.com/x"),
                response=self,  # type: ignore[arg-type]
            )


def _configure(monkeypatch):
    monkeypatch.setattr(wa.settings, "whatsapp_phone_number_id", "PNID")
    monkeypatch.setattr(wa.settings, "whatsapp_access_token", "tok")


def test_send_text_persists_accepted_row(db, monkeypatch):
    _configure(monkeypatch)
    monkeypatch.setattr(
        wa.httpx,
        "post",
        lambda *a, **k: _FakeResponse(200, {"messages": [{"id": "wamid.OK1"}]}),
    )

    assert wa.send_text("+972501234567", "hi") is True

    rows = db.query(OutboundMessage).all()
    assert len(rows) == 1
    row = rows[0]
    assert row.to_phone == "972501234567"  # leading + stripped, like the payload
    assert row.kind == "text"
    assert row.status == OUTCOME_ACCEPTED
    assert row.meta_message_id == "wamid.OK1"
    assert row.error_code is None
    assert row.error_message is None
    assert row.created_at is not None


def test_send_template_persists_with_template_kind(db, monkeypatch):
    _configure(monkeypatch)
    monkeypatch.setattr(
        wa.httpx,
        "post",
        lambda *a, **k: _FakeResponse(200, {"messages": [{"id": "wamid.OTP"}]}),
    )

    assert wa.send_template("+972501234567", OtpCodeV1(code="123456")) is True

    row = db.query(OutboundMessage).one()
    assert row.kind == "template[producer_otp_v1]"
    assert row.status == OUTCOME_ACCEPTED
    assert row.meta_message_id == "wamid.OTP"


def test_window_expired_persists_failure_without_wamid(db, monkeypatch):
    _configure(monkeypatch)
    err_body = {"error": {"code": 131047, "message": "re-engagement"}}
    monkeypatch.setattr(
        wa.httpx,
        "post",
        lambda *a, **k: _FakeResponse(400, err_body, raise_status=True),
    )

    assert wa.send_text("+972501234567", "late") is False

    row = db.query(OutboundMessage).one()
    assert row.status == OUTCOME_WINDOW_EXPIRED
    assert row.error_code == 131047
    assert row.error_message == "re-engagement"
    assert row.meta_message_id is None


def test_transport_error_persists_failed_row(db, monkeypatch):
    _configure(monkeypatch)

    def _boom(*a, **k):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(wa.httpx, "post", _boom)

    assert wa.send_text("+972501234567", "hi") is False

    row = db.query(OutboundMessage).one()
    assert row.status == OUTCOME_FAILED
    assert row.meta_message_id is None
    assert row.error_message is not None


def test_unconfigured_send_persists_nothing(db, monkeypatch):
    # No WHATSAPP_* config → send returns False before any Graph call;
    # there is no real outbound, so no row is written.
    monkeypatch.setattr(wa.settings, "whatsapp_phone_number_id", "")
    monkeypatch.setattr(wa.settings, "whatsapp_access_token", "")

    assert wa.send_text("+972501234567", "hi") is False
    assert db.query(OutboundMessage).count() == 0


def test_persist_failure_is_fail_open(db, monkeypatch):
    # A DB error inside persistence must NOT turn a successful send into a
    # failure (whole-module fail-open contract).
    _configure(monkeypatch)
    monkeypatch.setattr(
        wa.httpx,
        "post",
        lambda *a, **k: _FakeResponse(200, {"messages": [{"id": "wamid.X"}]}),
    )

    def _session_boom(*a, **k):
        raise RuntimeError("db down")

    # _persist_outbound imports SessionLocal at call time from app.database.
    monkeypatch.setattr("app.database.SessionLocal", _session_boom)

    assert wa.send_text("+972501234567", "hi") is True  # send still succeeds
    assert db.query(OutboundMessage).count() == 0
