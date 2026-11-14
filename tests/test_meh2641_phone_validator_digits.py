"""MEH-2641: `_phone_validator` returns the digit projection (plus a leading
`+` when typed), never `cleaned` with junk characters still in it.

Before: only `[\\s()\\-]` was stripped and `cleaned` was returned, so
'+++++++++++++++0501234567' and 'ABCDEFGHIJKLMNO0501234567' (25 chars) passed
validation and reached `String(20)` phone columns -> Postgres DataError -> 500.
"""
import pytest

from app.models.models import Producer
from app.schemas.schemas import _phone_validator
from conftest import auth_header, make_producer, make_user


@pytest.mark.parametrize(
    "raw",
    ["+" * 15 + "0501234567", "ABCDEFGHIJKLMNO0501234567", "05.01.23.45.67", "0501234567"],
)
def test_returns_digits_only(raw):
    out = _phone_validator(raw)
    assert out.lstrip("+").isdigit(), out
    assert len(out) <= 20


def test_keeps_one_leading_plus():
    assert _phone_validator("+972 50-123-4567") == "+972501234567"
    assert _phone_validator("050-123-4567") == "0501234567"


def test_still_rejects_bad_numbers():
    with pytest.raises(ValueError):
        _phone_validator("12345")


def test_long_junk_phone_never_500s_on_a_string20_column(client, db):
    # Producer.phone is String(20) (models.py); the owner edit route takes a
    # PhoneNumberField.
    owner = make_user(db, role="producer")
    producer = make_producer(db, status="approved")
    owner.producer_id = producer.id
    db.commit()
    resp = client.put(
        "/producers/me",
        json={"phone": "+" * 15 + "0501234567"},
        headers=auth_header(owner),
    )
    assert resp.status_code < 500, resp.text
