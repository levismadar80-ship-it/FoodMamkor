"""MEH-3095: changing the account email drops the verified state.

`email_verified` says "this person proved she reads this address". PATCH
/users/me used to swap the address and keep the flag, so a verified account
could move to an address nobody proved and keep every verified-only action
(publishing an event, an experience, a recipe).

Behaviour pinned here, not the implementation: after the change the account
is unverified, a verified-only gate refuses it, a fresh link is mailed to the
NEW address, and that link verifies it again.
"""

from unittest.mock import patch

from app.auth import require_verified_email
from app.models.models import User
from conftest import auth_header, make_user

SEND = "app.routers.users_me.send_verify_email"


def _patch_email(client, user, email):
    return client.patch("/users/me", json={"email": email}, headers=auth_header(user))


class TestEmailChangeNeedsANewVerification:
    def test_a_new_address_is_unverified_and_gets_a_link(self, client, db):
        user = make_user(db, email="old@test.com", email_verified=True)
        with patch(SEND) as send:
            res = _patch_email(client, user, "new@test.com")
        assert res.status_code == 200
        assert res.json()["email"] == "new@test.com"
        assert res.json()["email_verified"] is False
        db.refresh(user)
        assert user.email_verified is False
        assert user.email_verify_token
        assert user.email_verify_expires is not None
        # The link goes to the address that has to be proved, never the old one.
        assert send.call_count == 1
        assert send.call_args.args[0] == "new@test.com"
        assert send.call_args.args[2] == user.email_verify_token

    def test_the_verified_only_gate_refuses_after_the_change(self, client, db):
        user = make_user(db, email="old2@test.com", email_verified=True)
        assert require_verified_email(user) is user
        with patch(SEND):
            _patch_email(client, user, "new2@test.com")
        db.refresh(user)
        try:
            require_verified_email(user)
        except Exception as exc:  # HTTPException 403
            assert getattr(exc, "status_code", None) == 403
        else:
            raise AssertionError("a changed, unproved address passed the gate")

    def test_the_mailed_link_verifies_the_new_address(self, client, db):
        user = make_user(db, email="old3@test.com", email_verified=True)
        with patch(SEND):
            _patch_email(client, user, "new3@test.com")
        db.refresh(user)
        res = client.get(f"/auth/verify-email?token={user.email_verify_token}")
        assert res.status_code == 200
        # The link proves the address. It never signs anyone in: no browser
        # holds a signup marker for this token.
        assert "access_token" not in res.json()
        assert "refresh_token" not in res.cookies
        db.refresh(user)
        assert user.email_verified is True
        assert user.email == "new3@test.com"

    def test_the_same_address_keeps_the_verified_state(self, client, db):
        user = make_user(db, email="same@test.com", email_verified=True)
        with patch(SEND) as send:
            res = _patch_email(client, user, "SAME@test.com")
        assert res.status_code == 200
        db.refresh(user)
        assert user.email_verified is True
        assert user.email_verify_token is None
        assert send.call_count == 0

    def test_a_name_only_update_keeps_the_verified_state(self, client, db):
        user = make_user(db, email_verified=True)
        with patch(SEND) as send:
            res = client.patch(
                "/users/me", json={"name": "שם חדש"}, headers=auth_header(user)
            )
        assert res.status_code == 200
        db.refresh(user)
        assert user.email_verified is True
        assert send.call_count == 0

    def test_a_taken_address_changes_nothing(self, client, db):
        make_user(db, email="taken@test.com")
        user = make_user(db, email="mine@test.com", email_verified=True)
        with patch(SEND) as send:
            res = _patch_email(client, user, "taken@test.com")
        assert res.status_code == 409
        db.refresh(user)
        assert user.email == "mine@test.com"
        assert user.email_verified is True
        assert send.call_count == 0

    def test_an_old_pending_link_dies_with_the_old_address(self, client, db):
        user = make_user(db, email="old4@test.com", email_verified=False)
        user.email_verify_token = "example-token-changeme"
        db.commit()
        with patch(SEND):
            assert _patch_email(client, user, "new4@test.com").status_code == 200
        res = client.get("/auth/verify-email?token=example-token-changeme")
        assert res.status_code == 404
        assert db.query(User).filter(User.id == user.id).one().email_verified is False

    def test_a_google_account_cannot_move_to_another_address(self, client, db):
        user = make_user(db, email="g@test.com", email_verified=True)
        user.google_id = "google-sub-1"
        db.commit()
        with patch(SEND) as send:
            res = _patch_email(client, user, "victim@test.com")
        assert res.status_code == 400
        db.refresh(user)
        assert user.email == "g@test.com"
        assert user.email_verified is True
        assert send.call_count == 0

    def test_an_apple_account_cannot_move_to_another_address(self, client, db):
        user = make_user(db, email="a@test.com", email_verified=True)
        user.apple_id = "apple-sub-1"
        db.commit()
        with patch(SEND):
            res = _patch_email(client, user, "victim2@test.com")
        assert res.status_code == 400
        db.refresh(user)
        assert user.email == "a@test.com"

    def test_a_google_account_can_still_change_its_name(self, client, db):
        user = make_user(db, email="g2@test.com")
        user.google_id = "google-sub-2"
        db.commit()
        res = client.patch(
            "/users/me",
            json={"name": "שם חדש", "email": "g2@test.com"},
            headers=auth_header(user),
        )
        assert res.status_code == 200
