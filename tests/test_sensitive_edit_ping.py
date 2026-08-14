"""MEH-2073 — admin ping when an APPROVED producer edits a sensitive field.

The manual-approval promise is made once, at approval. Everything in
`_PRODUCER_WRITABLE_FIELDS` goes live immediately afterwards with no signal,
so an owner could pass MEH-1508's dietary cross-check at approval and change
`vegan_scope` the next day with nobody the wiser. This closes the
observability gap WITHOUT touching the save.

Contract:

| producer status | field edited        | ping? |
|-----------------|---------------------|-------|
| approved        | sensitive           | ONE, listing every changed field |
| approved        | sensitive, no-op    | none — value compared, not key presence |
| approved        | non-sensitive       | none |
| pending         | sensitive           | none |
| pending_whatsapp| sensitive           | none |
| inactive        | sensitive           | none |
| approved        | notify() raises     | none — 200 still returned (fail-open) |

Patched at the IMPORT SITE in producer_me (mirrors
tests/test_meh1351_review_ready_ping.py's PATCH_TARGET), not in
auth_notifications — patching the definition would leave the router's
already-bound reference pointing at the real sender.
"""

from unittest.mock import patch

import pytest

from app.routers.producer_me import SENSITIVE_FIELDS
from tests.conftest import auth_header, make_producer, make_user

PATCH_TARGET = "app.routers.producer_me.notify_admin_producer_sensitive_edit"


def _owner(db, *, status="approved", name="משק הפינג", **producer_kwargs):
    producer = make_producer(db, name=name, status=status, **producer_kwargs)
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _put(client, user, body):
    return client.put("/producers/me", json=body, headers=auth_header(user))


# --- the ping fires ---------------------------------------------------------


def test_approved_producer_editing_city_pings_admin(client, db):
    user, producer = _owner(db, city="תל אביב")

    with patch(PATCH_TARGET) as ping:
        resp = _put(client, user, {"city": "רעננה"})

    assert resp.status_code == 200, resp.text
    ping.assert_called_once_with("משק הפינג", ["city"])
    db.refresh(producer)
    assert producer.city == "רעננה", "the save itself must be unaffected"


def test_one_ping_per_put_listing_every_changed_field(client, db):
    """Two sensitive fields in one PUT is ONE notification, not two."""
    user, _ = _owner(db, city="תל אביב")

    with patch(PATCH_TARGET) as ping:
        resp = _put(client, user, {"city": "חיפה", "phone": "050-1112233"})

    assert resp.status_code == 200, resp.text
    ping.assert_called_once()
    name, changed = ping.call_args.args
    assert name == "משק הפינג"
    # sorted, so the message is stable regardless of payload key order
    assert changed == ["city", "phone"]


def test_dietary_scope_edit_pings(client, db):
    """The MEH-1508 hole this ticket was opened for: the scope declarations
    are cross-checked at approval, then freely editable afterwards."""
    user, _ = _owner(db)

    with patch(PATCH_TARGET) as ping:
        resp = _put(client, user, {"vegan_scope": "all"})

    assert resp.status_code == 200, resp.text
    ping.assert_called_once_with("משק הפינג", ["vegan_scope"])


# --- the ping stays quiet ---------------------------------------------------


def test_resubmitting_an_unchanged_sensitive_value_does_not_ping(client, db):
    """The dashboard form posts the whole card on every save, so `city` is in
    the payload even when the admin changed only the description. Comparing
    VALUES (not key presence) is what keeps this a signal instead of noise —
    and it is the assertion that fails if someone rewrites the diff as
    `field in payload`."""
    user, _ = _owner(db, city="תל אביב")

    with patch(PATCH_TARGET) as ping:
        resp = _put(client, user, {"city": "תל אביב"})

    assert resp.status_code == 200, resp.text
    ping.assert_not_called()


def test_non_sensitive_edit_does_not_ping(client, db):
    user, _ = _owner(db)

    with patch(PATCH_TARGET) as ping:
        resp = _put(client, user, {"description": "תיאור חדש לגמרי לעסק הזה"})

    assert resp.status_code == 200, resp.text
    ping.assert_not_called()


@pytest.mark.parametrize("status", ["pending", "pending_whatsapp", "inactive"])
def test_non_approved_producer_does_not_ping(client, db, status):
    """The ping means "a business the admin already vetted changed something".
    A pending producer has not been vetted yet — its edits are the normal
    pre-approval flow, and pinging on them would bury the real signal."""
    user, _ = _owner(db, status=status, city="תל אביב")

    with patch(PATCH_TARGET) as ping:
        resp = _put(client, user, {"city": "רעננה"})

    assert resp.status_code == 200, resp.text
    ping.assert_not_called()


# --- fail-open (MEH-1051 / 977) ---------------------------------------------


def test_notification_failure_does_not_affect_the_200(client, db):
    """A Meta/Resend outage must never reach the owner who already saved."""
    user, producer = _owner(db, city="תל אביב")

    with patch(PATCH_TARGET, side_effect=RuntimeError("meta is down")):
        resp = _put(client, user, {"city": "רעננה"})

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.city == "רעננה", "the write must survive a notify failure"


# --- the save path is byte-identical ----------------------------------------


def test_response_shape_and_status_are_unchanged(client, db):
    """Notification-only: no status flip, no requested_changes write, and the
    same payload the endpoint returned before this ticket."""
    user, producer = _owner(db, city="תל אביב")

    with patch(PATCH_TARGET):
        resp = _put(client, user, {"city": "רעננה"})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["city"] == "רעננה"
    db.refresh(producer)
    assert producer.status == "approved", "the ping must not move the status"
    assert producer.requested_changes is None
    assert producer.changes_requested_at is None


# --- the constant cannot drift out of the writable set ----------------------


def test_sensitive_fields_are_all_writable(client, db):
    """Every SENSITIVE_FIELD must be reachable through the owner PUT.

    If a name drifts out of `_PRODUCER_WRITABLE_FIELDS` (as `pickup_points`
    and `lactose_free_facility` already did in MEH-1856), the setattr loop
    silently ignores it, the value never changes, and the ping for that field
    becomes permanently unreachable — with every other test here still green.
    This drives each field through the real endpoint and asserts the ping,
    rather than comparing two sets, so it also covers a field that is in the
    set but blocked by a validator.
    """
    values = {
        "city": "רעננה",
        "phone": "050-9998877",
        "vegan_scope": "all",
        "vegetarian_scope": "all",
        "gluten_free_facility": "dedicated",
    }
    assert set(values) == set(SENSITIVE_FIELDS), (
        "this test must cover every sensitive field — update `values` when "
        "SENSITIVE_FIELDS changes"
    )

    for field, new_value in values.items():
        user, _ = _owner(db, city="תל אביב", name=f"משק {field}")
        with patch(PATCH_TARGET) as ping:
            resp = _put(client, user, {field: new_value})
        assert resp.status_code == 200, f"{field}: {resp.text}"
        ping.assert_called_once_with(f"משק {field}", [field]), field
