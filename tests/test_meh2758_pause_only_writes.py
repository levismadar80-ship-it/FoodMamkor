"""
MEH-2758 (MEH-2757 chunk 1): the availability choice is pause-only.

Sapir, 6/11: the owner's status picker had four options — «פתוח להזמנות»,
«זמין היום», «עמוס השבוע», «בהפסקה» — and the first clashed with the
order-window line «פתוח להזמנות · עד …». Google / Etsy / Wolt / Uber Eats give
owners hours plus one pause switch, nothing else, so only `accepting_orders`
and `on_vacation` may be WRITTEN now, on every write path. Rows that already
hold `available_today` / `full_this_week` still read (no migration; the enum
contraction is a post-launch card).
"""

from datetime import timedelta

import pytest

from app.utils.clock import israel_today
from tests.conftest import auth_header, make_producer, make_user

REMOVED = ["available_today", "full_this_week"]


def _owner(db, state="accepting_orders"):
    producer = make_producer(db, name="חוות ההפסקה")
    producer.availability_state = state
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


# ---------- POST /producers/me/availability-state ----------


@pytest.mark.parametrize("state", REMOVED)
def test_state_endpoint_refuses_the_removed_states(client, db, state):
    user, producer = _owner(db)
    resp = client.post(
        "/producers/me/availability-state",
        json={"state": state},
        headers=auth_header(user),
    )
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"]["code"] == "invalid_availability_state"
    assert resp.json()["detail"]["params"]["allowed"] == [
        "accepting_orders",
        "on_vacation",
    ]
    db.refresh(producer)
    assert producer.availability_state == "accepting_orders"


def test_state_endpoint_still_pauses_and_resumes(client, db):
    user, producer = _owner(db)
    hdr = auth_header(user)
    back = (israel_today() + timedelta(days=5)).isoformat()
    pause = client.post(
        "/producers/me/availability-state",
        json={"state": "on_vacation", "vacation_until": back},
        headers=hdr,
    )
    assert pause.status_code == 200, pause.text
    assert pause.json()["availability_state"] == "on_vacation"
    resume = client.post(
        "/producers/me/availability-state",
        json={"state": "accepting_orders"},
        headers=hdr,
    )
    assert resume.status_code == 200, resume.text
    assert resume.json()["availability_state"] == "accepting_orders"


