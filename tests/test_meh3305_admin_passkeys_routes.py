"""MEH-3305 part 3 — an admin's passkey as the second step of signing in.

The browser side is a software authenticator (an ES256 key, "none"
attestation) built here from the WebAuthn spec, so every check below runs
the real py_webauthn verification, not a mock of it.

Behaviour pinned:
- feature off (no WEBAUTHN_RP_ID): an admin with a passkey row still gets a
  token from /auth/login, and the passkey routes answer 404;
- on: adding a passkey needs the password; the first one returns 10 codes;
- from then on /auth/login, /auth/google and /auth/apple return a ticket
  and no session (no token, no refresh cookie); the passkey finishes it;
- a ticket is single-use, bound to its purpose and its account, and dies
  with a token_version bump;
- a recovery code signs in once; a wrong one is refused;
- removing a passkey needs a passkey (or a code); removing the last one
  takes the codes with it, and the password alone works again;
- another admin's passkey cannot be removed, a consumer cannot add one, a
  consumer's sign-in is unchanged.
"""

import hashlib
import inspect
import json
import os
import struct
from base64 import urlsafe_b64decode, urlsafe_b64encode

import cbor2
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

from app.config import settings
from app.models import User
from app.models.admin_passkeys import AdminPasskey, AdminRecoveryCode
from app.routers import auth as auth_router
from app.services import admin_passkey as pk
from tests.conftest import make_user

RP_ID = "staging.mehamakor.online"
ORIGIN = "https://staging.mehamakor.online"
# The password make_user() gives every account (tests/conftest.py), read
# from its signature so the two can never drift apart.
PASSWORD = inspect.signature(make_user).parameters["password"].default


def b64(data: bytes) -> str:
    return urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64(text: str) -> bytes:
    return urlsafe_b64decode(text + "=" * (-len(text) % 4))


class SoftAuthenticator:
    """One passkey on one fake device."""

    def __init__(self, origin: str = ORIGIN, rp_id: str = RP_ID) -> None:
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.cred_id = os.urandom(16)
        self.count = 0
        self.origin = origin
        self.rp_id = rp_id

    def _cose(self) -> bytes:
        nums = self.key.public_key().public_numbers()
        return cbor2.dumps(
            {
                1: 2,
                3: -7,
                -1: 1,
                -2: nums.x.to_bytes(32, "big"),
                -3: nums.y.to_bytes(32, "big"),
            }
        )

    def _client_data(self, kind: str, options: dict) -> bytes:
        return json.dumps(
            {
                "type": kind,
                "challenge": options["challenge"],
                "origin": self.origin,
                "crossOrigin": False,
            }
        ).encode()

    def create(self, options: dict) -> dict:
        cdj = self._client_data("webauthn.create", options)
        # UP | UV | BE | BS | AT
        flags = 0x01 | 0x04 | 0x08 | 0x10 | 0x40
        auth_data = (
            hashlib.sha256(self.rp_id.encode()).digest()
            + bytes([flags])
            + struct.pack(">I", self.count)
            + bytes(16)
            + struct.pack(">H", len(self.cred_id))
            + self.cred_id
            + self._cose()
        )
        att = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        return {
            "id": b64(self.cred_id),
            "rawId": b64(self.cred_id),
            "type": "public-key",
            "response": {
                "clientDataJSON": b64(cdj),
                "attestationObject": b64(att),
                "transports": ["internal", "hybrid"],
            },
            "clientExtensionResults": {},
        }

    def get(self, options: dict, user_verified: bool = True) -> dict:
        self.count += 1
        cdj = self._client_data("webauthn.get", options)
        flags = 0x01 | (0x04 if user_verified else 0) | 0x08 | 0x10
        auth_data = (
            hashlib.sha256(self.rp_id.encode()).digest()
            + bytes([flags])
            + struct.pack(">I", self.count)
        )
        sig = self.key.sign(
            auth_data + hashlib.sha256(cdj).digest(), ec.ECDSA(hashes.SHA256())
        )
        return {
            "id": b64(self.cred_id),
            "rawId": b64(self.cred_id),
            "type": "public-key",
            "response": {
                "clientDataJSON": b64(cdj),
                "authenticatorData": b64(auth_data),
                "signature": b64(sig),
            },
            "clientExtensionResults": {},
        }


@pytest.fixture
def client(client):
    """HTTPS, so the Secure fingerprint cookie travels like in a browser and
    a token from these routes is checked end to end (MEH-327 binding)."""
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app, base_url="https://testserver")


@pytest.fixture
def passkeys_on(monkeypatch):
    # The two settings arrive in config.py with the Chrome commit (part 2);
    # patching the readers works before and after it.
    monkeypatch.setattr(pk, "rp_id", lambda: RP_ID)
    monkeypatch.setattr(pk, "origins", lambda: [ORIGIN])


