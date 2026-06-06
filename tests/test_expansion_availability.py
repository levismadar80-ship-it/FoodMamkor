"""Mutation-guided test expansion (2026-06, Refs MEH-214) — domain B1.

availability_state machine. Closes the highest-value gaps the coverage
audit found:
  - default-listing exclusion of on_vacation (MEH-291 Phase 3 core) — was
    completely untested (producer_listing.py:177-179);
  - auto-clear date boundary `<` vs `<=` (schemas.py:573);
  - the new POST /producers/me/availability-state validation guards
    (producer_me.py:347-364).

Backend tests — kill logic explained per mutant in
docs/testing/2026-06-mutation-test-plan.md (domain B1). CI Postgres is the
healer (no sandbox DB).
"""
from datetime import date, timedelta

from tests.conftest import auth_header, make_producer, make_user


def _set_state(db, producer, state, vacation_until=None):
    producer.availability_state = state
    producer.vacation_until = vacation_until
    db.commit()
    db.refresh(producer)


# ---------- AV-1 / AV-2 — default-listing exclusion ----------

def test_on_vacation_excluded_from_default_listing(client, db):
    """GET /producers with no availability_state filter hides on_vacation.

    Kills AV-1 (exclusion block deleted → vacation leaks in) and AV-2
    (`!=` → `==` → only vacation shown).
    """
    open_p = make_producer(db, name="חוות פתוחה")
    vac_p = make_producer(db, name="חוות בחופשה")
    _set_state(db, vac_p, "on_vacation", date.today() + timedelta(days=10))

    resp = client.get("/producers")
    assert resp.status_code == 200
    names = {p["name"] for p in resp.json()}
    assert "חוות פתוחה" in names
    assert "חוות בחופשה" not in names


def test_on_vacation_included_with_explicit_filter(client, db):
    """Explicit ?availability_state=on_vacation opts back in (AV-2 guard)."""
    vac_p = make_producer(db, name="חוות בחופשה מפורשת")
    _set_state(db, vac_p, "on_vacation", date.today() + timedelta(days=10))

    resp = client.get("/producers?availability_state=on_vacation")
    assert resp.status_code == 200
    names = {p["name"] for p in resp.json()}
    assert "חוות בחופשה מפורשת" in names


def test_on_vacation_still_reachable_by_id(client, db):
    """Exclusion is listing-only — direct fetch by id still 200 (AV-1/AV-2
    must not over-reach into the detail route)."""
    vac_p = make_producer(db, name="חוות ישירה")
    _set_state(db, vac_p, "on_vacation", date.today() + timedelta(days=10))

    resp = client.get(f"/producers/{vac_p.id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "חוות ישירה"


# ---------- AV-3 / AV-4 — auto-clear date boundary ----------

def test_vacation_ending_today_is_not_auto_cleared(client, db):
    """vacation_until == today → still on_vacation (boundary is `<`, not `<=`).

    Kills AV-3 (`<` → `<=` would wrongly clear a producer whose vacation
    ends today).
    """
    vac_p = make_producer(db, name="חוות חוזרת היום")
    _set_state(db, vac_p, "on_vacation", date.today())

    resp = client.get(f"/producers/{vac_p.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["availability_state"] == "on_vacation"
    assert body["vacation_until"] is not None


def test_past_vacation_is_auto_cleared(client, db):
    """vacation_until in the past → serialized as accepting_orders, date
    cleared. Confirms the auto-clear actually fires (guards AV-3/AV-4 from
    over-correcting and never clearing)."""
    vac_p = make_producer(db, name="חוות חופשה שעברה")
    _set_state(db, vac_p, "on_vacation", date.today() - timedelta(days=1))

    resp = client.get(f"/producers/{vac_p.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["availability_state"] == "accepting_orders"
    assert body["vacation_until"] is None


# ---------- AV-5 / AV-6 / AV-7 — POST /availability-state guards ----------

def _producer_user(db):
    producer = make_producer(db, name="חוות בעלים")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def test_set_availability_state_rejects_invalid_state(client, db):
    """Unknown state string → 400 (AV-5: the AVAILABILITY_STATES guard)."""
    user, _ = _producer_user(db)
    resp = client.post(
        "/producers/me/availability-state",
        json={"state": "banana_state"},
        headers=auth_header(user),
    )
    assert resp.status_code == 400


def test_on_vacation_without_return_date_rejected(client, db):
    """on_vacation with no vacation_until → 422 (AV-6)."""
    user, _ = _producer_user(db)
    resp = client.post(
        "/producers/me/availability-state",
        json={"state": "on_vacation"},
        headers=auth_header(user),
    )
    assert resp.status_code == 422


def test_leaving_vacation_clears_return_date(client, db):
    """on_vacation (with date) → accepting_orders clears vacation_until.

    Kills AV-7 (always-assign would keep the stale return date).
    """
    user, _ = _producer_user(db)
    hdr = auth_header(user)
    set_vac = client.post(
        "/producers/me/availability-state",
        json={"state": "on_vacation", "vacation_until": "2099-01-01"},
        headers=hdr,
    )
    assert set_vac.status_code == 200, set_vac.text
    assert set_vac.json()["vacation_until"] == "2099-01-01"

    leave = client.post(
        "/producers/me/availability-state",
        json={"state": "accepting_orders"},
        headers=hdr,
    )
    assert leave.status_code == 200, leave.text
    assert leave.json()["availability_state"] == "accepting_orders"
    assert leave.json()["vacation_until"] is None


def test_set_valid_state_happy_path(client, db):
    """available_today persists and round-trips (sanity anchor for the
    mutants above — proves the endpoint works on the original code)."""
    user, _ = _producer_user(db)
    resp = client.post(
        "/producers/me/availability-state",
        json={"state": "available_today"},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["availability_state"] == "available_today"


def test_set_availability_state_requires_producer_role(client, db):
    """A consumer cannot set availability state — require_producer 403.
    (Also exercises domain B3 JW-1 from the listing side.)"""
    consumer = make_user(db, role="consumer")
    resp = client.post(
        "/producers/me/availability-state",
        json={"state": "accepting_orders"},
        headers=auth_header(consumer),
    )
    assert resp.status_code == 403
