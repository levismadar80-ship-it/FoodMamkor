"""MEH-2900 — PUT /admin/users/{user_id}/role: who may grant admin.

Area 1 of MEH-2899 (risk ranking: a permission change). The handler is
`update_user_role` in backend/app/routers/admin_extra.py; its guards, in order:

  require_admin (auth.py)            → 401 no token, 403 any non-admin
  target lookup                      → 404 unknown id
  role == "producer"                 → 422 (MEH-955, covered in
                                       test_admin_role_orphan_source.py)
  protected owner (super admin)      → 403, whatever the requested role
  admin demoting herself             → 403
  UserRoleUpdate.role pattern        → 422 for anything outside
                                       consumer|producer|admin

Already covered elsewhere and NOT repeated here: consumer→admin / admin→
consumer happy paths and the producer refusal (test_admin_role_orphan_source),
deleting the protected owner (test_meh2585_admin_delete_user).

The role is not a token claim (auth.create_access_token carries sub / exp /
iat / tv / scope only); require_admin reads `user.role` from the DB on every
request. So a role change needs no token_version bump to take effect, in
either direction — the two `*_existing_token` tests pin exactly that.

Every assertion here was shown red against deliberately broken product code
and green after the revert (MEH-1619); the run links are in the PR body.
"""
import uuid

import pytest

from app.models import User
from app.routers import admin_extra

from tests.conftest import auth_header, make_producer, make_user

ADMIN_PROBE = "/admin/users"  # any require_admin route; GET, no body


class KnownGap(AssertionError):
    """Raised only by the one assertion a strict xfail is about. The xfail
    marks pass `raises=KnownGap`, so a broken precondition or setup in those
    tests is reported as a real failure, never swallowed as "expected"."""


def _role_url(user_id) -> str:
    return f"/admin/users/{user_id}/role"


def valid_role_payload() -> dict:
    """Passes UserRoleUpdate and every handler guard for a plain consumer
    target. Guard tests send this (or `| {"role": bad}`), so a 401/403/404
    can never be a 422 from body validation in disguise (regression rule 6)."""
    return {"role": "admin"}


def _role_in_db(db, user_id) -> str:
    db.expire_all()
    return db.query(User).filter(User.id == user_id).one().role


def _business_owner(db, *, kind: str = "producer") -> User:
    """A self-registered owner: role=producer, linked to her Producer row.
    An organizer is the same User shape with Producer.kind="organizer"
    (ADR-036) — there is no "organizer" user role."""
    producer = make_producer(db, name="חוות הניסוי" if kind == "producer" else "שוק גלם")
    producer.kind = kind
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    owner.is_producer = True
    db.commit()
    db.refresh(owner)
    return owner


@pytest.fixture
def protected_owner_email(monkeypatch) -> str:
    """Make a test-only address the protected owner, by whichever mechanism
    the code under test uses.

    staging: the module constant `admin_extra.SUPER_ADMIN_EMAIL`.
    after PR #4280 (MEH-2890): `settings.super_admin_email` (SUPER_ADMIN_EMAIL
    env), read by `admin_extra.is_super_admin` at call time.

    The branch is on the mechanism, never on the outcome. If neither exists the
    test fails loudly instead of silently testing an unprotected account.
    Mechanism-specific assertions (exact match, empty = nobody) belong to
    #4280's own tests.
    """
    email = "protected-owner-meh2900@example.com"
    if hasattr(admin_extra, "SUPER_ADMIN_EMAIL"):
        monkeypatch.setattr(admin_extra, "SUPER_ADMIN_EMAIL", email)
    else:
        from app.config import settings

        if not hasattr(settings, "super_admin_email"):
            pytest.fail(
                "neither admin_extra.SUPER_ADMIN_EMAIL nor "
                "settings.super_admin_email exists — the protected-owner "
                "mechanism moved; update this fixture"
            )
        monkeypatch.setattr(settings, "super_admin_email", email)
    return email


