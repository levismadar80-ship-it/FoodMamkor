"""
Module:   test_meh3600_hebrew_account_errors
Purpose:  The account routes refuse in Hebrew, not with a code string
          (routers/CLAUDE.md «Hebrew errors»; copy approved by Sapir 21/11).
History:  MEH-3600 / MEH-3601.
"""
import pytest

from app.models.models import User
from conftest import auth_header


@pytest.mark.parametrize(
    ("ids", "expected"),
    [
        ({"google_id": "g-3600"}, "לחשבון הזה אין סיסמה, כי הכניסה אליו היא דרך Google."),
        ({"apple_id": "a-3600"}, "לחשבון הזה אין סיסמה, כי הכניסה אליו היא דרך Apple."),
        ({}, "לחשבון הזה אין סיסמה."),
    ],
    ids=["google-account", "apple-account", "no-provider"],
)
def test_password_change_without_a_password_names_the_real_provider(client, db, ids, expected):
    user = User(email="oauth-only-3600@example.com", name="OAuth User",
                password_hash=None, role="consumer", email_verified=True, **ids)
    db.add(user)
    db.commit()
    res = client.patch(
        "/users/me/password",
        json={"current_password": "x", "new_password": "Zx7Yp9Mq2Lr4Qw"},  # guard-ok: test fixture, not a credential
        headers=auth_header(user),
    )
    assert res.status_code == 400, res.text
    assert res.json()["detail"] == expected
