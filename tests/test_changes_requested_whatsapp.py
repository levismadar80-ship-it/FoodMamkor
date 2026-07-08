"""MEH-1051 — producer_changes_requested_v1 WhatsApp hook on request-changes.

The MEH-1011 admin request-changes endpoint notified the producer by
email only; MEH-1051 mirrors notify_producer_approved with the
Meta-approved ``producer_changes_requested_v1`` template (UTILITY, he,
2 body params: business name + what's missing, NO buttons).

Fail-open contract: WhatsApp failure (missing phone, HTTP raise) must
never break the admin 200.

Mocking convention follows tests/test_meh_509_pr1_hooks.py — stub
``app.services.whatsapp.httpx.post`` and capture every POST payload so
tests assert template name + body params without depending on
send_template internals.
"""
from __future__ import annotations

from unittest.mock import MagicMock

from app.services.auth_notifications import notify_producer_changes_requested

from tests.conftest import auth_header, make_producer, make_user


def _install_whatsapp_capture(monkeypatch, *, should_raise: bool = False):
    """Patch httpx.post + whatsapp env; return list that captures payloads."""
    from app.config import settings

    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "PNID_fake")
    monkeypatch.setattr(settings, "whatsapp_access_token", "token_fake")
    # Keep the endpoint's separate admin-notify send out of the capture.
    monkeypatch.setattr(settings, "admin_whatsapp_to", "")

    captured: list[dict] = []

    def _fake_post(url, *, json=None, headers=None, timeout=None):
        captured.append({"url": url, "json": json, "headers": headers})
        if should_raise:
            import httpx

            raise httpx.HTTPError("simulated meta 5xx")
        resp = MagicMock(status_code=200)
        resp.raise_for_status = lambda: None
        return resp

    monkeypatch.setattr("app.services.whatsapp.httpx.post", _fake_post)
    return captured


def _pending_producer_with_phone(db, phone="0501234567"):
    producer = make_producer(db, name="חוות MEH-1051", status="pending")
    producer.phone = phone
    db.commit()
    db.refresh(producer)
    return producer


def _request_changes(client, admin, producer, feedback):
    return client.post(
        f"/admin/producers/{producer.id}/request-changes",
        json={"feedback": feedback},
        headers=auth_header(admin),
    )


def test_sends_exactly_two_body_params_in_order(client, db, monkeypatch):
    captured = _install_whatsapp_capture(monkeypatch)
    admin = make_user(db, role="admin")
    producer = _pending_producer_with_phone(db)

    resp = _request_changes(client, admin, producer, "חסרה תמונה של העסק")

    assert resp.status_code == 200
    # Exactly one outbound Meta call — the producer template (admin send off).
    assert len(captured) == 1
    payload = captured[0]["json"]
    assert payload["type"] == "template"
    assert payload["template"]["name"] == "producer_changes_requested_v1"
    assert payload["template"]["language"]["code"] == "he"
    components = payload["template"]["components"]
    # Exactly one body block, no button component (un-approved button → Meta 400).
    assert [c["type"] for c in components] == ["body"]
    params = components[0]["parameters"]
    assert [p["text"] for p in params] == ["חוות MEH-1051", "חסרה תמונה של העסק"]


def test_multiline_feedback_arrives_sanitized_single_line(client, db, monkeypatch):
    captured = _install_whatsapp_capture(monkeypatch)
    admin = make_user(db, role="admin")
    producer = _pending_producer_with_phone(db)

    resp = _request_changes(
        client, admin, producer, "חסרה תמונה\r\nוגם\tמספר רישיון    יצרן"
    )

    assert resp.status_code == 200
    params = captured[0]["json"]["template"]["components"][0]["parameters"]
    # Meta rejects newline/tab/4+ consecutive spaces in params.
    assert params[1]["text"] == "חסרה תמונה וגם מספר רישיון יצרן"


def test_no_phone_skips_send_and_endpoint_still_200(client, db, monkeypatch):
    captured = _install_whatsapp_capture(monkeypatch)
    admin = make_user(db, role="admin")
    producer = make_producer(db, name="בלי טלפון", status="pending")
    assert producer.phone is None

    resp = _request_changes(client, admin, producer, "חסרה תמונה")

    assert resp.status_code == 200
    assert captured == []
    # Direct unit contract: skip path returns False.
    assert notify_producer_changes_requested("בלי טלפון", None, "חסרה תמונה") is False


def test_meta_raise_is_fail_open_endpoint_still_200(client, db, monkeypatch):
    captured = _install_whatsapp_capture(monkeypatch, should_raise=True)
    admin = make_user(db, role="admin")
    producer = _pending_producer_with_phone(db)

    resp = _request_changes(client, admin, producer, "חסרה תמונה")

    assert resp.status_code == 200
    assert len(captured) == 1  # the attempt happened, the raise was swallowed
    db.refresh(producer)
    assert producer.requested_changes == "חסרה תמונה"  # commit preceded the send


def test_feedback_truncated_to_550_chars(client, db, monkeypatch):
    captured = _install_whatsapp_capture(monkeypatch)
    admin = make_user(db, role="admin")
    producer = _pending_producer_with_phone(db)
    long_feedback = "א" * 600

    resp = _request_changes(client, admin, producer, long_feedback)

    assert resp.status_code == 200
    params = captured[0]["json"]["template"]["components"][0]["parameters"]
    assert len(params[1]["text"]) == 550
    assert params[1]["text"] == "א" * 550
