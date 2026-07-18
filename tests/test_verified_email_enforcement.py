"""MEH-1164 (Chunk 2 / audit F5) — verified-email enforcement on the
producer content-create endpoints.

The verification banner promises that publishing is gated on a verified
email, but three producer create endpoints only checked producer-role
(`require_producer`), so a producer with an unverified email could still
create content:

  - POST /events              (events.py:create_event)
  - POST /producers/me/recipes (producer_recipes.py:create_my_recipe)
  - POST /group-buys          (group_buys.py:create_group_buy)

They now depend on `require_verified_producer` (auth.py) which composes
`require_producer` (role check FIRST) with the email-verified check, so
the error precedence is: non-producer -> "Producer access required";
producer-but-unverified -> the Hebrew "יש לאמת…" 403.

experiences.py already used `require_verified_email` directly and is left
unchanged — the last test below is a regression guard proving that.

REUSES: tests/test_group_buys_api.py + tests/test_producer_recipes.py +
tests/test_experiences.py — the producer-user wiring and valid create
payloads.
"""

from datetime import date, datetime, timedelta
from uuid import uuid4

from conftest import auth_header, make_producer, make_user

# The structured 403 detail raised by require_verified_email /
# require_verified_producer (auth.py). MEH-1164 sub-chunk B made this an
# object {code, message} so the frontend matches on a stable, locale-neutral
# `code`; `message` keeps the existing Hebrew constant for transition safety.
# Kept here as constants so a copy/shape tweak in auth.py surfaces as a
# failing assertion rather than silent drift.
VERIFY_CODE = "email_unverified"
VERIFY_MESSAGE = "יש לאמת את כתובת האימייל תחילה"


def _assert_verify_detail(resp):
    """The 403 body carries the structured unverified-email detail."""
    detail = resp.json()["detail"]
    assert detail == {"code": VERIFY_CODE, "message": VERIFY_MESSAGE}, resp.text


# ---------- helpers ----------


def _producer_user(db, *, email: str, verified: bool, status: str = "approved"):
    """An approved producer + its owning user, email verified per `verified`."""
    producer = make_producer(db, name=f"VE Producer {uuid4().hex[:6]}", status=status)
    user = make_user(db, role="producer", email=email, email_verified=verified)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


def _event_payload(**overrides):
    payload = {
        "title": "סדנת אפייה",
        "event_date": date(2099, 1, 1).isoformat(),
        "category": "סדנה",  # in events.VALID_CATEGORIES
    }
    payload.update(overrides)
    return payload


def _recipe_payload(**overrides):
    payload = {
        "title": "חלת מחמצת קלאסית",
        "description": "מתכון פשוט לחלה ביתית עם הקמח שלנו",
        "ingredients": "500 גרם קמח\n10 גרם מלח\n350 מל מים\n100 גרם מחמצת",
        "instructions": "ערבבי, לושי 10 דקות, תני לתפיחה, אפי ב-220 מעלות 35 דקות.",
        "prep_time_min": 30,
        "cook_time_min": 35,
        "servings": 8,
        "image_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        "product_ids": [],
    }
    payload.update(overrides)
    return payload


def _group_buy_payload(**overrides):
    payload = {
        "title": "רכש שמן זית",
        "product_name": "שמן זית כתית",
        "unit": "ליטר",
        "price_per_unit_regular": 80,
        "price_per_unit_group": 60,
        "min_participants": 3,
        "deadline": (datetime.utcnow() + timedelta(days=10)).isoformat(),
        "city": "חיפה",
    }
    payload.update(overrides)
    return payload


# ---------- unverified producer -> 403 with the Hebrew detail ----------


class TestUnverifiedProducerBlocked:
    def _assert_blocked(self, client, db, path, payload_fn, email):
        _, user = _producer_user(db, email=email, verified=False)
        resp = client.post(path, json=payload_fn(), headers=auth_header(user))
        assert resp.status_code == 403, (path, resp.status_code, resp.text)
        _assert_verify_detail(resp)

    def test_events_blocked(self, client, db):
        self._assert_blocked(client, db, "/events", _event_payload, "ev-unv@example.com")

    def test_recipes_blocked(self, client, db):
        self._assert_blocked(
            client, db, "/producers/me/recipes", _recipe_payload, "rc-unv@example.com"
        )

    def test_group_buys_blocked(self, client, db):
        self._assert_blocked(
            client, db, "/group-buys", _group_buy_payload, "gb-unv@example.com"
        )


# ---------- verified producer -> passes the gate (201) ----------


class TestVerifiedProducerPasses:
    def test_events_pass(self, client, db):
        _, user = _producer_user(db, email="ev-ver@example.com", verified=True)
        resp = client.post("/events", json=_event_payload(), headers=auth_header(user))
        assert resp.status_code == 201, resp.text

    def test_recipes_pass(self, client, db):
        # Moderation fail-opens to APPROVED with no ANTHROPIC_API_KEY (the
        # documented AI fail-open), so a verified producer reaches 201.
        _, user = _producer_user(db, email="rc-ver@example.com", verified=True)
        resp = client.post(
            "/producers/me/recipes", json=_recipe_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 201, resp.text

    def test_group_buys_pass(self, client, db):
        _, user = _producer_user(db, email="gb-ver@example.com", verified=True)
        resp = client.post(
            "/group-buys", json=_group_buy_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 201, resp.text


# ---------- role precedence: non-producer -> "Producer access required" ----------


class TestRolePrecedence:
    def test_verified_consumer_gets_producer_error_first(self, client, db):
        # A verified consumer must fail the ROLE check (require_producer runs
        # first), NOT the email check — proves the composed-dep precedence.
        consumer = make_user(
            db, role="consumer", email="cons-ver@example.com", email_verified=True
        )
        resp = client.post(
            "/events", json=_event_payload(), headers=auth_header(consumer)
        )
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Producer access required"


# ---------- regression: experiences already enforced, still blocks ----------


class TestExperiencesUnchanged:
    def test_unverified_producer_blocked_on_experiences(self, client, db):
        # experiences.py:create uses require_verified_email directly (not
        # touched by MEH-1164 Chunk 2) — this guards that it stays enforced.
        _, user = _producer_user(db, email="exp-unv@example.com", verified=False)
        payload = {
            "title": "סדנת אפיית לחם מחמצת לכל המשפחה",
            "description": "סדנה מעשית של 3 שעות ללימוד אפיית לחם מחמצת ביתי.",
            "image_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
            "category": "בישול",
            "event_date": (date.today() + timedelta(days=14)).isoformat(),
            "event_time": "10:00",
            "location_type": "home",
            "city": "תל אביב",
            "address": "רחוב הרצל 1",
            "price_per_person": 150,
            "max_participants": 10,
            "is_recurring": False,
        }
        resp = client.post("/experiences", json=payload, headers=auth_header(user))
        assert resp.status_code == 403
        _assert_verify_detail(resp)