# ---------------------------------------------------------------- 401 / 403


@pytest.mark.parametrize("caller_kind", ["consumer", "producer", "organizer"])
def test_non_admin_cannot_grant_admin_to_herself(client, db, caller_kind):
    """The real escalation path: a logged-in non-admin promotes HERSELF.
    The payload is valid and the self-demotion guard does not apply
    (role="admin"), so require_admin is the only thing standing in the way."""
    if caller_kind == "consumer":
        caller = make_user(db, role="consumer")
    else:
        caller = _business_owner(db, kind=caller_kind)
    role_before = caller.role

    resp = client.put(
        _role_url(caller.id), json=valid_role_payload(), headers=auth_header(caller)
    )

    assert resp.status_code == 403, resp.text
    assert _role_in_db(db, caller.id) == role_before


def test_non_admin_cannot_change_another_users_role(client, db):
    caller = make_user(db, role="consumer")
    victim = make_user(db, role="consumer")

    resp = client.put(
        _role_url(victim.id), json=valid_role_payload(), headers=auth_header(caller)
    )

    assert resp.status_code == 403, resp.text
    assert _role_in_db(db, victim.id) == "consumer"


def test_no_token_gets_401_and_nothing_changes(client, db):
    target = make_user(db, role="consumer")

    resp = client.put(_role_url(target.id), json=valid_role_payload())

    assert resp.status_code == 401, resp.text
    assert _role_in_db(db, target.id) == "consumer"


# ---------------------------------------------------------- grant / revoke


