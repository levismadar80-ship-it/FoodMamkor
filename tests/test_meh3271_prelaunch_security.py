"""Pre-launch security pass (Refs MEH-3271).

Three kinds of check, each on behaviour:

1. Every route mounted under an /admin segment is gated by ``require_admin``
   — walked over the whole app, GET included. The older hand-written list
   (test_expansion_admin_authz.py) covers ~15 mutating routes; a new admin GET
   with no guard passed every test.
2. Public request bodies refuse oversized text with a 422 instead of reaching
   the database column (500) or the moderation model (cost).
3. User A never reads or changes user B's data on the per-user surfaces that
   had no two-user test: favorites, alert preferences, the business dashboard
   and name-change requests.
"""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("ENV", "test")

# REUSES: tests/test_meh3022_resource_caps.py:39 — the route collector.
_SPEC = importlib.util.spec_from_file_location(
    "action_map", ROOT / "scripts" / "release" / "action_map.py"
)
am = importlib.util.module_from_spec(_SPEC)
sys.modules.setdefault("action_map", am)
_SPEC.loader.exec_module(am)

from app.models.models import Favorite, ProducerNameChangeRequest  # noqa: E402
from conftest import (  # noqa: E402
    auth_header,
    make_producer,
    make_user,
    valid_producer_register_payload,
    valid_user_register_payload,
)

# --------------------------------------------------------------------------
# 1 — every /admin route is admin-gated
# --------------------------------------------------------------------------


def _admin_routes():
    return [
        r
        for r in am.collect_routes(am.load_app())
        if "admin" in [seg for seg in r.path.split("/") if seg]
    ]


def test_admin_walker_control_sees_the_admin_surface():
    routes = _admin_routes()
    assert len(routes) > 50, "collector found almost no admin routes — the guard is void"
    methods = {m for r in routes for m in r.methods}
    assert "GET" in methods and "POST" in methods
    dashboard = [r for r in routes if r.path == "/admin/dashboard"]
    assert dashboard and "require_admin" in dashboard[0].deps


def test_every_admin_route_requires_admin():
    unguarded = sorted(
        f"{','.join(sorted(r.methods))} {r.path}"
        for r in _admin_routes()
        if "require_admin" not in r.deps
    )
    assert unguarded == [], f"/admin routes without require_admin: {unguarded}"


def test_a_business_owner_is_refused_on_admin_reads(client, db):
    """The guard above reads the dependency tree; this one asks the server."""
    owner = make_user(db, role="producer")
    for path in ("/admin/dashboard", "/admin/users", "/admin/name-change-requests"):
        assert client.get(path, headers=auth_header(owner)).status_code == 403, path
        assert client.get(path).status_code == 401, path


# --------------------------------------------------------------------------
# 2 — oversized public input is a 422, never a 500 and never a model call
# --------------------------------------------------------------------------


def test_validate_experience_refuses_an_oversized_description(client):
    res = client.post(
        "/experiences/validate",
        json={"title": "סדנת אפייה", "description": "א" * 5001},
    )
    assert res.status_code == 422


@pytest.mark.parametrize("field", ["category", "city", "location_type"])
def test_validate_experience_refuses_oversized_short_fields(client, field):
    res = client.post(
        "/experiences/validate", json={"title": "סדנת אפייה", field: "א" * 201}
    )
    assert res.status_code == 422


def test_validate_experience_still_accepts_a_normal_body(client, monkeypatch):
    import app.routers.experiences as experiences_router

    monkeypatch.setattr(
        experiences_router,
        "validate_experience",
        lambda *a, **k: {"status": "APPROVED"},
        raising=False,
    )
    res = client.post(
        "/experiences/validate",
        json={"title": "סדנת אפייה", "description": "א" * 5000, "city": "ח" * 100},
    )
    assert res.status_code == 200


@pytest.mark.parametrize(
    ("field", "value"),
    [("website", "https://example.com/" + "a" * 200), ("instagram", "a" * 101)],
)
def test_business_signup_refuses_an_overlong_link(client, field, value):
    payload = valid_producer_register_payload()
    payload[field] = value
    res = client.post("/auth/register/producer", json=payload)
    assert res.status_code == 422, res.text[:200]


def test_consumer_signup_refuses_an_overlong_city(client):
    payload = valid_user_register_payload()
    payload["city"] = "ע" * 101
    res = client.post("/auth/register", json=payload)
    assert res.status_code == 422, res.text[:200]


def test_login_with_a_nul_byte_in_the_password_is_a_plain_401(client, db):
    user = make_user(db, email="nul@example.com")
    res = client.post(
        "/auth/login", json={"email": user.email, "password": "Zx7Yp9\x00Mq2Lr4"}
    )
    assert res.status_code == 401
    # control: the real password still logs in
    ok = client.post("/auth/login", json={"email": user.email, "password": "Zx7Yp9Mq2Lr4"})
    assert ok.status_code == 200