def test_leaving_a_legacy_state_is_allowed(client, db):
    """A row still on a removed state can move to an allowed one."""
    user, producer = _owner(db, state="full_this_week")
    resp = client.post(
        "/producers/me/availability-state",
        json={"state": "accepting_orders"},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.availability_state == "accepting_orders"


# ---------- PUT /producers/me and admin PUT ----------


@pytest.mark.parametrize("state", REMOVED)
def test_owner_put_cannot_set_the_removed_states(client, db, state):
    """The owner PUT never wrote availability_state (it is not in
    _PRODUCER_WRITABLE_FIELDS); pinned so a later re-open of that path has to
    face the pause-only rule."""
    user, producer = _owner(db)
    resp = client.put(
        "/producers/me", json={"availability_state": state}, headers=auth_header(user)
    )
    assert resp.status_code in (200, 422), resp.text
    db.refresh(producer)
    assert producer.availability_state == "accepting_orders"


def _admin_put(client, db, producer, state):
    admin = make_user(db, role="admin")
    return client.put(
        f"/admin/producers/{producer.id}",
        json={"availability_state": state},
        headers=auth_header(admin),
    )


@pytest.mark.parametrize("state", REMOVED)
def test_admin_put_refuses_moving_into_a_removed_state(client, db, state):
    _, producer = _owner(db)
    resp = _admin_put(client, db, producer, state)
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"]["code"] == "invalid_availability_state"
    assert resp.json()["detail"]["params"]["allowed"] == [
        "accepting_orders",
        "on_vacation",
    ]
    db.refresh(producer)
    assert producer.availability_state == "accepting_orders"


@pytest.mark.parametrize("state", REMOVED)
def test_admin_put_resubmitting_an_unchanged_legacy_state_still_saves(
    client, db, state
):
    """ProducerForm sends availability_state on every save. A business still on
    a legacy value must stay editable — the other half of the test above, so an
    implementation that refused the value outright fails here."""
    _, producer = _owner(db, state=state)
    admin = make_user(db, role="admin")
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"availability_state": state, "description": "תיאור חדש לבדיקה"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.availability_state == state
    assert producer.description == "תיאור חדש לבדיקה"


@pytest.mark.parametrize("state", REMOVED)
def test_admin_put_can_move_a_legacy_row_to_accepting_orders(client, db, state):
    _, producer = _owner(db, state=state)
    resp = _admin_put(client, db, producer, "accepting_orders")
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.availability_state == "accepting_orders"


# ---------- the two legacy endpoints are gone ----------


@pytest.mark.parametrize(
    "path", ["/producers/me/availability", "/producers/me/availability-status"]
)
def test_legacy_availability_endpoints_are_removed(client, db, path):
    user, producer = _owner(db)
    resp = client.post(path, json={"status": "full"}, headers=auth_header(user))
    assert resp.status_code in (404, 405), resp.text
    db.refresh(producer)
    assert producer.availability_state == "accepting_orders"


# ---------- reads of an old value keep working ----------


@pytest.mark.parametrize("state", REMOVED)
def test_a_row_on_a_removed_state_still_lists(client, db, state):
    _, producer = _owner(db, state=state)
    resp = client.get("/producers")
    assert resp.status_code == 200
    mine = [p for p in resp.json() if p["id"] == str(producer.id)]
    assert len(mine) == 1
    assert mine[0]["availability_state"] == state


def test_admin_put_refuses_an_explicit_null_state(client, db):
    """Reviewer on #4074: an explicit null is a change, so it is checked and
    refused rather than written (the column is NOT NULL)."""
    _, producer = _owner(db)
    resp = _admin_put(client, db, producer, None)
    assert resp.status_code == 422, resp.text
    db.refresh(producer)
    assert producer.availability_state == "accepting_orders"


# ---------- MEH-2782: admin PUT cannot pause without a return date ----------


def test_admin_put_refuses_vacation_without_return_date(client, db):
    """The owner endpoint has required vacation_until since AUD-039/040; the
    admin PUT did not, so an admin could leave a business paused forever."""
    _, producer = _owner(db)
    resp = _admin_put(client, db, producer, "on_vacation")
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"]["code"] == "vacation_return_date_required"
    db.refresh(producer)
    assert producer.availability_state == "accepting_orders"


def test_admin_put_refuses_clearing_the_return_date_of_a_paused_row(client, db):
    _, producer = _owner(db, state="on_vacation")
    producer.vacation_until = israel_today() + timedelta(days=3)
    db.commit()
    admin = make_user(db, role="admin")
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"availability_state": "on_vacation", "vacation_until": None},
        headers=auth_header(admin),
    )
    assert resp.status_code == 422, resp.text
    db.refresh(producer)
    assert producer.vacation_until is not None


def test_admin_put_pauses_with_a_return_date(client, db):
    _, producer = _owner(db)
    back = israel_today() + timedelta(days=4)
    admin = make_user(db, role="admin")
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"availability_state": "on_vacation", "vacation_until": back.isoformat()},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.availability_state == "on_vacation"
    assert producer.vacation_until == back


def test_admin_put_unrelated_edit_of_a_dateless_pause_still_saves(client, db):
    """Reviewer on #4100: a legacy on_vacation row with no date stays editable
    when the PUT does not touch availability."""
    _, producer = _owner(db, state="on_vacation")
    producer.vacation_until = None
    db.commit()
    admin = make_user(db, role="admin")
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"description": "תיאור חדש לבדיקה"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text


def test_admin_put_resumes_a_dateless_pause(client, db):
    _, producer = _owner(db, state="on_vacation")
    producer.vacation_until = None
    db.commit()
    resp = _admin_put(client, db, producer, "accepting_orders")
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.availability_state == "accepting_orders"