def test_granted_admin_works_on_the_targets_existing_token(client, db):
    """Card: «ההרשאה נכנסת לתוקף מיד» — the very next request with the token
    she already holds reaches /admin/*. The role lives in the DB, not in the
    token, so token_version is deliberately NOT bumped: a bump would 401 that
    token and, since her refresh token carries the same old `tv`, log her out
    instead of promoting her."""
    admin = make_user(db, role="admin")
    target = make_user(db, role="consumer")
    target_headers = auth_header(target)  # issued BEFORE the grant
    tv_before = target.token_version

    # Precondition: this exact token is refused before the grant.
    assert client.get(ADMIN_PROBE, headers=target_headers).status_code == 403

    resp = client.put(
        _role_url(target.id), json={"role": "admin"}, headers=auth_header(admin)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "admin"

    after = client.get(ADMIN_PROBE, headers=target_headers)
    assert after.status_code == 200, after.text

    db.expire_all()
    assert db.query(User).filter(User.id == target.id).one().token_version == tv_before


def test_demoted_admin_loses_admin_on_her_existing_token(client, db):
    """The half that matters for security: with no token_version bump, a
    demoted admin's still-valid token must stop reaching /admin/* on the next
    request. 401 or 403 both satisfy it — this pins the outcome, not whether
    a future change also chooses to end her session."""
    admin = make_user(db, role="admin")
    other_admin = make_user(db, role="admin")
    other_headers = auth_header(other_admin)  # issued BEFORE the demotion

    assert client.get(ADMIN_PROBE, headers=other_headers).status_code == 200

    resp = client.put(
        _role_url(other_admin.id), json={"role": "consumer"}, headers=auth_header(admin)
    )
    assert resp.status_code == 200, resp.text

    after = client.get(ADMIN_PROBE, headers=other_headers)
    assert after.status_code in (401, 403), after.text


# ----------------------------------------------------- the protected owner


@pytest.mark.parametrize(
    "owner_role,requested",
    [
        ("admin", "consumer"),
        # Production's owner account is role=producer (test_meh2585 docstring);
        # demoting it to consumer would strand her business.
        ("producer", "consumer"),
    ],
)
def test_protected_owner_cannot_be_demoted(
    client, db, protected_owner_email, owner_role, requested
):
    """The same request against an ordinary admin answers 200
    (test_demoted_admin_loses_admin_on_her_existing_token), so this 403 is the
    owner guard, not a blanket refusal of demotions."""
    admin = make_user(db, role="admin")
    owner = make_user(db, role=owner_role, email=protected_owner_email)

    resp = client.put(
        _role_url(owner.id), json={"role": requested}, headers=auth_header(admin)
    )

    assert resp.status_code == 403, resp.text
    assert _role_in_db(db, owner.id) == owner_role


@pytest.mark.xfail(
    strict=True,
    reason=(
        "MEH-2890 known gap: POST /admin/users/{id}/block has no protected-owner "
        "guard, so any admin can lock the site owner out. Fix needs approved "
        "copy — tracked on MEH-2890, not fixed here."
    ),
    raises=KnownGap,
)
def test_protected_owner_cannot_be_blocked(client, db, protected_owner_email):
    admin = make_user(db, role="admin")
    owner = make_user(db, role="admin", email=protected_owner_email)

    resp = client.post(f"/admin/users/{owner.id}/block", headers=auth_header(admin))

    if resp.status_code != 403:
        raise KnownGap(f"owner block answered {resp.status_code}: {resp.text}")
    db.expire_all()
    assert db.query(User).filter(User.id == owner.id).one().is_blocked is False


# --------------------------------------------------------- invalid input


@pytest.mark.parametrize(
    "bad_role",
    [
        "superuser",
        "Admin",  # case variant of a real role
        "organizer",  # a Producer.kind, never a User.role (ADR-036)
        "admin ",
        "admin\n",  # `$` would match before a trailing newline in Python `re`
        "",
    ],
)
def test_invalid_role_value_is_422_and_nothing_changes(client, db, bad_role):
    admin = make_user(db, role="admin")
    target = make_user(db, role="consumer")

    resp = client.put(
        _role_url(target.id),
        json=valid_role_payload() | {"role": bad_role},
        headers=auth_header(admin),
    )

    assert resp.status_code == 422, resp.text
    assert _role_in_db(db, target.id) == "consumer"


def test_unknown_user_id_is_404(client, db):
    admin = make_user(db, role="admin")

    resp = client.put(
        _role_url(uuid.uuid4()), json=valid_role_payload(), headers=auth_header(admin)
    )

    assert resp.status_code == 404, resp.text


# ------------------------------------------------------------- self change


def test_admin_cannot_demote_herself(client, db):
    """Current behaviour, and the reason the last admin can never remove
    herself: self-demotion is refused, and only an admin can demote an admin,
    so at least one admin always remains."""
    admin = make_user(db, role="admin")
    headers = auth_header(admin)

    resp = client.put(_role_url(admin.id), json={"role": "consumer"}, headers=headers)

    assert resp.status_code == 403, resp.text
    assert _role_in_db(db, admin.id) == "admin"
    assert client.get(ADMIN_PROBE, headers=headers).status_code == 200


# -------------------------------------------------------------- finding


@pytest.mark.xfail(
    strict=True,
    reason=(
        "MEH-2902: promoting a business owner to admin flips role off "
        "'producer'; require_producer gates on role alone, so every "
        "/producers/me* 403s and the endpoint refuses role=producer, so there "
        "is no way back. Needs a product decision."
    ),
    raises=KnownGap,
)
def test_promoting_a_business_owner_keeps_her_business(client, db):
    """Outcome only, so any of MEH-2902's options turns this XPASS: refuse the
    change, let a linked admin keep her dashboard, or restore producer."""
    admin = make_user(db, role="admin")
    owner = _business_owner(db)
    owner_headers = auth_header(owner)
    assert client.get("/producers/me", headers=owner_headers).status_code == 200

    client.put(_role_url(owner.id), json={"role": "admin"}, headers=auth_header(admin))

    after = client.get("/producers/me", headers=owner_headers)
    if after.status_code != 200:
        raise KnownGap(f"/producers/me after the grant: {after.status_code}")