def test_signup_with_a_nul_byte_in_the_password_is_a_422(client):
    payload = valid_user_register_payload()
    payload["password"] = "Zx7Yp9\x00Mq2Lr4xx"
    res = client.post("/auth/register", json=payload)
    assert res.status_code == 422, res.text[:200]


def test_password_change_to_a_nul_password_is_a_422(client, db):
    user = make_user(db, email="change@example.com")
    res = client.patch(
        "/users/me/password",
        json={"current_password": "Zx7Yp9Mq2Lr4", "new_password": "Zx7Yp9\x00Mq2Lr4xx"},
        headers=auth_header(user),
    )
    assert res.status_code == 422, res.text[:200]


# --------------------------------------------------------------------------
# 3 — user A never reads or changes user B's data
# --------------------------------------------------------------------------


def test_favorites_are_per_user(client, db):
    a, b = make_user(db), make_user(db)
    business = make_producer(db)
    assert client.post(f"/users/me/favorites/{business.id}", headers=auth_header(b)).status_code == 201

    # A reads her own (empty) list, not B's.
    listed = client.get("/users/me/favorites", headers=auth_header(a))
    assert listed.status_code == 200 and listed.json() == []

    # A removing "the same business" does not remove B's row.
    client.delete(f"/users/me/favorites/{business.id}", headers=auth_header(a))
    assert db.query(Favorite).filter(Favorite.user_id == b.id).count() == 1
    assert len(client.get("/users/me/favorites", headers=auth_header(b)).json()) == 1


def test_alert_preferences_are_per_user(client, db):
    a, b = make_user(db), make_user(db)
    business = make_producer(db)
    client.post(f"/users/me/favorites/{business.id}", headers=auth_header(b))
    set_b = client.put(
        f"/users/me/favorites/{business.id}/alerts",
        json={"notify_new_product": False},
        headers=auth_header(b),
    )
    assert set_b.status_code == 200

    # A has no favorite there, so she can neither write nor inherit B's prefs.
    write_a = client.put(
        f"/users/me/favorites/{business.id}/alerts",
        json={"notify_new_product": True},
        headers=auth_header(a),
    )
    assert write_a.status_code == 400
    again = client.get(f"/users/me/favorites/{business.id}/alerts", headers=auth_header(b))
    assert again.status_code == 200 and again.json()["notify_new_product"] is False


def _owner_of(db, business):
    owner = make_user(db, role="producer")
    owner.producer_id = business.id
    owner.is_producer = True
    db.commit()
    return owner


def test_the_dashboard_shows_only_the_callers_business(client, db):
    biz_a, biz_b = make_producer(db, name="משק אלף"), make_producer(db, name="משק בית")
    owner_a, owner_b = _owner_of(db, biz_a), _owner_of(db, biz_b)
    fan = make_user(db)
    client.post(f"/users/me/favorites/{biz_b.id}", headers=auth_header(fan))

    mine = client.get("/producers/me", headers=auth_header(owner_a))
    assert mine.status_code == 200 and mine.json()["id"] == str(biz_a.id)

    dash_a = client.get("/producers/me/dashboard", headers=auth_header(owner_a)).json()
    dash_b = client.get("/producers/me/dashboard", headers=auth_header(owner_b)).json()
    assert str(biz_b.id) not in str(dash_a)
    # B's favorite is counted for B and not for A.
    assert dash_b["favorites_count"] == 1 and dash_a["favorites_count"] == 0

    # A consumer has no dashboard at all.
    assert client.get("/producers/me/dashboard", headers=auth_header(fan)).status_code == 403


def test_name_change_requests_are_per_business(client, db):
    biz_a, biz_b = make_producer(db, name="משק אלף"), make_producer(db, name="משק בית")
    owner_a, owner_b = _owner_of(db, biz_a), _owner_of(db, biz_b)
    made = client.post(
        "/producers/me/name-change-requests",
        json={"requested_name": "משק בית החדש", "reason": "מיתוג"},
        headers=auth_header(owner_b),
    )
    assert made.status_code == 201

    # A sees none of B's requests, and cannot decide one (admin only).
    assert client.get("/producers/me/name-change-requests", headers=auth_header(owner_a)).json() == []
    decide = client.patch(
        f"/admin/name-change-requests/{made.json()['id']}",
        json={"status": "approved"},
        headers=auth_header(owner_a),
    )
    assert decide.status_code == 403
    row = db.query(ProducerNameChangeRequest).one()
    assert row.status == "pending" and row.producer_id == biz_b.id
