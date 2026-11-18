"""MEH-3425 — three follow-ups to MEH-3104 on PATCH /users/me email changes.

1. Wrong passwords were limited only per IP (10/hour on the route), so a
   stolen session behind rotating IPs could keep guessing. Now 5 wrong
   passwords per ACCOUNT per hour lock the change for that account.
2. After a change, every other device stayed signed in. Now token_version
   moves, so other sessions die; this device gets fresh cookies.
3. An account with no password and no Google/Apple id was told «הסיסמה
   הנוכחית שגויה», which it cannot fix. It now gets its own message.

Behaviour pinned, not implementation.
"""
from unittest.mock import patch

import pytest

from app.auth import create_access_token, create_refresh_token
from app.services import email_change_guard
from conftest import auth_header, make_user

SEND = "app.routers.users_me.send_verify_email"
NOTICE = "app.routers.users_me.send_email_changed_notice"
PASSWORD = "Zx7Yp9Mq2Lr4"  # guard-ok: test fixture, make_user default password, not a credential


@pytest.fixture
def trusted_proxy(monkeypatch):
    # X-Real-IP is honoured only behind the trusted proxy (rate_limit.py).
    monkeypatch.setenv("TRUSTED_PROXY", "1")


def _set_cookie(response, name):
    # REUSES: tests/test_auth.py `_extract_set_cookie` — httpx joins several
    # Set-Cookie headers into one, so read them as a list (MEH-327).
    for hdr in response.headers.get_list("set-cookie"):
        if hdr.startswith(f"{name}="):
            return hdr.split("=", 1)[1].split(";")[0].strip()
    return None


def _patch_from(client, user, body, ip, headers=None):
    with patch(SEND), patch(NOTICE):
        return client.patch(
            "/users/me",
            json=body,
            headers={**(headers or auth_header(user)), "X-Real-IP": ip},
        )


class TestWrongPasswordCapPerAccount:
    def test_five_wrong_from_five_ips_then_locked_even_with_right_password(
        self, client, db, trusted_proxy
    ):
        user = make_user(db, email="cap1@example.com")
        wrong = {"email": "cap1-new@example.com", "current_password": "wrong-one-123"}
        statuses = [
            _patch_from(client, user, wrong, f"203.0.113.{n}").status_code
            for n in range(1, 6)
        ]
        assert statuses == [403] * 5

        right = {"email": "cap1-new@example.com", "current_password": PASSWORD}
        res = _patch_from(client, user, right, "203.0.113.50")
        assert res.status_code == 429, res.text
        assert res.json()["detail"] == email_change_guard.TOO_MANY_DETAIL
        db.refresh(user)
        assert user.email == "cap1@example.com"

    def test_right_password_does_not_spend_the_counter(self, client, db, trusted_proxy):
        user = make_user(db, email="cap2@example.com")
        for n in range(6):
            body = {"email": f"cap2-{n}@example.com", "current_password": PASSWORD}
            # Each change signs the old session out; carry on with a fresh one.
            db.refresh(user)
            fresh = {"Authorization": f"Bearer {create_access_token(user.id, user.token_version)}"}
            res = _patch_from(client, user, body, f"198.51.100.{n + 1}", headers=fresh)
            assert res.status_code == 200, res.text

    def test_another_account_is_not_locked(self, client, db, trusted_proxy):
        locked = make_user(db, email="cap3a@example.com")
        other = make_user(db, email="cap3b@example.com")
        wrong = {"email": "cap3a-new@example.com", "current_password": "wrong-one-123"}
        for n in range(1, 6):
            _patch_from(client, locked, wrong, f"192.0.2.{n}")
        body = {"email": "cap3b-new@example.com", "current_password": PASSWORD}
        assert _patch_from(client, other, body, "192.0.2.1").status_code == 200

    def test_counter_failure_fails_open(self, client, db, trusted_proxy, monkeypatch):
        def _boom(*_a, **_k):
            raise RuntimeError("storage down")

        monkeypatch.setattr(email_change_guard, "parse_limit", _boom)
        user = make_user(db, email="cap4@example.com")
        body = {"email": "cap4-new@example.com", "current_password": PASSWORD}
        assert _patch_from(client, user, body, "192.0.2.80").status_code == 200


    def test_wrong_password_with_counter_down_is_still_403(
        self, client, db, trusted_proxy, monkeypatch
    ):
        def _boom(*_a, **_k):
            raise RuntimeError("storage down")

        monkeypatch.setattr(email_change_guard, "parse_limit", _boom)
        user = make_user(db, email="cap5@example.com")
        body = {"email": "cap5-new@example.com", "current_password": "wrong-one-123"}
        assert _patch_from(client, user, body, "192.0.2.81").status_code == 403

    def test_missing_password_does_not_spend_the_counter(self, client, db, trusted_proxy):
        user = make_user(db, email="cap6@example.com")
        empty = {"email": "cap6-new@example.com"}
        for n in range(1, 7):
            assert _patch_from(client, user, empty, f"192.0.2.{100 + n}").status_code == 403
        right = {"email": "cap6-new@example.com", "current_password": PASSWORD}
        assert _patch_from(client, user, right, "192.0.2.120").status_code == 200


class TestOtherDevicesSignedOut:
    def test_old_token_dies_and_this_device_gets_fresh_cookies(self, client, db):
        user = make_user(db, email="so1@example.com")
        old_headers = auth_header(user)
        old_refresh = create_refresh_token(user.id, user.token_version)
        before = user.token_version
        res = _patch_from(
            client,
            user,
            {"email": "so1-new@example.com", "current_password": PASSWORD},
            "192.0.2.90",
            headers=old_headers,
        )
        assert res.status_code == 200, res.text
        db.refresh(user)
        assert user.token_version == before + 1
        assert client.get("/auth/me", headers=old_headers).status_code == 401

        # This device recovers: the NEW cookies refresh, the old one does not.
        new_refresh = _set_cookie(res, "refresh_token")
        new_fp = _set_cookie(res, "__Secure-Fgp")
        assert new_refresh and new_fp
        ok = client.post(
            "/auth/refresh", cookies={"refresh_token": new_refresh, "__Secure-Fgp": new_fp}
        )
        assert ok.status_code == 200, ok.text
        stale = client.post(
            "/auth/refresh",
            cookies={"refresh_token": old_refresh, "__Secure-Fgp": new_fp},
        )
        assert stale.status_code == 401, stale.text

    def test_name_only_change_keeps_the_session(self, client, db):
        user = make_user(db, email="so2@example.com")
        headers = auth_header(user)
        before = user.token_version
        res = _patch_from(client, user, {"name": "שם אחר"}, "192.0.2.91", headers=headers)
        assert res.status_code == 200, res.text
        db.refresh(user)
        assert user.token_version == before
        assert client.get("/auth/me", headers=headers).status_code == 200


class TestAccountWithoutPassword:
    def test_gets_its_own_message(self, client, db):
        user = make_user(db, email="nopw@example.com")
        user.password_hash = None
        db.commit()
        res = _patch_from(
            client,
            user,
            {"email": "nopw-new@example.com", "current_password": "anything-123"},
            "192.0.2.95",
        )
        assert res.status_code == 403, res.text
        assert res.json()["detail"] == email_change_guard.NO_PASSWORD_DETAIL
        db.refresh(user)
        assert user.email == "nopw@example.com"
