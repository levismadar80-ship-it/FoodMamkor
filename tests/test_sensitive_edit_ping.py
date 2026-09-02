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
| draft           | sensitive           | none |
| pending         | sensitive           | none |
| inactive        | sensitive           | none |
| approved        | notify() raises     | none — 200 still returned (fail-open) |

Patched at the IMPORT SITE in producer_me (mirrors
tests/test_meh1351_review_ready_ping.py's PATCH_TARGET), not in
auth_notifications — patching the definition would leave the router's
already-bound reference pointing at the real sender.

MEH-1938 chunk 5a (ruling A, Sapir 02/09): `city` left SENSITIVE_FIELDS when
its owner write path on this endpoint closed, so every case that used to
drive the ping with `city` now drives it with `phone`. The contract table
above is unchanged — only the field carrying it. The ping for a city change
moves into the locations CRUD as MEH-2073 chunk 2; until then a city edit
pings nobody, which was already true for every UI path since MEH-2141.
"""

from unittest.mock import patch

import pytest

from app.routers.producer_me import SENSITIVE_FIELDS
from tests.conftest import auth_header, make_producer, make_user

PATCH_TARGET = "app.routers.producer_me.notify_admin_producer_sensitive_edit"


# The seeded phone, so "unchanged" and "changed" are different strings and a
# no-op resubmit has a real value to resubmit. make_producer leaves phone NULL.
#
# CANONICAL FORM, deliberately: schemas.py `_phone_validator` strips the dash
# on the way in, and the ping compares STORED values. Seed "050-0000001" on the
# ORM and resubmit the same string, and the handler stores "0500000001" — a
# byte-identical payload reads as a change and the no-op case pings. The
# fixture therefore holds what the validator would have stored.
SEEDED_PHONE = "0500000001"
NEW_PHONE = "0501112233"


def _owner(db, *, status="approved", name="משק הפינג", phone=SEEDED_PHONE):
    producer = make_producer(db, name=name, status=status)
    producer.phone = phone
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _put(client, user, body):
    return client.put("/producers/me", json=body, headers=auth_header(user))


# --- the ping fires ---------------------------------------------------------


def test_approved_producer_editing_phone_pings_admin(client, db):
    user, producer = _owner(db)

    with patch(PATCH_TARGET) as ping:
        resp = _put(client, user, {"phone": NEW_PHONE})

    assert resp.status_code == 200, resp.text
    ping.assert_called_once_with("משק הפינג", ["phone"])
    db.refresh(producer)
    assert producer.phone == NEW_PHONE, "the save itself must be unaffected"


def test_one_ping_per_put_listing_every_changed_field(client, db):
    """Two sensitive fields in one PUT is ONE notification, not two."""
    user, _ = _owner(db)

    with patch(PATCH_TARGET) as ping:
        resp = _put(client, user, {"vegan_scope": "all", "phone": NEW_PHONE})

    assert resp.status_code == 200, resp.text
    ping.assert_called_once()
    name, changed = ping.call_args.args
    assert name == "משק הפינג"
    # sorted, so the message is stable regardless of payload key order
    assert changed == ["phone", "vegan_scope"]


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
    """The dashboard form posts the whole card on every save, so `phone` is in
    the payload even when the owner changed only the description. Comparing
    VALUES (not key presence) is what keeps this a signal instead of noise —
    and it is the assertion that fails if someone rewrites the diff as
    `field in payload`."""
    user, _ = _owner(db)

    with patch(PATCH_TARGET) as ping:
        resp = _put(client, user, {"phone": SEEDED_PHONE})

    assert resp.status_code == 200, resp.text
    ping.assert_not_called()


def test_non_sensitive_edit_does_not_ping(client, db):
    user, _ = _owner(db)

    with patch(PATCH_TARGET) as ping:
        resp = _put(client, user, {"description": "תיאור חדש לגמרי לעסק הזה"})

    assert resp.status_code == 200, resp.text
    ping.assert_not_called()


# `pending_whatsapp` was a fourth case here until it was removed in MEH-2124.
@pytest.mark.parametrize("status", ["draft", "pending", "inactive"])
def test_non_approved_producer_does_not_ping(client, db, status):
    """The ping means "a business the admin already vetted changed something".
    A pending producer has not been vetted yet — its edits are the normal
    pre-approval flow, and pinging on them would bury the real signal."""
    user, _ = _owner(db, status=status)

    with patch(PATCH_TARGET) as ping:
        resp = _put(client, user, {"phone": NEW_PHONE})

    assert resp.status_code == 200, resp.text
    ping.assert_not_called()


# --- fail-open (MEH-1051 / 977) ---------------------------------------------


def test_notification_failure_does_not_affect_the_200(client, db):
    """A Meta/Resend outage must never reach the owner who already saved."""
    user, producer = _owner(db)

    with patch(PATCH_TARGET, side_effect=RuntimeError("meta is down")):
        resp = _put(client, user, {"phone": NEW_PHONE})

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.phone == NEW_PHONE, "the write must survive a notify failure"


# --- the save path is byte-identical ----------------------------------------


def test_response_shape_and_status_are_unchanged(client, db):
    """Notification-only: no status flip, no requested_changes write, and the
    same payload the endpoint returned before this ticket."""
    user, producer = _owner(db)

    with patch(PATCH_TARGET):
        resp = _put(client, user, {"phone": NEW_PHONE})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["phone"] == NEW_PHONE
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
        "phone": "0509998877",
        "vegan_scope": "all",
        "vegetarian_scope": "all",
        "gluten_free_facility": "dedicated",
    }
    assert set(values) == set(SENSITIVE_FIELDS), (
        "this test must cover every sensitive field — update `values` when "
        "SENSITIVE_FIELDS changes"
    )

    for field, new_value in values.items():
        user, _ = _owner(db, name=f"משק {field}")
        with patch(PATCH_TARGET) as ping:
            resp = _put(client, user, {field: new_value})
        assert resp.status_code == 200, f"{field}: {resp.text}"
        ping.assert_called_once_with(f"משק {field}", [field]), field


# --- MEH-1938 chunk 5a, ruling A (02/09): city is neither writable nor sensitive


def test_city_is_no_longer_sensitive_and_no_longer_writable(client, db):
    """THE DISCRIMINATION CASE for the SENSITIVE_FIELDS change: against the
    pre-ruling code an approved owner PUTting `city` pinged the admin with
    ["city"] and the column changed. Now: 200, no ping, column unchanged.

    Both halves in one test on purpose — a `city` that stayed in
    SENSITIVE_FIELDS while leaving the whitelist would be a ping that can
    never fire (the exact drift `test_sensitive_fields_are_all_writable`
    guards against), and a `city` that stayed writable while leaving
    SENSITIVE_FIELDS would be an unobserved write on a column that follows
    the primary location row (MEH-2141). The owner's city editor is the
    locations CRUD; its ping is MEH-2073 chunk 2.
    """
    assert "city" not in SENSITIVE_FIELDS
    user, producer = _owner(db)
    assert producer.city == "תל אביב"

    with patch(PATCH_TARGET) as ping:
        resp = _put(client, user, {"city": "רעננה"})

    assert resp.status_code == 200, resp.text
    ping.assert_not_called()
    db.refresh(producer)
    assert producer.city == "תל אביב", "city must be ignored on the owner PUT"


# ===========================================================================
# chunk 2 — the same ping, fired from the locations CRUD
# ===========================================================================
#
# Sapir's ruling, 02/09: chunk 1's `city` case died with its write path
# (MEH-1938 chunk 5a ruling A closed `city` on `PUT /producers/me`), and the
# owner's real city editor has been the locations CRUD since MEH-2141. The
# gap this closes therefore pre-dates chunk 5a — an owner has been able to
# move her business to another town, through the UI, pinging nobody.
#
# Two events, one ping:
#   `city`                     — Producer.city followed the primary row
#   `primary_location_removed` — the LAST location was deleted, so an approved
#                                business now has no primary row at all
#
# Both are compared against a snapshot taken before the handler mutates
# anything, and both go through the same `_fire_sensitive_edit` gate as chunk
# 1 — so "approved only" and "one ping per request" cannot drift apart between
# the two call sites.

SEED_CITY = "תל אביב"


def _location(**overrides):
    payload = {"kind": "branch", "label": None, "city": "חיפה"}
    payload.update(overrides)
    return payload


def _add_location(client, user, **overrides):
    """Create a location with the ping suppressed — setup, not the assertion."""
    with patch(PATCH_TARGET):
        resp = client.post(
            "/producers/me/locations",
            json=_location(**overrides),
            headers=auth_header(user),
        )
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- the ping fires ---------------------------------------------------------


def test_first_location_in_another_city_pings_admin(client, db):
    """Case 1 of MEH-2141's write-through: the first location is forced
    primary, so `Producer.city` follows it. Against chunk-1 code this is
    silent — the locations CRUD never called the notifier at all."""
    user, producer = _owner(db, name="משק המיקום")
    assert producer.city == SEED_CITY

    with patch(PATCH_TARGET) as ping:
        resp = client.post(
            "/producers/me/locations",
            json=_location(city="חיפה"),
            headers=auth_header(user),
        )

    assert resp.status_code == 201, resp.text
    ping.assert_called_once_with("משק המיקום", ["city"])
    db.refresh(producer)
    assert producer.city == "חיפה"


def test_moving_the_primary_location_to_another_city_pings_admin(client, db):
    user, producer = _owner(db, name="משק המעבר")
    loc = _add_location(client, user, city="חיפה")

    with patch(PATCH_TARGET) as ping:
        resp = client.put(
            f"/producers/me/locations/{loc['id']}",
            json={"city": "רעננה"},
            headers=auth_header(user),
        )

    assert resp.status_code == 200, resp.text
    ping.assert_called_once_with("משק המעבר", ["city"])
    db.refresh(producer)
    assert producer.city == "רעננה"


def test_promoting_a_location_in_another_city_pings_admin(client, db):
    """The promote path changes WHICH row is primary, so the city follows a
    row whose own city nobody edited in this request."""
    user, producer = _owner(db, name="משק הקידום")
    _add_location(client, user, city="חיפה")
    second = _add_location(client, user, city="רעננה", label="נקודת חלוקה")

    with patch(PATCH_TARGET) as ping:
        resp = client.put(
            f"/producers/me/locations/{second['id']}",
            json={"is_primary": True},
            headers=auth_header(user),
        )

    assert resp.status_code == 200, resp.text
    ping.assert_called_once_with("משק הקידום", ["city"])
    db.refresh(producer)
    assert producer.city == "רעננה"


def test_deleting_the_last_location_pings_admin(client, db):
    """Sapir's ruling, 02/09 evening: deleting the last row is ALLOWED and
    leaves the business approved with no primary — no pin on the map and
    nothing to submit. Notification-only makes that visible, not blocked.

    The city deliberately does NOT appear in the ping: MEH-2141's helper keeps
    the column's last value rather than writing NULL, so nothing changed there.
    """
    user, producer = _owner(db, name="משק הריק")
    loc = _add_location(client, user, city="חיפה")

    with patch(PATCH_TARGET) as ping:
        resp = client.delete(
            f"/producers/me/locations/{loc['id']}",
            headers=auth_header(user),
        )

    assert resp.status_code == 204, resp.text
    ping.assert_called_once_with("משק הריק", ["primary_location_removed"])
    db.refresh(producer)
    assert producer.city == "חיפה", "the column keeps its last value (MEH-2141)"
    assert producer.status == "approved", "notification-only — no status flip"


def test_deleting_the_primary_with_a_survivor_pings_the_city_only(client, db):
    """A survivor is promoted, so `has_primary` never goes false — the ping
    reports the city move and nothing else. This is the case that would go
    wrong if `has_primary` were read before the promotion instead of after."""
    user, producer = _owner(db, name="משק ההחלפה")
    first = _add_location(client, user, city="חיפה")
    _add_location(client, user, city="רעננה", label="נקודת חלוקה")

    with patch(PATCH_TARGET) as ping:
        resp = client.delete(
            f"/producers/me/locations/{first['id']}",
            headers=auth_header(user),
        )

    assert resp.status_code == 204, resp.text
    ping.assert_called_once_with("משק ההחלפה", ["city"])


# --- the ping does NOT fire -------------------------------------------------


def test_resubmitting_the_same_city_does_not_ping(client, db):
    """LocationsEditor posts the whole row on every save, so an unchanged city
    arrives on the wire constantly. Values are compared, not key presence —
    the same distinction chunk 1's no-op case pins down on the PUT."""
    user, _ = _owner(db)
    loc = _add_location(client, user, city="חיפה")

    with patch(PATCH_TARGET) as ping:
        resp = client.put(
            f"/producers/me/locations/{loc['id']}",
            json={"city": "חיפה", "kind": "branch"},
            headers=auth_header(user),
        )

    assert resp.status_code == 200, resp.text
    ping.assert_not_called()


def test_editing_a_non_primary_location_does_not_ping(client, db):
    """MEH-2141 leaves `Producer.city` alone on a non-primary mutation, so
    there is nothing to report — a pickup point's phone number is not an
    identity change."""
    user, _ = _owner(db)
    _add_location(client, user, city="חיפה")
    second = _add_location(client, user, city="רעננה", label="נקודת חלוקה")

    with patch(PATCH_TARGET) as ping:
        resp = client.put(
            f"/producers/me/locations/{second['id']}",
            json={"phone": "0521112233"},
            headers=auth_header(user),
        )

    assert resp.status_code == 200, resp.text
    ping.assert_not_called()


def test_adding_a_second_non_primary_location_does_not_ping(client, db):
    user, _ = _owner(db)
    _add_location(client, user, city="חיפה")

    with patch(PATCH_TARGET) as ping:
        resp = client.post(
            "/producers/me/locations",
            json=_location(city="רעננה", label="נקודת חלוקה"),
            headers=auth_header(user),
        )

    assert resp.status_code == 201, resp.text
    ping.assert_not_called()


@pytest.mark.parametrize("status", ["draft", "pending", "inactive"])
def test_a_non_approved_business_moving_city_does_not_ping(client, db, status):
    """The promise this ping protects is made at approval. Before it, an admin
    is going to read the whole card anyway."""
    user, _ = _owner(db, status=status, name=f"משק {status}")

    with patch(PATCH_TARGET) as ping:
        resp = client.post(
            "/producers/me/locations",
            json=_location(city="חיפה"),
            headers=auth_header(user),
        )

    assert resp.status_code == 201, resp.text
    ping.assert_not_called()


# --- fail-open, on the locations path too -----------------------------------


def test_location_notification_failure_does_not_affect_the_write(client, db):
    """Same contract as chunk 1: the owner already saved, so a Meta/Resend
    outage must not reach her. `_sensitive_edit_task` is the boundary."""
    user, producer = _owner(db, name="משק הכשל")

    with patch(PATCH_TARGET, side_effect=RuntimeError("meta is down")):
        resp = client.post(
            "/producers/me/locations",
            json=_location(city="חיפה"),
            headers=auth_header(user),
        )

    assert resp.status_code == 201, resp.text
    db.refresh(producer)
    assert producer.city == "חיפה", "the write must survive a notify failure"


def test_every_ping_key_has_a_hebrew_label(client, db):
    """`primary_location_removed` is not a column, so nothing else pins it to
    the label dictionary. Without this, the admin message would degrade to the
    raw key — the notifier's documented fallback, which is a diagnostic, not
    copy anyone should read."""
    from app.services.auth_notifications import SENSITIVE_FIELD_LABELS

    for key in {*SENSITIVE_FIELDS, "city", "primary_location_removed"}:
        assert key in SENSITIVE_FIELD_LABELS, key
