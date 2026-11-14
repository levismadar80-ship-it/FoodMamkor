"""MEH-3256 (grill retro D8) — accept an owner invite on an EXISTING account.

`/auth/owner-invite/accept` creates a new account, so an owner who had signed
up as a consumer got «האימייל הזה כבר רשום» and no way in. She now signs in
and accepts on that account: a code goes to the account's own verified
address, the account becomes the business's owner, and every older session
is retired.
"""

from unittest import mock

from conftest import auth_header, make_user
from app.models import Producer, User
from app.routers import producer_owner_invite_existing as poe
from test_producer_owner_invite import _row, approved, invite, own

CODE_URL = "/auth/owner-invite/email-code-existing"
ACCEPT_URL = "/auth/owner-invite/accept-existing"


def _consumer(db, email="owner-existing@example.com", **kw):
    return make_user(db, role="consumer", email=email, **kw)


def _arm(client, token, user):
    seen = []
    with mock.patch.object(
        poe, "send_owner_invite_code_email", side_effect=lambda *a, **k: seen.append(a)
    ):
        r = client.post(CODE_URL, json={"token": token}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert len(seen) == 1
    return seen[0]


def _accept(client, token, user, code, **over):
    body = {
        "token": token,
        "code": code,
        "terms_accepted": True,
        "declaration_accepted": True,
    }
    return client.post(ACCEPT_URL, json=body | over, headers=auth_header(user))


def _header(user):
    """A header for the account's CURRENT token_version (auth_header signs v0)."""
    from app.auth import create_access_token

    return {
        "Authorization": f"Bearer {create_access_token(user.id, user.token_version)}"
    }


def _invited(client, db):
    producer = approved(db)
    r, token = invite(client, db, producer)
    assert r.status_code == 200, r.text
    return producer, token


def test_signed_in_consumer_becomes_the_owner(client, db):
    producer, token = _invited(client, db)
    user = _consumer(db)
    old_header = auth_header(user)
    version_before = user.token_version
    to, _business, code = _arm(client, token, user)[:3]
    assert (
        to == "owner-existing@example.com"
    )  # the ACCOUNT's address, never a typed one

    r = _accept(client, token, user, code)
    assert r.status_code == 200, r.text

    db.expire_all()
    u = db.get(User, user.id)
    assert (u.role, u.producer_id, u.is_producer) == ("producer", producer.id, True)
    p = _row(db, producer)
    assert p.owner_invite_accepted_at is not None
    assert p.owner_invite_token_hash is None and p.declared_at is not None
    # The consumer session is retired; the new one is the owner's.
    assert client.get("/auth/me", headers=old_header).status_code == 401
    # The returned token is fingerprint-bound (`__Secure-Fgp` cannot travel
    # over TestClient's http://), so read its claim and the cookies instead —
    # the same split test_producer_owner_invite.py makes.
    from joserfc import jwt as jose_jwt

    from app.auth import _jwt_key

    claims = jose_jwt.decode(r.json()["access_token"], _jwt_key()).claims
    assert claims["sub"] == str(user.id)
    assert claims["tv"] == u.token_version == version_before + 1
    assert "userFingerprint" in claims
    set_cookie = " ".join(r.headers.get_list("set-cookie"))
    assert "refresh" in set_cookie.lower() and "fgp" in set_cookie.lower()
    me = client.get("/auth/me", headers=_header(u))
    assert me.status_code == 200 and me.json()["role"] == "producer"
    # The link is spent.
    again = client.post(
        ACCEPT_URL,
        json={
            "token": token,
            "code": code,
            "terms_accepted": True,
            "declaration_accepted": True,
        },
        headers=_header(u),
    )
    assert again.status_code == 404


def test_admin_account_is_refused_without_writes(client, db):
    producer, token = _invited(client, db)
    admin = make_user(db, role="admin", email="admin-3256@example.com")
    r = client.post(CODE_URL, json={"token": token}, headers=auth_header(admin))
    assert r.status_code == 403
    r = _accept(client, token, admin, "123456")
    assert r.status_code == 403
    db.expire_all()
    assert db.get(User, admin.id).role == "admin"
    assert _row(db, producer).owner_invite_accepted_at is None


def test_account_with_a_business_is_refused(client, db):
    _, token = _invited(client, db)
    other = approved(db, name="עסק אחר")
    owner = own(db, other, email="has-one@example.com")
    r = client.post(CODE_URL, json={"token": token}, headers=auth_header(owner))
    assert r.status_code == 409
    assert "כבר יש בית עסק" in r.json()["detail"]


def test_unverified_and_anonymous_are_refused(client, db):
    _, token = _invited(client, db)
    unverified = _consumer(
        db, email="unverified-3256@example.com", email_verified=False
    )
    assert (
        client.post(
            CODE_URL, json={"token": token}, headers=auth_header(unverified)
        ).status_code
        == 403
    )
    assert client.post(CODE_URL, json={"token": token}).status_code == 401


def test_wrong_code_spends_one_attempt_and_changes_nothing(client, db):
    producer, token = _invited(client, db)
    user = _consumer(db)
    _arm(client, token, user)
    r = _accept(client, token, user, "000000")
    assert r.status_code == 422
    db.expire_all()
    assert db.get(User, user.id).role == "consumer"
    assert _row(db, producer).owner_invite_code_attempts == 1


def test_code_minted_for_one_account_is_useless_to_another(client, db):
    """The row records the address the code went to; a second account holding
    the same link cannot spend it."""
    _, token = _invited(client, db)
    a = _consumer(db, email="first-3256@example.com")
    b = _consumer(db, email="second-3256@example.com")
    code = _arm(client, token, a)[2]
    assert _accept(client, token, b, code).status_code == 422
    db.expire_all()
    assert db.get(User, b.id).producer_id is None


def test_business_that_already_has_an_owner_is_refused(client, db):
    producer, token = _invited(client, db)
    user = _consumer(db)
    code = _arm(client, token, user)[2]
    own(db, producer, email="got-there-first@example.com")
    r = _accept(client, token, user, code)
    assert r.status_code == 409
    db.expire_all()
    assert db.get(User, user.id).producer_id is None


def test_one_account_cannot_take_two_businesses(client, db):
    first, t1 = _invited(client, db)
    second = approved(db, name="עסק שני")
    r, t2 = invite(client, db, second)
    user = _consumer(db)
    c1 = _arm(client, t1, user)[2]
    c2 = _arm(client, t2, user)[2]
    assert _accept(client, t1, user, c1).status_code == 200
    db.expire_all()
    fresh_user = db.get(User, user.id)
    r = client.post(
        ACCEPT_URL,
        json={
            "token": t2,
            "code": c2,
            "terms_accepted": True,
            "declaration_accepted": True,
        },
        headers=_header(fresh_user),
    )
    assert r.status_code == 409
    assert (
        db.query(Producer).filter_by(id=second.id).one().owner_invite_accepted_at
        is None
    )


def test_dead_link_is_404_before_anything(client, db):
    user = _consumer(db)
    r = client.post(CODE_URL, json={"token": "x" * 43}, headers=auth_header(user))
    assert r.status_code == 404


def _change_during_code_check(field_values):
    """Run the real code check, then change the account row the way a
    parallel request (admin block, logout-all, another tab) would between
    `get_current_user` and the row lock."""
    real = poe._verify_email_code

    def wrapped(db, producer, email, code, now):
        real(db, producer, email, code, now)
        from sqlalchemy import update

        db.execute(update(User).where(User.email == email).values(**field_values))

    return mock.patch.object(poe, "_verify_email_code", side_effect=wrapped)


def _assert_untouched(db, producer, user):
    db.expire_all()
    u = db.get(User, user.id)
    assert u.producer_id is None and u.role == "consumer"
    assert _row(db, producer).owner_invite_accepted_at is None


def test_blocked_between_auth_and_lock_is_refused(client, db):
    producer, token = _invited(client, db)
    user = _consumer(db)
    code = _arm(client, token, user)[2]
    with _change_during_code_check({"is_blocked": True}):
        r = _accept(client, token, user, code)
    assert r.status_code == 403, r.text
    _assert_untouched(db, producer, user)


def test_session_revoked_between_auth_and_lock_is_refused(client, db):
    producer, token = _invited(client, db)
    user = _consumer(db)
    code = _arm(client, token, user)[2]
    with _change_during_code_check({"token_version": 7}):
        r = _accept(client, token, user, code)
    assert r.status_code == 401, r.text
    _assert_untouched(db, producer, user)


def test_business_attached_between_auth_and_lock_is_refused(client, db):
    """Discriminates the locked re-read: the pre-lock check saw no business."""
    producer, token = _invited(client, db)
    other = approved(db, name="עסק אחר")
    user = _consumer(db)
    code = _arm(client, token, user)[2]
    with _change_during_code_check({"producer_id": other.id}):
        r = _accept(client, token, user, code)
    assert r.status_code == 409, r.text
    assert _row(db, producer).owner_invite_accepted_at is None


def test_super_admin_email_is_refused(client, db, monkeypatch):
    from app.config import settings

    _, token = _invited(client, db)
    user = _consumer(db, email="boss-3256@example.com")
    monkeypatch.setattr(settings, "super_admin_email", "boss-3256@example.com")
    r = client.post(CODE_URL, json={"token": token}, headers=auth_header(user))
    assert r.status_code == 403, r.text


def test_blocked_account_is_refused(client, db):
    _, token = _invited(client, db)
    user = _consumer(db, is_blocked=True)
    r = client.post(CODE_URL, json={"token": token}, headers=auth_header(user))
    assert r.status_code == 403


def test_non_consumer_role_is_not_overwritten(client, db):
    _, token = _invited(client, db)
    user = make_user(db, role="producer", email="role-3256@example.com")
    r = client.post(CODE_URL, json={"token": token}, headers=auth_header(user))
    assert r.status_code == 409
