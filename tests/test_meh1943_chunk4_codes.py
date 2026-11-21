"""MEH-1943 chunk 4: two more 4xx answers stop listing internal values.

- `availability_validation.validate_transition` used to say «מעבר לא חוקי
  מ-{current_state} ל-{new_state}», two raw enum values in a Hebrew sentence.
- `PATCH /admin/group-buys/{id}/status` used to say «סטטוס לא תקין.
  אפשרויות: {allowed}», a Python set repr.

The wording approved on the card (04/11 block) keeps a plain sentence; the
values move to `params`, and each answer carries a stable `code` — the same
`{code, message, params}` shape chunks 1–3 used. Each test asserts the whole
detail object, so it fails on the old code (a plain string) and pins the
approved message by literal (rule 22).
"""

import uuid

import pytest
from conftest import auth_header, make_producer, make_user

from app.services import availability_validation as av
from app.services.availability_validation import (
    AvailabilityValidationError,
    validate_transition,
)

TRANSITION_MESSAGE = "אי אפשר לעבור למצב הזה עכשיו"


@pytest.fixture
def no_transitions(monkeypatch):
    """Today every state may move to every writable state (MEH-2758), so the
    transition refusal cannot fire on its own. Freeze a table that forbids
    everything to reach it — the shape any future restriction would take."""
    monkeypatch.setattr(
        av,
        "ALLOWED_TRANSITIONS",
        {state: frozenset() for state in av.ALLOWED_TRANSITIONS},
    )


def test_transition_error_carries_code_and_params(no_transitions):
    with pytest.raises(AvailabilityValidationError) as ei:
        validate_transition("accepting_orders", "on_vacation")
    err = ei.value
    assert err.kind == "value"
    assert err.detail() == {
        "code": "invalid_availability_transition",
        "message": TRANSITION_MESSAGE,
        "params": {"from": "accepting_orders", "to": "on_vacation"},
    }
    assert "accepting_orders" not in str(err)
    assert "on_vacation" not in str(err)


def test_codeless_error_keeps_its_plain_sentence():
    # Control: the return-date errors carry no code and must stay strings.
    err = AvailabilityValidationError("תאריך חזרה לחופשה נדרש", kind="return_date")
    assert err.detail() == "תאריך חזרה לחופשה נדרש"


def test_availability_route_answers_the_transition_code(client, db, no_transitions):
    producer = make_producer(db, status="approved")
    producer.availability_state = "accepting_orders"
    user = make_user(
        db, role="producer", email="owner-1943c4@example.com", email_verified=True
    )
    user.producer_id = producer.id
    db.commit()
    r = client.post(
        "/producers/me/availability-state",
        json={"state": "on_vacation", "vacation_until": "2099-01-01"},
        headers=auth_header(user),
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == {
        "code": "invalid_availability_transition",
        "message": TRANSITION_MESSAGE,
        "params": {"from": "accepting_orders", "to": "on_vacation"},
    }


def test_admin_group_buy_status_is_a_code(client, db):
    admin = make_user(db, role="admin", email="admin-1943c4@example.com")
    r = client.patch(
        f"/admin/group-buys/{uuid.uuid4()}/status",
        params={"status": "bogus"},
        headers=auth_header(admin),
    )
    assert r.status_code == 400, r.text
    detail = r.json()["detail"]
    assert detail == {
        "code": "invalid_group_buy_status",
        "message": "סטטוס לא תקין",
        "params": {"allowed": ["cancelled", "fulfilled", "funded", "open"]},
    }
    for value in detail["params"]["allowed"]:
        assert value not in detail["message"]
