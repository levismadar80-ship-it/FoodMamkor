"""MEH-509 PR1 — producer_welcome_v1 + producer_approved_v1 WhatsApp hooks.

Replaces the free-text welcome (MEH-287/508) with the Meta-approved
``producer_welcome_v1`` template at signup, and adds a symmetric
``producer_approved_v1`` send on admin approval.

Both calls must be fail-open: WhatsApp failure (HTTP error, raise, etc.)
must never break the signup or approval flow.

Mocking convention follows tests/test_whatsapp_notify.py:48-73 — stub
``app.services.whatsapp.httpx.post`` so the background task / sync call
never hits Meta Graph. A capture list records every POST payload so
tests can assert template name + body params without depending on
internals of send_template.
"""
from __future__ import annotations

from unittest.mock import MagicMock

from tests.conftest import auth_header, make_producer, make_user


VALID_PRODUCER_UPGRADE_REG = {
    "producer_name": "חוות MEH-509",
    "phone": "0501234567",
    "category_ids": [],
    "primary_contact_method": "whatsapp",
}


def _install_whatsapp_capture(monkeypatch, *, should_raise: bool = False):
    """Patch httpx.post + whatsapp env; return list that captures payloads."""
    from app.routers import auth as auth_module

    monkeypatch.setattr(auth_module.settings, "whatsapp_phone_number_id", "PNID_fake")
    monkeypatch.setattr(auth_module.settings, "whatsapp_access_token", "token_fake")

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


# ---------- Signup welcome ----------------------------------------------------


def test_signup_with_phone_fires_welcome_template(client, db, monkeypatch):
    captured = _install_whatsapp_capture(monkeypatch)
    user = make_user(db, email="meh509-signup-a@example.com")

    resp = client.post(
        "/auth/register/producer",
        json=VALID_PRODUCER_UPGRADE_REG,
        headers=auth_header(user),
    )

    assert resp.status_code == 200
    assert resp.json()["whatsapp_sent"] is True
    # Exactly one outbound Meta call — the welcome template.
    assert len(captured) == 1
    payload = captured[0]["json"]
    assert payload["type"] == "template"
    assert payload["template"]["name"] == "producer_welcome_v1"
    assert payload["template"]["language"]["code"] == "he"
    params = payload["template"]["components"][0]["parameters"]
    # MEH-509 PR1 prod-fix: template signature is 1 param (name only).
    # Pre-fix shape sent [name, dashboard_url] → Meta 400 "expected 1".
    assert [p["text"] for p in params] == ["חוות MEH-509"]


def test_signup_without_phone_skips_welcome(client, db, monkeypatch):
    captured = _install_whatsapp_capture(monkeypatch)
    user = make_user(db, email="meh509-signup-b@example.com")

    payload = {
        **VALID_PRODUCER_UPGRADE_REG,
        "primary_contact_method": "email",
        "contact_email": "nophone@example.com",
    }
    payload.pop("phone", None)

    resp = client.post(
        "/auth/register/producer",
        json=payload,
        headers=auth_header(user),
    )

    assert resp.status_code == 200
    assert resp.json()["whatsapp_sent"] is False
    # No phone → preflight skip → no Meta call at all.
    assert captured == []


def test_signup_whatsapp_failure_does_not_break_signup(client, db, monkeypatch):
    captured = _install_whatsapp_capture(monkeypatch, should_raise=True)
    user = make_user(db, email="meh509-signup-c@example.com")

    resp = client.post(
        "/auth/register/producer",
        json=VALID_PRODUCER_UPGRADE_REG,
        headers=auth_header(user),
    )

    # Meta call exploded; signup still succeeded.
    assert resp.status_code == 200
    assert resp.json()["access_token"]
    assert len(captured) == 1  # the attempt happened, just raised


def test_signup_does_not_send_both_text_and_template(client, db, monkeypatch):
    """Regression guard: PR1 replaces the free-text welcome with the
    template; the producer must not receive two welcome messages."""
    captured = _install_whatsapp_capture(monkeypatch)
    user = make_user(db, email="meh509-signup-d@example.com")

    resp = client.post(
        "/auth/register/producer",
        json=VALID_PRODUCER_UPGRADE_REG,
        headers=auth_header(user),
    )

    assert resp.status_code == 200
    # Exactly one producer-facing send. (admin_whatsapp_to is unset in
    # tests, so notify_admin_new_producer adds nothing here.)
    assert len(captured) == 1
    # And it's the template, not the legacy free-text path.
    assert captured[0]["json"]["type"] == "template"
    assert all(c["json"].get("type") != "text" for c in captured)


