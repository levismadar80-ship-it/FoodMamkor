"""MEH-1943 chunk 2: the five class-(b) 4xx answers stop listing internal values.

Before this chunk, each of these `detail=` strings ended with the raw allowed
set (`['active', 'paused', ...]`, `kosher_mehadrin, ...`) or raw UUIDs, and
the dashboard rendered it as is. The wording approved in the card's 03/11 ערב
block keeps only the opening sentence. The raw list moves to `params` (logs,
debugging), and every answer carries a stable `code`, the same `{code,
message, params}` shape chunk 1 gave ONE_PRIMARY_REQUIRED.

Each test asserts the whole detail object, so it fails on the old code (a
plain string) and pins the approved message by literal (rule 22: approved
copy needs a literal guard).
"""

import uuid
from datetime import date

from conftest import auth_header, make_producer, make_user


def _owner(db, email="owner-1943b@example.com"):
    producer = make_producer(db, status="approved")
    user = make_user(db, role="producer", email=email, email_verified=True)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return user


def _no_raw_values(detail, raw):
    """The message must not carry any of the internal values it used to list."""
    for value in raw:
        assert str(value) not in detail["message"], (value, detail["message"])


# MEH-2758: test_legacy_availability_status_is_a_code went with the legacy
# POST /producers/me/availability-status endpoint.


def test_availability_state_is_a_code(client, db):
    from app.routers.producer_me import WRITABLE_AVAILABILITY_STATES as AVAILABILITY_STATES

    user = _owner(db)
    r = client.post(
        "/producers/me/availability-state",
        json={"state": "bogus"},
        headers=auth_header(user),
    )
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert detail == {
        "code": "invalid_availability_state",
        "message": "מצב לא תקין",
        "params": {"allowed": list(AVAILABILITY_STATES)},
    }
    _no_raw_values(detail, AVAILABILITY_STATES)


def test_kashrut_badge_code_is_a_code(client, db):
    from app.routers.producer_me import VALID_BADGE_CODES

    user = _owner(db)
    r = client.post(
        "/producers/me/kashrut-request",
        json={"badge_code": "notreal"},
        headers=auth_header(user),
    )
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert detail == {
        "code": "invalid_badge_code",
        "message": "קוד תג לא תקין",
        "params": {"allowed": sorted(VALID_BADGE_CODES)},
    }
    _no_raw_values(detail, VALID_BADGE_CODES)


def test_event_category_is_a_code(client, db):
    from app.routers.events import VALID_CATEGORIES

    user = _owner(db)
    payload = {
        "title": "שוק גלם בנמל",
        "event_date": date(2099, 1, 1).isoformat(),
        "category": "לא-קטגוריה",
        "city": "תל אביב",
    }
    r = client.post("/events", json=payload, headers=auth_header(user))
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert detail == {
        "code": "invalid_event_category",
        "message": "קטגוריה לא תקינה",
        "params": {"allowed": sorted(VALID_CATEGORIES)},
    }
    _no_raw_values(detail, VALID_CATEGORIES)


def test_recipe_missing_products_is_a_code(client, db):
    user = _owner(db)
    missing = str(uuid.uuid4())
    payload = {
        "title": "חלת מחמצת קלאסית",
        "description": "מתכון פשוט לחלה",
        "ingredients": "קמח, מים, מלח, מחמצת",
        "instructions": "לערבב, ללוש, להתפיח ולאפות ב-220 מעלות.",
        "prep_time_min": 30,
        "cook_time_min": 35,
        "servings": 8,
        "product_ids": [missing],
    }
    r = client.post("/producers/me/recipes", json=payload, headers=auth_header(user))
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert detail == {
        "code": "products_not_found",
        "message": "חלק מהמוצרים לא נמצאו",
        "params": {"product_ids": [missing]},
    }
    assert missing not in detail["message"]
    assert "product_ids" not in detail["message"]


def test_recipe_patch_missing_products_is_a_code(client, db):
    """PATCH shares _validate_product_ids with POST; pinned so the two can't drift."""
    user = _owner(db, email="owner-1943b-patch@example.com")
    payload = {
        "title": "חלת מחמצת קלאסית",
        "description": "מתכון פשוט לחלה",
        "ingredients": "קמח, מים, מלח, מחמצת",
        "instructions": "לערבב, ללוש, להתפיח ולאפות ב-220 מעלות.",
        "prep_time_min": 30,
        "cook_time_min": 35,
        "servings": 8,
        "product_ids": [],
    }
    created = client.post(
        "/producers/me/recipes", json=payload, headers=auth_header(user)
    )
    assert created.status_code == 201, created.text
    missing = str(uuid.uuid4())
    r = client.patch(
        f"/producers/me/recipes/{created.json()['id']}",
        json={"product_ids": [missing]},
        headers=auth_header(user),
    )
    assert r.status_code == 422
    assert r.json()["detail"] == {
        "code": "products_not_found",
        "message": "חלק מהמוצרים לא נמצאו",
        "params": {"product_ids": [missing]},
    }
