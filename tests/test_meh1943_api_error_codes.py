"""MEH-1943 — API errors that named a UI label or an internal word now answer
`{code, message, params}` (backend/app/api_errors.py), and the copy lives in
frontend/messages/*.json under `error.api.<code>`.

Each test calls the real route and asserts the whole detail, so it is red on
the old code, where the detail was a plain Hebrew string (shown 26/11 by
running it against origin/staging's handlers). The message is pinned by
literal because it must equal he.json word for word, which
scripts/checks/backend-error-copy-guard.sh (E2) also holds.
"""

import json
from pathlib import Path

from app.api_errors import api_error_detail
from app.models.models import Product
from conftest import auth_header, make_producer, make_user

HE_API = json.loads(
    (Path(__file__).resolve().parents[1] / "frontend/messages/he.json").read_text()
)["error"]["api"]


def _owner(db, email="owner-1943api@example.com"):
    producer = make_producer(db, status="approved")
    user = make_user(db, role="producer", email=email, email_verified=True)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return user


def test_helper_fills_the_template_from_params():
    detail = api_error_detail("left_units", "נשארו רק {left} יחידות", left=3)
    assert detail == {
        "code": "left_units",
        "message": "נשארו רק 3 יחידות",
        "params": {"left": 3},
    }


def test_helper_without_params_keeps_braces_free_text():
    assert api_error_detail("x", "שלום")["message"] == "שלום"


def test_distance_sort_without_location_names_no_query_parameter(client, db):
    make_producer(db, name="Whatever")
    r = client.get("/producers", params={"sort": "distance"})
    assert r.status_code == 422
    assert r.json()["detail"] == {
        "code": "distance_sort_needs_location",
        "message": HE_API["distance_sort_needs_location"],
        "params": {},
    }
    assert "lat" not in r.json()["detail"]["message"]


def test_price_to_without_from_is_a_coded_422(client, db):
    user = _owner(db)
    p = Product(producer_id=user.producer_id, name="עגבניות")
    db.add(p)
    db.commit()
    db.refresh(p)
    r = client.put(
        f"/producers/me/products/{p.id}", json={"price_max": 40}, headers=auth_header(user)
    )
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["code"] == "product_price_max_needs_min"
    assert r.json()["detail"]["message"] == HE_API["product_price_max_needs_min"]


def test_duplicate_badge_request_speaks_hebrew_only(client, db):
    user = _owner(db, email="owner-1943badge@example.com")
    payload = {"badge_code": "rabanut"}
    client.post("/producers/me/kashrut-request", json=payload, headers=auth_header(user))
    r = client.post("/producers/me/kashrut-request", json=payload, headers=auth_header(user))
    assert r.status_code == 409, r.text
    assert r.json()["detail"] == {
        "code": "badge_request_pending",
        "message": "בקשה לתג הזה כבר ממתינה לאישור",
        "params": {},
    }
