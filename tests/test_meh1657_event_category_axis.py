"""MEH-1657 — the event/experience axis, enforced at the event category set.

Locked axis (Sapir, 27/07, reaffirmed 28/07): an **Event** is something that
happens ONCE on a date; an **Experience** is a guided activity people SIGN UP
for (per-person price, repeatable). "סדנה" and "סיור" name the Experience side
of that axis exactly, so offering them as *event* categories is what made
owners guess which surface to publish on.

These tests are failing-by-construction against the pre-MEH-1657 code:
`VALID_CATEGORIES` held 6 values there, so `test_workshop_rejected` and
`test_tour_rejected` got **201** where they now assert 400, and
`test_exactly_four_categories` read 6 where it now asserts 4. That is the
discrimination — a test that merely posted "שוק" would have passed both
before and after and proved nothing.

The mirror-image assertion matters just as much: Experience categories still
carry "סדנה"/"סיור אוכל" (see `test_experience_vocabulary_still_has_workshop`).
A future sweep that "cleans up" the word everywhere would break the axis in the
opposite direction, and this file is where that gets caught.

REUSES: tests/test_verified_email_enforcement.py — producer+user wiring and the
`_event_payload` shape.
"""

from datetime import date
from uuid import uuid4

from app.routers.events import VALID_CATEGORIES
from conftest import auth_header, make_producer, make_user

# The locked 4. Spelled out literally rather than imported-and-counted so the
# test states the intent independently of the module it guards.
EVENT_CATEGORIES_LOCKED = {"שוק", "קטיף", "טעימות", "אחר"}

# Removed by MEH-1657 — these belong to experiences.
EXPERIENCE_ONLY_WORDS = ["סדנה", "סיור"]


def _approved_producer_user(db, *, email: str):
    producer = make_producer(db, name=f"MEH1657 {uuid4().hex[:6]}", status="approved")
    user = make_user(db, role="producer", email=email, email_verified=True)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


def _event_payload(category, **overrides):
    payload = {
        "title": "יום פתוח במאפייה",
        "event_date": date(2099, 1, 1).isoformat(),
        "category": category,
    }
    payload.update(overrides)
    return payload


class TestEventCategorySet:
    def test_exactly_four_categories(self):
        """6 before MEH-1657, 4 after — the numeric assertion the card requires."""
        assert VALID_CATEGORIES == EVENT_CATEGORIES_LOCKED
        assert len(VALID_CATEGORIES) == 4

    def test_workshop_not_an_event_category(self):
        assert "סדנה" not in VALID_CATEGORIES

    def test_tour_not_an_event_category(self):
        assert "סיור" not in VALID_CATEGORIES


class TestCreateEventCategoryGate:
    """POST /events — the wire-level proof, which is what owners actually hit."""

    def test_workshop_rejected(self, client, db):
        """Returned 201 before MEH-1657. This is the failing-before assertion."""
        _, user = _approved_producer_user(db, email="meh1657-workshop@example.com")

        resp = client.post(
            "/events",
            json=_event_payload("סדנה"),
            headers=auth_header(user),
        )

        assert resp.status_code == 400, resp.text

    def test_tour_rejected(self, client, db):
        """Returned 201 before MEH-1657."""
        _, user = _approved_producer_user(db, email="meh1657-tour@example.com")

        resp = client.post(
            "/events",
            json=_event_payload("סיור"),
            headers=auth_header(user),
        )

        assert resp.status_code == 400, resp.text

    def test_all_four_valid_categories_accepted(self, client, db):
        """The removal must not have narrowed the set past the locked 4."""
        for i, category in enumerate(sorted(EVENT_CATEGORIES_LOCKED)):
            _, user = _approved_producer_user(
                db, email=f"meh1657-valid-{i}@example.com"
            )

            resp = client.post(
                "/events",
                json=_event_payload(category),
                headers=auth_header(user),
            )

            assert resp.status_code == 201, f"{category}: {resp.text}"
            assert resp.json()["category"] == category


class TestExperienceVocabularyUntouched:
    """The scope guard, as an assertion.

    MEH-1657 removes these words from the EVENT set only. An experience IS a
    workshop or a tour, so the moderation prompt must keep describing them —
    a sweep that greps the word globally would silently break the other half
    of the axis, and nothing else in the suite would notice.
    """

    def test_experience_moderation_prompt_still_names_workshops(self):
        from pathlib import Path

        import app.services.experience_moderation as mod

        source = Path(mod.__file__).read_text(encoding="utf-8")
        for word in EXPERIENCE_ONLY_WORDS:
            assert word in source, (
                f"{word!r} vanished from experience_moderation.py — MEH-1657 "
                "removes it from EVENT categories only; experiences keep it."
            )