# ---------- Approval template -------------------------------------------------


def _approve(client, db, *, slug: str | None, phone: str | None = "0501112222"):
    admin = make_user(db, role="admin", email=f"admin-{slug or 'noslug'}@example.com")
    producer = make_producer(db, name="חוות האישור", status="pending")
    producer.phone = phone
    producer.slug = slug
    db.commit()
    db.refresh(producer)
    resp = client.post(
        f"/admin/producers/{producer.id}/approve",
        headers=auth_header(admin),
    )
    return resp, producer


def test_approve_fires_approval_template(client, db, monkeypatch):
    captured = _install_whatsapp_capture(monkeypatch)
    resp, producer = _approve(client, db, slug="havat-haishur")

    assert resp.status_code == 200
    assert resp.json() == {"detail": "Producer approved"}
    # Exactly one Meta send — the producer's approval template.
    # admin_whatsapp_to is unset in tests, so the admin notification
    # short-circuits without an HTTP call.
    assert len(captured) == 1
    payload = captured[0]["json"]
    assert payload["template"]["name"] == "producer_approved_v1"
    assert payload["template"]["language"]["code"] == "he"
    params = payload["template"]["components"][0]["parameters"]
    # MEH-509 PR1 prod-fix: template signature is 1 param (name only).
    # Pre-fix shape sent [name, page_url] → Meta 400 "expected 1".
    assert [p["text"] for p in params] == ["חוות האישור"]


def test_approve_with_null_slug_still_fires_with_name_only(client, db, monkeypatch):
    """Approval must still fire when slug is null. MEH-509 PR1 prod-fix
    dropped the slug-vs-id URL branch entirely (URL no longer sent), so
    the slug=null path must behave identically to the slug=set path:
    exactly one Meta call, exactly one body param (the producer name)."""
    captured = _install_whatsapp_capture(monkeypatch)
    resp, _ = _approve(client, db, slug=None)

    assert resp.status_code == 200
    assert len(captured) == 1
    params = captured[0]["json"]["template"]["components"][0]["parameters"]
    assert [p["text"] for p in params] == ["חוות האישור"]


def test_approve_whatsapp_failure_does_not_break_approval(client, db, monkeypatch):
    captured = _install_whatsapp_capture(monkeypatch, should_raise=True)
    resp, _ = _approve(client, db, slug="will-fail")

    # Approval committed, response 200, even though Meta raised.
    assert resp.status_code == 200
    assert len(captured) == 1


# ---------- Param-count regression guards (MEH-509 PR1 prod-fix) --------------
# Tight assertion that both producer-facing templates send exactly ONE body
# parameter. Drift in either direction (back to 2 params, or down to 0)
# would trigger a Meta 400 in prod; these tests catch it pre-merge.


def test_welcome_sends_exactly_one_body_param(client, db, monkeypatch):
    captured = _install_whatsapp_capture(monkeypatch)
    user = make_user(db, email="meh509-param-guard-welcome@example.com")

    resp = client.post(
        "/auth/register/producer",
        json=VALID_PRODUCER_UPGRADE_REG,
        headers=auth_header(user),
    )

    assert resp.status_code == 200
    assert len(captured) == 1
    params = captured[0]["json"]["template"]["components"][0]["parameters"]
    assert len(params) == 1, (
        f"producer_welcome_v1 expects exactly 1 body param; got {len(params)}. "
        "Adding/removing params requires a matching template update in Meta."
    )


def test_approval_sends_exactly_one_body_param(client, db, monkeypatch):
    captured = _install_whatsapp_capture(monkeypatch)
    resp, _ = _approve(client, db, slug="param-guard-slug")

    assert resp.status_code == 200
    assert len(captured) == 1
    params = captured[0]["json"]["template"]["components"][0]["parameters"]
    assert len(params) == 1, (
        f"producer_approved_v1 expects exactly 1 body param; got {len(params)}. "
        "Adding/removing params requires a matching template update in Meta."
    )
