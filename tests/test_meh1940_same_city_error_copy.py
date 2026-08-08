"""MEH-1940: the same-city 422 explains itself instead of restating the rule.

Since MEH-1939 registration writes the owner's town into `producer_locations`
for her, silently. She never saw that row, so the old message — "כשיש שני
מיקומים באותה עיר יש להוסיף תווית מזהה" — read as arbitrary: from where she
sits she has ONE location, not two.

This file pins the copy, not the rule. `_reject_same_city_without_label`
(producer_me.py:1429) is untouched: same inputs blocked, same inputs allowed,
still a 422. `test_the_invariant_itself_is_unchanged` is the guard on that.

Every assertion here is discriminating against the OLD message — each one is
false for "כשיש שני מיקומים באותה עיר יש להוסיף תווית מזהה". That is the
property that makes the HEAD~ mutation run evidence rather than decoration
(.claude/rules/testing.md — "the construction has to discriminate").
"""

import pytest

from app.routers.producer_me import _same_city_label_error_detail
from tests.conftest import auth_header, make_producer, make_user

# The two terms the OWNER sees in the form. Sourced from
# frontend/messages/he.json settings.locations.form — city_label (:4792) and
# label_label. If MEH-1937's alignment is ever reverted, this file goes red.
FIELD_TERM_CITY = "יישוב"
FIELD_TERM_LABEL = "תווית"


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


def _collide(client, db, *, city="זכרון יעקב"):
    """Create a labelled row, then collide with an unlabelled one. Returns the 422."""
    user, _ = _producer_user(db)
    first = client.post(
        "/producers/me/locations",
        json=_base_location(city=city, label="סניף א"),
        headers=auth_header(user),
    )
    assert first.status_code == 201, first.text
    second = client.post(
        "/producers/me/locations",
        json=_base_location(city=city, label=None),
        headers=auth_header(user),
    )
    assert second.status_code == 422, second.text
    return user, second.json()["detail"]


class TestTheMessageExplainsItself:
    def test_it_names_the_location_that_already_exists(self, client, db):
        # The whole point of the ticket: she is told a row exists, not just
        # that a rule exists. The old message says neither of these.
        _, detail = _collide(client, db)
        assert "כבר יש לך מיקום" in detail

    def test_it_interpolates_the_actual_city_not_generic_text(self, client, db):
        # AC: "שם הישוב מושתל בפועל (לא טקסט גנרי)". A different town must
        # produce a different sentence, which a hardcoded string cannot do.
        _, detail = _collide(client, db, city="פרדס חנה")
        assert "פרדס חנה" in detail
        assert "undefined" not in detail
        assert "None" not in detail
        assert "{" not in detail and "}" not in detail

    def test_it_tells_her_what_to_do_with_an_example(self, client, db):
        _, detail = _collide(client, db)
        assert "למשל" in detail
        assert "הדוכן בשוק" in detail

    def test_it_uses_the_two_terms_the_form_shows_her(self, client, db):
        # The MEH-1937 alignment, and the same-class defect one level down:
        # the field is labelled "תווית", so the message must not ask for a "שם".
        _, detail = _collide(client, db)
        assert FIELD_TERM_CITY in detail
        assert FIELD_TERM_LABEL in detail

    def test_the_word_it_replaced_is_gone_from_the_TEMPLATE(self):
        # Scoped to the template, NOT to a rendered message. "עיר" is a
        # substring of real Israeli place names — מעלה עירון is a local council
        # — so asserting it against interpolated output would make this guard
        # depend on which town the fixture happens to use, and the natural
        # "fix" for the resulting red would be to delete the assertion.
        # The city-free rendering IS the template, so this reads the thing the
        # guard is actually about.
        assert "עיר" not in _same_city_label_error_detail(None)

    def test_a_place_name_containing_the_old_word_does_not_break_the_guard(self):
        # The other half of the same point, pinned so a future reader does not
        # re-tighten the assertion above into the data-dependent form.
        detail = _same_city_label_error_detail("מעלה עירון")
        assert "מעלה עירון" in detail
        assert FIELD_TERM_CITY in detail


class TestTheFallbackIsNeverUndefined:
    """AC: "אם הערך חסר — fallback לנוסח בלי השם, לא undefined".

    Unreachable through the endpoint — `_reject_same_city_without_label`
    returns early on a blank city (producer_me.py:1440), so no request can
    raise with one. Pinned at the helper instead, which is where a future
    caller would hit it.
    """

    @pytest.mark.parametrize("blank", [None, "", "   "])
    def test_blank_city_degrades_to_a_generic_place_not_a_hole(self, blank):
        detail = _same_city_label_error_detail(blank)
        assert "כבר יש לך מיקום" in detail
        assert FIELD_TERM_LABEL in detail
        for hole in ("undefined", "None", "null", "{}", "  "):
            assert hole not in detail, f"{hole!r} leaked into {detail!r}"

    def test_a_real_city_is_stripped_not_padded(self):
        assert "ביישוב חדרה." in _same_city_label_error_detail("  חדרה  ")


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
        # Status code pinned separately from the copy: a future copy edit must
        # not be able to turn this into a 400 without a test going red.
        _, detail = _collide(client, db)
        assert isinstance(detail, str) and detail
