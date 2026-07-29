"""MEH-1673 — admin-triggered kashrut expiry reminders (dry-run → send).

`POST /admin/kashrut/expiry-reminders` finds businesses whose
`kashrut_expires_at` falls inside the next 30 days and WhatsApps each owner
the `kashrut_expiry_reminder` template. `dry_run` defaults to True, so the
send has to be asked for explicitly.

The three behaviours the ticket names, plus the two counting asserts from
its `<verification_step>`:

| test | what it locks |
|---|---|
| window filtering | only now … now+30d, approved, badged, with a phone |
| dry-run sends nothing | `send_template` call count is exactly ZERO |
| one failure does not stop the batch | the other rows still send |
| response carries no full phone | masked only — the raw digits never ship |

`send_template` is monkeypatched at the router's import site so no test ever
reaches Meta. Pure HTTP/DB, mirroring tests/test_admin_approval_transitions.py.
"""

from datetime import datetime, timedelta

import app.routers.admin_kashrut as kashrut_module
from conftest import auth_header, make_producer, make_user

ENDPOINT = "/admin/kashrut/expiry-reminders"


def _admin(db):
    return make_user(db, role="admin")


def _badged(db, *, days, status="approved", phone="050-123-4567", badges=("badatz",)):
    """An approved, badged producer whose cert expires in `days` days."""
    producer = make_producer(db, status=status)
    producer.phone = phone
    producer.kashrut_badges = list(badges)
    producer.kashrut_expires_at = datetime.utcnow() + timedelta(days=days)
    db.commit()
    db.refresh(producer)
    return producer


def _spy(monkeypatch, *, results=None):
    """Replace send_template with a recorder. `results` maps phone → bool/Exception."""
    calls = []

    def fake_send_template(to, template):
        calls.append((to, template))
        outcome = (results or {}).get(to, True)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(kashrut_module, "send_template", fake_send_template)
    return calls


# --- window filtering ------------------------------------------------------


def test_only_producers_inside_the_30_day_window_are_listed(client, db, monkeypatch):
    _spy(monkeypatch)
    inside = _badged(db, days=10)
    _badged(db, days=90)  # beyond the horizon
    _badged(db, days=-5)  # already expired — too late to keep the badge continuous

    resp = client.post(ENDPOINT, headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["window_days"] == 30
    ids = [row["producer_id"] for row in body["rows"]]
    assert ids == [str(inside.id)]


def test_unapproved_unbadged_and_phoneless_producers_are_excluded(
    client, db, monkeypatch
):
    _spy(monkeypatch)
    wanted = _badged(db, days=5)
    _badged(db, days=5, status="pending")
    _badged(db, days=5, badges=())
    _badged(db, days=5, phone="")

    resp = client.post(ENDPOINT, headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    ids = [row["producer_id"] for row in resp.json()["rows"]]
    assert ids == [str(wanted.id)]


# --- dry-run --------------------------------------------------------------


def test_dry_run_is_the_default_and_sends_nothing(client, db, monkeypatch):
    calls = _spy(monkeypatch)
    _badged(db, days=3)

    resp = client.post(ENDPOINT, headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["dry_run"] is True
    assert body["total"] == 1
    # The counting assert from <verification_step>: EXACTLY zero sends.
    assert len(calls) == 0
    assert body["sent_count"] == 0
    assert body["rows"][0]["sent"] is None


def test_dry_run_false_actually_sends(client, db, monkeypatch):
    calls = _spy(monkeypatch)
    _badged(db, days=3)

    resp = client.post(
        ENDPOINT, params={"dry_run": "false"}, headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["dry_run"] is False
    assert len(calls) == 1
    # Normalized to E.164 before it reaches the transport.
    assert calls[0][0] == "+972501234567"
    assert calls[0][1].name == "kashrut_expiry_reminder"
    assert body["sent_count"] == 1
    assert body["rows"][0]["sent"] is True


# --- failure isolation -----------------------------------------------------


def test_one_failed_send_does_not_stop_the_batch(client, db, monkeypatch):
    calls = _spy(
        monkeypatch,
        results={"+972500000001": RuntimeError("Meta exploded")},
    )
    _badged(db, days=1, phone="050-000-0001")
    _badged(db, days=2, phone="050-000-0002")

    resp = client.post(
        ENDPOINT, params={"dry_run": "false"}, headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Both were attempted — the raising one did not abort the loop.
    assert len(calls) == 2
    assert body["total"] == 2
    assert body["sent_count"] == 1
    assert body["failed_count"] == 1
    failed = [row for row in body["rows"] if row["sent"] is False]
    assert len(failed) == 1
    assert failed[0]["error"]


def test_template_not_approved_yet_is_a_soft_failure_not_a_crash(
    client, db, monkeypatch
):
    """Meta 132001 surfaces as send_template returning False (it is fail-open).

    This is the EXPECTED state until Sapir's template clears Meta review, so
    it must read as a per-row error, never a 500.
    """
    _spy(monkeypatch, results={"+972501234567": False})
    _badged(db, days=3)

    resp = client.post(
        ENDPOINT, params={"dry_run": "false"}, headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["sent_count"] == 0
    assert body["failed_count"] == 1
    assert body["rows"][0]["sent"] is False
    assert "template" in body["rows"][0]["error"]


# --- PII -------------------------------------------------------------------


def test_response_never_carries_the_full_phone(client, db, monkeypatch):
    _spy(monkeypatch)
    _badged(db, days=4, phone="050-123-4567")

    resp = client.post(ENDPOINT, headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    # The counting assert from <verification_step>: the raw number, in any
    # spelling, must not appear anywhere in the serialized response.
    raw = resp.text
    assert "0501234567" not in raw
    assert "050-123-4567" not in raw
    assert "+972501234567" not in raw
    assert resp.json()["rows"][0]["phone_masked"] == "***4567"


# --- authz -----------------------------------------------------------------


def test_non_admin_cannot_trigger_reminders(client, db, monkeypatch):
    calls = _spy(monkeypatch)
    _badged(db, days=3)
    plain = make_user(db, role="user")

    resp = client.post(
        ENDPOINT, params={"dry_run": "false"}, headers=auth_header(plain)
    )
    assert resp.status_code in (401, 403), resp.text
    assert len(calls) == 0
