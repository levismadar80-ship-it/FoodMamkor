"""MEH-3274 — a valid but >200-char email is a 422, never a 500.

EmailStr accepts addresses up to 254 chars; every email column is
VARCHAR(200). Before the cap, POST /auth/owner-invite/email-code (and the
other request bodies) let a 201-254 char address reach Postgres.
"""

import pytest
from pydantic import ValidationError

from app.schemas.registration import (
    ForgotPasswordRequest,
    LoginRequest,
    OwnerInviteEmailCodeRequest,
)
from app.schemas.schemas import EMAIL_MAX_LENGTH
from app.schemas.site import ContactIn, DeliveryWaitlistIn, NewsletterIn


def _email(length: int) -> str:
    """A syntactically valid address of exactly `length` chars."""
    domain = "b" * 60 + "." + "c" * 60 + "." + "d" * 60 + ".com"  # 186 chars
    local = "a" * (length - 1 - len(domain))
    assert 1 <= len(local) <= 64
    out = f"{local}@{domain}"
    assert len(out) == length
    return out


LONG = _email(EMAIL_MAX_LENGTH + 1)
EDGE = _email(EMAIL_MAX_LENGTH)


@pytest.mark.parametrize(
    "model, extra",
    [
        (LoginRequest, {"password": "x"}),
        (ForgotPasswordRequest, {}),
        (OwnerInviteEmailCodeRequest, {"token": "t"}),
        (NewsletterIn, {}),
    ],
)
def test_schema_rejects_201_and_accepts_200(model, extra):
    with pytest.raises(ValidationError):
        model(email=LONG, **extra)
    try:
        model(email=EDGE, **extra)
    except ValidationError as exc:  # another field may be required; email must not be the cause
        assert all(e["loc"][0] != "email" for e in exc.errors()), exc


def test_contact_and_waitlist_cap_email():
    for model in (ContactIn, DeliveryWaitlistIn):
        try:
            model(email=LONG)
        except ValidationError as exc:
            assert any(e["loc"][0] == "email" for e in exc.errors())
        else:
            pytest.fail(f"{model.__name__} accepted a {len(LONG)}-char email")


def test_owner_invite_email_code_returns_422_not_500(client):
    resp = client.post(
        "/auth/owner-invite/email-code",
        json={"token": "A" * 43, "email": LONG},
    )
    assert resp.status_code == 422