def _token(client, user, password=PASSWORD):
    r = client.post("/auth/login", json={"email": user.email, "password": password})
    assert r.status_code == 200, r.text
    return r


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _session(client, user) -> dict:
    """A real signed-in session (fingerprint cookie included)."""
    return _h(_token(client, user).json()["access_token"])


def _enroll(client, user, device=None) -> tuple[SoftAuthenticator, dict, list]:
    device = device or SoftAuthenticator()
    h = _session(client, user)
    r = client.post(
        "/auth/passkey/register/options", json={"password": PASSWORD}, headers=h
    )
    assert r.status_code == 200, r.text
    body = r.json()
    r = client.post(
        "/auth/passkey/register/verify",
        json={
            "ticket": body["ticket"],
            "credential": device.create(body["options"]),
            "name": "הטלפון",
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    return device, h, r.json()["recovery_codes"]


def _second_step(client, user):
    r = _token(client, user)
    body = r.json()
    assert body.get("passkey_required") is True, body
    return r, body


def test_off_without_rp_id_the_password_is_enough(client, db):
    admin = make_user(db, role="admin")
    db.add(AdminPasskey(user_id=admin.id, credential_id=b"x", public_key=b"pk"))
    db.commit()
    r = _token(client, admin)
    assert "access_token" in r.json()
    r = client.post(
        "/auth/passkey/register/options",
        json={"password": PASSWORD},
        headers=_session(client, admin),
    )
    assert r.status_code == 404


def test_enroll_then_sign_in_with_the_passkey(client, db, passkeys_on):
    admin = make_user(db, role="admin")
    device, _h0, codes = _enroll(client, admin)
    assert len(codes) == 10 and len(set(codes)) == 10
    stored = db.query(AdminRecoveryCode).filter_by(user_id=admin.id).all()
    assert all(c.replace("-", "") not in r.code_hash for r in stored for c in codes)
    row = db.query(AdminPasskey).filter_by(user_id=admin.id).one()
    assert row.name == "הטלפון" and row.backup_eligible is True

    client.cookies.clear()
    r, body = _second_step(client, admin)
    assert "access_token" not in body
    assert "refresh_token" not in r.headers.get("set-cookie", "")

    r = client.post(
        "/auth/passkey/login/verify",
        json={"ticket": body["ticket"], "credential": device.get(body["options"])},
    )
    assert r.status_code == 200, r.text
    assert "refresh_token" in r.headers.get("set-cookie", "")
    me = client.get("/auth/me", headers=_h(r.json()["access_token"]))
    assert me.status_code == 200 and me.json()["email"] == admin.email


def test_adding_a_passkey_needs_the_password(client, db, passkeys_on):
    admin = make_user(db, role="admin")
    h = _session(client, admin)
    r = client.post(
        "/auth/passkey/register/options",
        json={"password": "wrong-password-1"},
        headers=h,
    )
    assert r.status_code == 403
    r = client.post("/auth/passkey/register/options", json={}, headers=h)
    assert r.status_code == 403


def test_a_login_ticket_is_spent_once(client, db, passkeys_on):
    admin = make_user(db, role="admin")
    device, _h0, _codes = _enroll(client, admin)
    _r, body = _second_step(client, admin)
    cred = device.get(body["options"])
    ok = client.post(
        "/auth/passkey/login/verify",
        json={"ticket": body["ticket"], "credential": cred},
    )
    assert ok.status_code == 200
    # Same assertion again: refused (the counter did not move)...
    again = client.post(
        "/auth/passkey/login/verify",
        json={"ticket": body["ticket"], "credential": cred},
    )
    assert again.status_code == 401
    # ...and a FRESH assertion on the same ticket is refused too: the ticket
    # itself is spent, whatever the authenticator's counter says.
    fresh = client.post(
        "/auth/passkey/login/verify",
        json={"ticket": body["ticket"], "credential": device.get(body["options"])},
    )
    assert fresh.status_code == 401


def test_a_ticket_for_another_purpose_does_not_sign_in(client, db, passkeys_on):
    admin = make_user(db, role="admin")
    device, h, _codes = _enroll(client, admin)
    r = client.post("/auth/passkey/step-up/options", headers=h)
    body = r.json()
    r = client.post(
        "/auth/passkey/login/verify",
        json={"ticket": body["ticket"], "credential": device.get(body["options"])},
    )
    assert r.status_code == 401


def test_another_accounts_passkey_does_not_sign_in(client, db, passkeys_on):
    a = make_user(db, role="admin")
    b = make_user(db, role="admin")
    _dev_a, _x, _c = _enroll(client, a)
    dev_b, _x, _c = _enroll(client, b)
    _r, body = _second_step(client, a)
    r = client.post(
        "/auth/passkey/login/verify",
        json={"ticket": body["ticket"], "credential": dev_b.get(body["options"])},
    )
    assert r.status_code == 401


def test_wrong_origin_and_missing_user_verification_are_refused(
    client, db, passkeys_on
):
    admin = make_user(db, role="admin")
    device, _x, _c = _enroll(client, admin)
    _r, body = _second_step(client, admin)
    device.origin = "https://evil.example.com"
    r = client.post(
        "/auth/passkey/login/verify",
        json={"ticket": body["ticket"], "credential": device.get(body["options"])},
    )
    assert r.status_code == 401
    device.origin = ORIGIN
    _r, body = _second_step(client, admin)
    r = client.post(
        "/auth/passkey/login/verify",
        json={
            "ticket": body["ticket"],
            "credential": device.get(body["options"], user_verified=False),
        },
    )
    assert r.status_code == 401


def test_a_password_change_kills_an_open_ticket(client, db, passkeys_on):
    admin = make_user(db, role="admin")
    device, _x, _c = _enroll(client, admin)
    _r, body = _second_step(client, admin)
    user = db.query(User).filter_by(id=admin.id).one()
    user.token_version = (user.token_version or 1) + 1
    db.commit()
    r = client.post(
        "/auth/passkey/login/verify",
        json={"ticket": body["ticket"], "credential": device.get(body["options"])},
    )
    assert r.status_code == 401


def test_a_recovery_code_signs_in_once(client, db, passkeys_on):
    admin = make_user(db, role="admin")
    _device, _x, codes = _enroll(client, admin)
    _r, body = _second_step(client, admin)
    r = client.post(
        "/auth/passkey/login/recovery",
        json={"ticket": body["ticket"], "code": codes[0].lower()},
    )
    assert r.status_code == 200, r.text
    _r, body = _second_step(client, admin)
    r = client.post(
        "/auth/passkey/login/recovery",
        json={"ticket": body["ticket"], "code": codes[0]},
    )
    assert r.status_code == 401
    _r, body = _second_step(client, admin)
    r = client.post(
        "/auth/passkey/login/recovery",
        json={"ticket": body["ticket"], "code": "AAAAA-AAAAA"},
    )
    assert r.status_code == 401
    h = _h(
        client.post(
            "/auth/passkey/login/recovery",
            json={"ticket": _second_step(client, admin)[1]["ticket"], "code": codes[1]},
        ).json()["access_token"]
    )
    assert client.get("/auth/passkey", headers=h).json()["recovery_codes_left"] == 8


def test_removing_a_passkey_needs_the_passkey_and_the_last_takes_the_codes(
    client, db, passkeys_on
):
    admin = make_user(db, role="admin")
    device, _h0, _codes = _enroll(client, admin)
    _r, body = _second_step(client, admin)
    tok = client.post(
        "/auth/passkey/login/verify",
        json={"ticket": body["ticket"], "credential": device.get(body["options"])},
    ).json()["access_token"]
    h = _h(tok)
    pid = client.get("/auth/passkey", headers=h).json()["passkeys"][0]["id"]

    # The password is no longer enough once a passkey exists.
    r = client.post(
        f"/auth/passkey/{pid}/delete", json={"password": PASSWORD}, headers=h
    )
    assert r.status_code == 403

    opts = client.post("/auth/passkey/step-up/options", headers=h).json()
    r = client.post(
        f"/auth/passkey/{pid}/delete",
        json={"ticket": opts["ticket"], "credential": device.get(opts["options"])},
        headers=h,
    )
    assert r.status_code == 204
    db.expire_all()
    assert db.query(AdminPasskey).filter_by(user_id=admin.id).count() == 0
    assert db.query(AdminRecoveryCode).filter_by(user_id=admin.id).count() == 0
    assert "access_token" in _token(client, admin).json()


def test_another_admins_passkey_cannot_be_removed(client, db, passkeys_on):
    a = make_user(db, role="admin")
    b = make_user(db, role="admin")
    _dev, _x, codes_a = _enroll(client, a)
    _dev, _x, _c = _enroll(client, b)
    pid_b = db.query(AdminPasskey).filter_by(user_id=b.id).one().id
    _r, body = _second_step(client, a)
    h = _h(
        client.post(
            "/auth/passkey/login/recovery",
            json={"ticket": body["ticket"], "code": codes_a[0]},
        ).json()["access_token"]
    )
    r = client.post(
        f"/auth/passkey/{pid_b}/delete", json={"recovery_code": codes_a[1]}, headers=h
    )
    assert r.status_code == 404
    assert db.query(AdminPasskey).filter_by(id=pid_b).count() == 1


def test_a_consumer_cannot_add_one_and_signs_in_as_before(client, db, passkeys_on):
    user = make_user(db, role="consumer")
    r = _token(client, user)
    assert "access_token" in r.json()
    r = client.post(
        "/auth/passkey/register/options",
        json={"password": PASSWORD},
        headers=_h(r.json()["access_token"]),
    )
    assert r.status_code == 403


@pytest.mark.parametrize("provider", ["google", "apple"])
def test_google_and_apple_sign_in_also_stop_at_the_passkey(
    client, db, passkeys_on, monkeypatch, provider
):
    admin = make_user(db, role="admin", email="noa-admin@example.com")
    _enroll(client, admin)
    # A Google / Apple account has no password (a password account gets 409).
    admin = db.query(User).filter_by(id=admin.id).one()
    admin.password_hash = None
    admin.google_id = f"{provider}-sub"
    admin.apple_id = f"{provider}-sub"
    db.commit()
    identity = {"sub": f"{provider}-sub", "email": admin.email, "name": "נועה"}
    monkeypatch.setattr(settings, "google_client_id", "dummy-google-id")
    monkeypatch.setattr(settings, "apple_client_id", "dummy-apple-id")
    monkeypatch.setattr(auth_router, "_verify_google_token", lambda token: identity)
    monkeypatch.setattr(auth_router, "_verify_apple_token", lambda token: identity)
    monkeypatch.setattr(auth_router, "_upload_google_avatar_or_none", lambda url: None)
    client.cookies.clear()
    r = client.post(f"/auth/{provider}", json={"id_token": "x", "terms_accepted": True})
    assert r.status_code == 200, r.text
    assert r.json().get("passkey_required") is True
    assert "access_token" not in r.json()
    assert "refresh_token" not in r.headers.get("set-cookie", "")


def test_at_most_ten_passkeys(client, db, passkeys_on):
    admin = make_user(db, role="admin")
    for i in range(10):
        db.add(
            AdminPasskey(
                user_id=admin.id, credential_id=f"c{i}".encode(), public_key=b"pk"
            )
        )
    db.commit()
    monkeypatch_h = _h(auth_router.create_access_token(admin.id))
    r = client.post(
        "/auth/passkey/register/options",
        json={"password": PASSWORD},
        headers=monkeypatch_h,
    )
    assert r.status_code == 409


def test_a_wrong_code_does_not_burn_the_ticket(client, db, passkeys_on):
    admin = make_user(db, role="admin")
    _device, _x, codes = _enroll(client, admin)
    _r, body = _second_step(client, admin)
    bad = client.post(
        "/auth/passkey/login/recovery",
        json={"ticket": body["ticket"], "code": "AAAAA-AAAAA"},
    )
    assert bad.status_code == 401
    assert bad.json()["detail"] == "קוד השחזור לא נכון או שכבר השתמשת בו"
    ok = client.post(
        "/auth/passkey/login/recovery",
        json={"ticket": body["ticket"], "code": codes[0]},
    )
    assert ok.status_code == 200, ok.text
    # ...and once a RIGHT code used it, the ticket is spent.
    again = client.post(
        "/auth/passkey/login/recovery",
        json={"ticket": body["ticket"], "code": codes[1]},
    )
    assert again.status_code == 401


def test_wrong_codes_have_their_own_budget(client, db, passkeys_on):
    admin = make_user(db, role="admin")
    _device, _x, codes = _enroll(client, admin)
    _r, body = _second_step(client, admin)
    from app.services import admin_passkey as svc

    user = db.query(User).filter_by(id=admin.id).one()
    for _ in range(10):
        svc.record_recovery_failure(user)
    r = client.post(
        "/auth/passkey/login/recovery",
        json={"ticket": body["ticket"], "code": codes[0]},
    )
    assert r.status_code == 429
    # The password budget is untouched: the first step still answers.
    assert _token(client, admin).json().get("passkey_required") is True


def test_a_code_used_as_step_up_is_spent(client, db, passkeys_on):
    admin = make_user(db, role="admin")
    _device, _x, codes = _enroll(client, admin)
    _r, body = _second_step(client, admin)
    h = _h(
        client.post(
            "/auth/passkey/login/recovery",
            json={"ticket": body["ticket"], "code": codes[0]},
        ).json()["access_token"]
    )
    r = client.post(
        "/auth/passkey/recovery-codes", json={"recovery_code": codes[1]}, headers=h
    )
    assert r.status_code == 200
    new = r.json()["recovery_codes"]
    assert len(new) == 10 and not set(new) & set(codes)
    # The old codes are gone with the renewal, the one used as proof included.
    r = client.post(
        "/auth/passkey/recovery-codes", json={"recovery_code": codes[2]}, headers=h
    )
    assert r.status_code == 403
