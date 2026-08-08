"""MEH-1940: the same-town 422 returns {code, message, params}, not a sentence.

Since MEH-1939 registration writes the owner's town into `producer_locations`
for her, silently. She never saw that row, so a message that only restates the
rule reads as arbitrary.

The first fix put a Hebrew sentence in the router — including invented label
examples ('הדוכן בשוק', 'החנות'). Those are KIND names, in a form that already
has a kind selector, and the label field's own placeholder already carried an
example. So the copy moved to messages/*.json and the router now returns a
locale-independent `code` plus `params` describing the location that already
exists.

REUSES the MEH-1164 shape: auth.py:374-382 (_EMAIL_UNVERIFIED_DETAIL).

This file asserts the CONTRACT (shape, code, params, no Hebrew kind names) —
the rendered sentences are the frontend's, covered in
frontend/__tests__/LocationsEditor.test.jsx. `TestTheInvariantItselfIsUnchanged`
is the guard that this stayed a copy change: MEH-1421's rule is untouched.
"""

import pytest

from app.routers.producer_me import (
    SAME_CITY_NEEDS_LABEL_CODE,
    _same_city_label_error_detail,
)
from tests.conftest import auth_header, make_producer, make_user

# The three kind values the ORM CHECK constraint allows (models.py:536). The
# backend must emit one of THESE, never a translated name.
RAW_KINDS = {"branch", "pickup", "market_stand"}
HEBREW_KIND_NAMES = ("סניף", "נקודת איסוף", "דוכן שוק")


def _producer_user(db, *, name="חוות המיקומים"):
    producer = make_producer(db, name=name)
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _base_location(**overrides):
    payload = {
        "kind": "branch",
        "label": None,
        "city": "זכרון יעקב",
        "lat": 32.57,
        "lng": 34.95,
    }
    payload.update(overrides)
    return payload


def _seed_then_collide(client, db, *, existing, city="זכרון יעקב"):
    """Create the `existing` rows, then collide with an unlabelled one."""
    user, _ = _producer_user(db)
    for row in existing:
        created = client.post(
            "/producers/me/locations",
            json=_base_location(city=city, **row),
            headers=auth_header(user),
        )
        assert created.status_code == 201, created.text
    clash = client.post(
        "/producers/me/locations",
        json=_base_location(city=city, label=None),
        headers=auth_header(user),
    )
    assert clash.status_code == 422, clash.text
    return clash.json()["detail"]


class TestTheDetailShape:
    def test_it_is_the_code_message_params_envelope(self, client, db):
        detail = _seed_then_collide(client, db, existing=[{"label": "סניף א"}])
        assert isinstance(detail, dict)
        assert set(detail) == {"code", "message", "params"}
        assert detail["code"] == SAME_CITY_NEEDS_LABEL_CODE

    def test_params_describe_the_location_that_already_exists(self, client, db):
        detail = _seed_then_collide(
            client, db, existing=[{"label": "החנות", "kind": "market_stand"}]
        )
        params = detail["params"]
        assert params["city"] == "זכרון יעקב"
        assert params["existing_label"] == "החנות"
        assert params["existing_kind"] == "market_stand"
        assert params["existing_count"] == 1

    def test_an_unlabelled_neighbour_reports_a_null_label(self, client, db):
        detail = _seed_then_collide(
            client, db, existing=[{"label": None, "kind": "pickup"}]
        )
        assert detail["params"]["existing_label"] is None
        assert detail["params"]["existing_kind"] == "pickup"

    def test_the_count_reflects_every_colliding_row(self, client, db):
        # Two labelled rows in the town, then an unlabelled third.
        detail = _seed_then_collide(
            client, db, existing=[{"label": "סניף א"}, {"label": "סניף ב"}]
        )
        assert detail["params"]["existing_count"] == 2


class TestTheBackendNeverEmitsRenderedCopy:
    """The whole point of the rework: copy lives in messages/*.json."""

    def test_the_kind_is_the_raw_enum_never_a_hebrew_name(self, client, db):
        detail = _seed_then_collide(
            client, db, existing=[{"label": None, "kind": "market_stand"}]
        )
        assert detail["params"]["existing_kind"] in RAW_KINDS
        serialised = str(detail)
        for hebrew in HEBREW_KIND_NAMES:
            assert hebrew not in serialised, (
                f"backend leaked a translated kind: {hebrew}"
            )

    def test_no_invented_label_examples_anywhere_in_the_payload(self, client, db):
        # These were in the previous message and are exactly what this ticket
        # removed — a kind name handed to her as if it were a label.
        detail = _seed_then_collide(client, db, existing=[{"label": "סניף א"}])
        serialised = str(detail)
        for invented in ("הדוכן בשוק", "החנות"):
            assert invented not in serialised

    def test_the_transition_message_uses_the_form_s_term(self):
        # MEH-1937 aligned the field label to "יישוב". The fallback string is
        # the one a pre-`code` client renders, so it has to comply too.
        message = _same_city_label_error_detail(None)["message"]
        assert "יישוב" in message
        assert "עיר" not in message


class TestTheHelperIsSafeOnItsOwn:
    @pytest.mark.parametrize("blank", [None, "", "   "])
    def test_a_blank_city_becomes_null_not_a_hole(self, blank):
        params = _same_city_label_error_detail(blank)["params"]
        assert params["city"] is None
        for hole in ("undefined", "None", "null"):
            assert hole != params["city"]

    def test_a_real_city_is_stripped(self):
        assert _same_city_label_error_detail("  חדרה  ")["params"]["city"] == "חדרה"

    def test_it_defaults_to_a_single_existing_location(self):
        assert _same_city_label_error_detail("חדרה")["params"]["existing_count"] == 1


class TestTheInvariantItselfIsUnchanged:
    """MEH-1421's rule is NOT in scope. Same cases blocked, same cases pass."""

    def test_same_city_with_a_label_still_saves(self, client, db):
        user, _ = _producer_user(db)
        client.post(
            "/producers/me/locations",
            json=_base_location(city="חדרה", label="סניף א"),
            headers=auth_header(user),
        )
        ok = client.post(
            "/producers/me/locations",
            json=_base_location(city="חדרה", label="סניף ב"),
            headers=auth_header(user),
        )
        assert ok.status_code == 201, ok.text

    def test_a_different_city_without_a_label_still_saves(self, client, db):
        user, _ = _producer_user(db)
        client.post(
            "/producers/me/locations",
            json=_base_location(city="חדרה", label=None),
            headers=auth_header(user),
        )
        ok = client.post(
            "/producers/me/locations",
            json=_base_location(city="בנימינה", label=None),
            headers=auth_header(user),
        )
        assert ok.status_code == 201, ok.text

    def test_the_collision_is_still_a_422(self, client, db):
        # Pinned separately from the payload: a future copy edit must not be
        # able to turn this into a 400 without a test going red.
        detail = _seed_then_collide(client, db, existing=[{"label": "סניף א"}])
        assert detail["code"] == SAME_CITY_NEEDS_LABEL_CODE
