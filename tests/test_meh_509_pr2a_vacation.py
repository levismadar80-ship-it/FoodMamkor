"""MEH-509 PR2a — vacation mode (typed wrapper over AdminSetting).

State machine sanity, auth gating, and the "active requires return_date"
422 guard. The store underneath is the existing `admin_settings` key-value
table (one source of truth shared with `friday_mode_override` et al.) —
these tests intentionally don't poke the raw rows; they exercise the
typed GET/POST surface that the frontend and PR2b watchdog will use.
"""
from __future__ import annotations

from tests.conftest import auth_header, make_user


def _admin(db, *, email_suffix: str):
    return make_user(db, role="admin", email=f"meh509p2a-{email_suffix}@example.com")


def _consumer(db, *, email_suffix: str):
    return make_user(db, role="consumer", email=f"meh509p2a-{email_suffix}@example.com")


# ---------- GET --------------------------------------------------------------


def test_get_vacation_default_inactive(client, db):
    admin = _admin(db, email_suffix="get-default")
    resp = client.get("/admin/settings/vacation", headers=auth_header(admin))
    assert resp.status_code == 200
    assert resp.json() == {"active": False, "return_date": None}


def test_get_requires_admin_auth(client, db):
    resp = client.get("/admin/settings/vacation")
    assert resp.status_code in (401, 403)


def test_get_consumer_role_rejected(client, db):
    consumer = _consumer(db, email_suffix="get-consumer")
    resp = client.get(
        "/admin/settings/vacation", headers=auth_header(consumer)
    )
    assert resp.status_code == 403


# ---------- POST -------------------------------------------------------------


def test_post_activate_vacation(client, db):
    admin = _admin(db, email_suffix="post-activate")
    resp = client.post(
        "/admin/settings/vacation",
        json={"active": True, "return_date": "2026-06-15"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200
    assert resp.json() == {"active": True, "return_date": "2026-06-15"}

    # Round-trip via GET — state persists across requests.
    get_resp = client.get("/admin/settings/vacation", headers=auth_header(admin))
    assert get_resp.status_code == 200
    assert get_resp.json() == {"active": True, "return_date": "2026-06-15"}


def test_post_activate_without_return_date_422(client, db):
    admin = _admin(db, email_suffix="post-noddate")
    resp = client.post(
        "/admin/settings/vacation",
        json={"active": True, "return_date": None},
        headers=auth_header(admin),
    )
    # Pydantic model_validator → 422 with Hebrew detail.
    assert resp.status_code == 422
    body = resp.json()
    # FastAPI shape: {"detail": [{"loc": ..., "msg": "...", "type": ...}]}
    assert any("חופשה" in (item.get("msg") or "") for item in body["detail"])


def test_post_deactivate_clears_return_date(client, db):
    admin = _admin(db, email_suffix="post-deactivate")
    # Activate first
    client.post(
        "/admin/settings/vacation",
        json={"active": True, "return_date": "2026-07-01"},
        headers=auth_header(admin),
    )
    # Now deactivate, with return_date intentionally still in the body
    resp = client.post(
        "/admin/settings/vacation",
        json={"active": False, "return_date": "2026-07-01"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200
    # active=false → return_date cleared by the handler, regardless of payload.
    assert resp.json() == {"active": False, "return_date": None}

    # GET confirms persisted state.
    get_resp = client.get("/admin/settings/vacation", headers=auth_header(admin))
    assert get_resp.json() == {"active": False, "return_date": None}


def test_post_deactivate_without_return_date_ok(client, db):
    """active=false omits return_date entirely → still 200."""
    admin = _admin(db, email_suffix="post-deactivate-bare")
    resp = client.post(
        "/admin/settings/vacation",
        json={"active": False},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200
    assert resp.json() == {"active": False, "return_date": None}


def test_post_requires_admin_auth(client, db):
    resp = client.post(
        "/admin/settings/vacation",
        json={"active": True, "return_date": "2026-06-15"},
    )
    assert resp.status_code in (401, 403)


def test_post_consumer_role_rejected(client, db):
    consumer = _consumer(db, email_suffix="post-consumer")
    resp = client.post(
        "/admin/settings/vacation",
        json={"active": True, "return_date": "2026-06-15"},
        headers=auth_header(consumer),
    )
    assert resp.status_code == 403


def test_get_via_generic_settings_includes_vacation_keys(client, db):
    """The vacation keys are present in GET /admin/settings (allowlist
    DEFAULT_SETTINGS), so the existing admin/settings page can read the
    raw string values too. Cross-check that the new keys ship the
    correct defaults ("false" / "") when no DB rows exist yet."""
    admin = _admin(db, email_suffix="generic-defaults")
    resp = client.get("/admin/settings", headers=auth_header(admin))
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("vacation_mode_active") == "false"
    assert body.get("vacation_return_date") == ""
