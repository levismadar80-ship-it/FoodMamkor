"""MEH-771 Chunk C — admin view of undelivered outbound WhatsApp.

Covers GET /admin/whatsapp/failed:
  - auth chain: admin → 200, consumer → 403, producer → 403, none → 401
    (mirrors tests/test_expansion_admin_authz.py — same require_admin
    chain in app/auth.py:260-265, same get_current_user 401 parent)
  - filter: only status IN ('failed', 'window_expired') is returned;
    'accepted' / 'delivered' / 'window_expired' boundary cases verified
  - window: rows older than 7 days are excluded
  - ordering: newest first (created_at DESC)
  - empty case: 200 with []

`tests/conftest._clean_tables` autouse truncates `outbound_messages`
between tests, so per-test seeding is isolated. No webhook interaction
in this file — Chunk B already covers the reconcile side.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.models import OutboundMessage
from conftest import auth_header, make_user
from app.utils.clock import utc_now


_ENDPOINT = "/admin/whatsapp/failed"


def _seed(
    db,
    *,
    status: str = "failed",
    to_phone: str = "972501112222",
    kind: str = "test.template",
    created_at: datetime | None = None,
    error_code: int | None = None,
    error_message: str | None = None,
    meta_message_id: str | None = None,
) -> OutboundMessage:
    """Seed one outbound_messages row. `created_at` defaults to now()."""
    row = OutboundMessage(
        to_phone=to_phone,
        kind=kind,
        meta_message_id=meta_message_id,
        status=status,
        error_code=error_code,
        error_message=error_message,
    )
    if created_at is not None:
        row.created_at = created_at
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---- auth chain ------------------------------------------------------------


def test_admin_gets_200(client, db):
    admin = make_user(db, role="admin")
    resp = client.get(_ENDPOINT, headers=auth_header(admin))
    assert resp.status_code == 200
    assert resp.json() == []  # empty DB → empty list, not 404


def test_consumer_gets_403(client, db):
    consumer = make_user(db, role="consumer")
    resp = client.get(_ENDPOINT, headers=auth_header(consumer))
    assert resp.status_code == 403


def test_producer_role_also_blocked(client, db):
    """Documents that the guard keys on role == 'admin' specifically,
    not on `is authenticated`. Mirrors test_expansion_admin_authz.py:71."""
    producer = make_user(db, role="producer")
    resp = client.get(_ENDPOINT, headers=auth_header(producer))
    assert resp.status_code == 403


def test_unauthenticated_gets_401(client):
    resp = client.get(_ENDPOINT)
    assert resp.status_code == 401


# ---- status filter ---------------------------------------------------------


def test_returns_failed_rows(client, db):
    admin = make_user(db, role="admin")
    _seed(
        db,
        status="failed",
        to_phone="972501112222",
        kind="producer_welcome_v1",
        error_code=131026,
        error_message="Receiver incapable",
        meta_message_id="wamid.chunkc_failed_01",
    )
    resp = client.get(_ENDPOINT, headers=auth_header(admin))
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    row = body[0]
    assert row["status"] == "failed"
    assert row["to_phone"] == "972501112222"
    assert row["kind"] == "producer_welcome_v1"
    assert row["error_code"] == 131026
    assert row["error_message"] == "Receiver incapable"
    assert row["created_at"] is not None


def test_returns_window_expired_rows(client, db):
    admin = make_user(db, role="admin")
    _seed(db, status="window_expired", meta_message_id="wamid.chunkc_we_01")
    resp = client.get(_ENDPOINT, headers=auth_header(admin))
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["status"] == "window_expired"


def test_excludes_accepted_and_delivered(client, db):
    """Sanity: only the undelivered set is returned, not the healthy ones."""
    admin = make_user(db, role="admin")
    _seed(db, status="accepted", meta_message_id="wamid.chunkc_acc_01")
    _seed(db, status="delivered", meta_message_id="wamid.chunkc_del_01")
    _seed(db, status="failed", meta_message_id="wamid.chunkc_keep_01")

    resp = client.get(_ENDPOINT, headers=auth_header(admin))
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["status"] == "failed"


# ---- 7-day window ----------------------------------------------------------


def test_excludes_rows_older_than_7_days(client, db):
    admin = make_user(db, role="admin")
    eight_days_ago = utc_now() - timedelta(days=8)
    _seed(
        db,
        status="failed",
        kind="kind.too_old",
        created_at=eight_days_ago,
        meta_message_id="wamid.chunkc_old_01",
    )
    # A recent row to confirm the endpoint isn't broken — only the OLD one
    # should be filtered out.
    _seed(
        db,
        status="failed",
        kind="kind.recent",
        meta_message_id="wamid.chunkc_recent_01",
    )

    resp = client.get(_ENDPOINT, headers=auth_header(admin))
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["kind"] == "kind.recent"


def test_includes_row_exactly_at_window_edge(client, db):
    """A row created ~6 days ago is still inside the 7-day window."""
    admin = make_user(db, role="admin")
    six_days_ago = utc_now() - timedelta(days=6)
    _seed(
        db,
        status="failed",
        created_at=six_days_ago,
        meta_message_id="wamid.chunkc_edge_01",
    )

    resp = client.get(_ENDPOINT, headers=auth_header(admin))
    assert resp.status_code == 200
    assert len(resp.json()) == 1


# ---- ordering --------------------------------------------------------------


def test_ordered_newest_first(client, db):
    admin = make_user(db, role="admin")
    two_days_ago = utc_now() - timedelta(days=2)
    five_days_ago = utc_now() - timedelta(days=5)

    _seed(
        db,
        status="failed",
        kind="kind.older",
        created_at=five_days_ago,
        meta_message_id="wamid.chunkc_older_01",
    )
    _seed(
        db,
        status="failed",
        kind="kind.middle",
        created_at=two_days_ago,
        meta_message_id="wamid.chunkc_middle_01",
    )
    _seed(
        db,
        status="window_expired",
        kind="kind.newest",
        meta_message_id="wamid.chunkc_newest_01",
    )

    resp = client.get(_ENDPOINT, headers=auth_header(admin))
    assert resp.status_code == 200
    body = resp.json()
    assert [r["kind"] for r in body] == ["kind.newest", "kind.middle", "kind.older"]


# ---- MEH-2122 Chunk E — stuck `accepted` rows ------------------------------
#
# An `accepted` row becomes final only when Meta's delivery webhook arrives.
# If it never does, the row is stuck: listed here after a day, with the label
# «אין אישור מסירה». The clock is frozen so the day boundary is exact.

_FROZEN_NOW = datetime(2026, 11, 10, 9, 0, tzinfo=timezone.utc)


def _freeze(monkeypatch):
    from app.routers import admin_extra, admin_whatsapp

    monkeypatch.setattr(admin_whatsapp, "utc_now", lambda: _FROZEN_NOW)
    monkeypatch.setattr(admin_extra, "utc_now", lambda: _FROZEN_NOW)


def test_accepted_for_two_days_is_listed_as_stuck(client, db, monkeypatch):
    _freeze(monkeypatch)
    admin = make_user(db, role="admin")
    _seed(db, status="accepted", meta_message_id="wamid.e_stuck", kind="e_stuck", created_at=_FROZEN_NOW - timedelta(days=2))
    _seed(db, status="accepted", meta_message_id="wamid.e_fresh", kind="e_fresh", created_at=_FROZEN_NOW - timedelta(hours=1))
    _seed(db, status="delivered", meta_message_id="wamid.e_deliv", kind="e_deliv", created_at=_FROZEN_NOW - timedelta(days=2))

    body = client.get(_ENDPOINT, headers=auth_header(admin)).json()
    assert [r["kind"] for r in body] == ["e_stuck"]
    assert body[0]["status"] == "accepted"


def test_the_day_boundary_is_exact(client, db, monkeypatch):
    _freeze(monkeypatch)
    admin = make_user(db, role="admin")
    _seed(db, status="accepted", meta_message_id="wamid.e_just_over", kind="e_just_over", created_at=_FROZEN_NOW - timedelta(days=1, minutes=1))
    _seed(db, status="accepted", meta_message_id="wamid.e_just_under", kind="e_just_under", created_at=_FROZEN_NOW - timedelta(hours=23, minutes=59))
    # Exactly one day: not yet stuck (the predicate is a strict `<`).
    _seed(db, status="accepted", meta_message_id="wamid.e_exactly", kind="e_exactly", created_at=_FROZEN_NOW - timedelta(days=1))
    ids = [r["kind"] for r in client.get(_ENDPOINT, headers=auth_header(admin)).json()]
    assert ids == ["e_just_over"]


def test_stuck_older_than_the_window_is_not_listed(client, db, monkeypatch):
    _freeze(monkeypatch)
    admin = make_user(db, role="admin")
    _seed(db, status="accepted", meta_message_id="wamid.e_old", kind="e_old", created_at=_FROZEN_NOW - timedelta(days=8))
    assert client.get(_ENDPOINT, headers=auth_header(admin)).json() == []


def test_admin_home_count_matches_the_list(client, db, monkeypatch):
    """One predicate for both: the admin-home number is the list's length."""
    _freeze(monkeypatch)
    admin = make_user(db, role="admin")
    _seed(db, status="failed", meta_message_id="wamid.e_c_fail", kind="e_c_fail", created_at=_FROZEN_NOW - timedelta(hours=3))
    _seed(db, status="accepted", meta_message_id="wamid.e_c_stuck", kind="e_c_stuck", created_at=_FROZEN_NOW - timedelta(days=3))
    _seed(db, status="accepted", meta_message_id="wamid.e_c_fresh", kind="e_c_fresh", created_at=_FROZEN_NOW - timedelta(hours=3))
    listed = client.get(_ENDPOINT, headers=auth_header(admin)).json()
    stats = client.get("/admin/dashboard", headers=auth_header(admin)).json()["stats"]
    assert len(listed) == 2
    assert stats["undelivered_whatsapp_7d"] == 2
