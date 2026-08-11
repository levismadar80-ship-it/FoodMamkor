"""MEH-1153 — server-side parity: category_ids must be non-empty.

The client already gates ≥1 category, but a direct API POST could omit
category_ids or send `[]` and create an uncategorised producer (invisible
in category browsing). ProducerRegister (POST /auth/register/producer) and
ProducerCreate (POST /producers) now enforce ≥1 category at the schema
layer via a field_validator + validate_default=True, so BOTH the
missing-field and empty-list cases 422 with a Hebrew message.

Phone is intentionally NOT changed here — it is already conditionally
enforced by the register handler (auth.py) for whatsapp/phone contact
methods; see the MEH-1153 Phase-0 note.
"""

from conftest import (
    auth_header,
    make_category,
    make_user,
    valid_producer_register_payload,
)

_CATEGORY_ERROR_HE = "חובה לבחור לפחות קטגוריה אחת"


def _category_error_present(detail) -> bool:
    """The Hebrew message surfaces in the 422 body (FastAPI prefixes
    field-validator ValueErrors with 'Value error, ')."""
    return any(_CATEGORY_ERROR_HE in str(item.get("msg", "")) for item in detail)


# ---------- POST /auth/register/producer (ProducerRegister) ----------


def test_register_valid_categories_succeeds(client, db):
    """Baseline: a normal registration (≥1 category) still works.

    The shared helper omits phone; primary_contact_method='whatsapp' requires
    one (handler 422s otherwise, unrelated to categories) — add it here.
    """
    payload = valid_producer_register_payload() | {"phone": "0501234567"}
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code in (200, 201), resp.text


def test_register_empty_categories_returns_422(client, db):
    payload = valid_producer_register_payload() | {"category_ids": []}
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 422
    assert _category_error_present(resp.json()["detail"]), resp.text


def test_register_missing_categories_returns_422(client, db):
    payload = valid_producer_register_payload()
    del payload["category_ids"]
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 422
    assert _category_error_present(resp.json()["detail"]), resp.text


# ---------- POST /producers (ProducerCreate) ----------

_CREATE_BASE = {
    "name": "חוות הקטגוריה",
    "city": "תל אביב",
    "phone": "0501234567",
}


def test_create_valid_categories_succeeds(client, db):
    user = make_user(db, email="cat-creator@example.com")
    cat = make_category(db)
    payload = {**_CREATE_BASE, "category_ids": [cat.id]}
    resp = client.post("/producers", json=payload, headers=auth_header(user))
    assert resp.status_code == 201, resp.text


def test_create_empty_categories_returns_422(client, db):
    user = make_user(db, email="cat-empty@example.com")
    payload = {**_CREATE_BASE, "category_ids": []}
    resp = client.post("/producers", json=payload, headers=auth_header(user))
    assert resp.status_code == 422
    assert _category_error_present(resp.json()["detail"]), resp.text


def test_create_missing_categories_returns_422(client, db):
    user = make_user(db, email="cat-missing@example.com")
    resp = client.post("/producers", json=_CREATE_BASE, headers=auth_header(user))
    assert resp.status_code == 422
    assert _category_error_present(resp.json()["detail"]), resp.text
