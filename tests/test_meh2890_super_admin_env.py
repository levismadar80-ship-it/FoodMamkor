"""MEH-2890 — the protected owner account comes from SUPER_ADMIN_EMAIL.

It used to be a hard-coded private address in admin_extra.py and in the admin
users page, in a public repo. Sapir 10/11: read it from the env, no address in
the code, FAIL CLOSED when unset in production.

Fail closed is at boot, the same as JWT_SECRET_KEY: production does not start
without a valid value, so a running production always has the owner
protected. Outside production, unset means nobody is protected (logged).
"""

import pytest

from app import config
from app.models.models import User
from app.routers import admin_extra
from tests.conftest import auth_header, make_user

OWNER = "owner@example.com"


def _boot(monkeypatch, *, env, super_admin_email=None):
    """Run the real settings loader against a controlled environment."""
    monkeypatch.setenv("ENV", env)
    monkeypatch.setenv("SECRET_KEY", "x" * 64)
    if super_admin_email is None:
        monkeypatch.delenv("SUPER_ADMIN_EMAIL", raising=False)
    else:
        monkeypatch.setenv("SUPER_ADMIN_EMAIL", super_admin_email)
    return config._load_settings()


# ── boot: fail closed in production only ─────────────────────────────────────


def test_production_refuses_to_boot_without_super_admin_email(monkeypatch):
    with pytest.raises(RuntimeError, match="SUPER_ADMIN_EMAIL"):
        _boot(monkeypatch, env="production")


@pytest.mark.parametrize(
    "bad",
    ["", "   ", "owner", "owner@", "@example.com", "owner@localhost", "a@b@c.com"],
)
def test_production_refuses_to_boot_with_a_value_that_is_not_an_email(monkeypatch, bad):
    with pytest.raises(RuntimeError, match="SUPER_ADMIN_EMAIL"):
        _boot(monkeypatch, env="production", super_admin_email=bad)


def test_production_boots_with_a_valid_value_normalised(monkeypatch):
    s = _boot(monkeypatch, env="production", super_admin_email="  Owner@Example.COM ")
    assert s.super_admin_email == OWNER


@pytest.mark.parametrize("env", ["development", "staging", "test"])
def test_outside_production_unset_boots_and_protects_nobody(monkeypatch, env):
    s = _boot(monkeypatch, env=env)
    assert s.super_admin_email == ""


def test_outside_production_a_bad_value_is_dropped_not_half_used(monkeypatch):
    s = _boot(monkeypatch, env="staging", super_admin_email="owner")
    assert s.super_admin_email == ""


# ── the guards read the setting, case-insensitively ──────────────────────────


@pytest.fixture
def owner_configured(monkeypatch):
    monkeypatch.setattr(admin_extra.settings, "super_admin_email", OWNER)


def test_role_change_of_the_owner_is_refused_whatever_the_case(
    client, db, owner_configured
):
    admin = make_user(db, role="admin")
    owner = make_user(db, role="admin", email="Owner@Example.com")

    r = client.put(
        f"/admin/users/{owner.id}/role",
        json={"role": "consumer"},
        headers=auth_header(admin),
    )

    assert r.status_code == 403, r.text
    db.expire_all()
    assert db.query(User).filter(User.id == owner.id).one().role == "admin"


def test_delete_of_the_owner_is_refused(client, db, owner_configured):
    admin = make_user(db, role="admin")
    owner = make_user(db, role="producer", email=OWNER)

    r = client.delete(f"/admin/users/{owner.id}", headers=auth_header(admin))

    assert r.status_code == 403, r.text
    db.expire_all()
    assert db.query(User).filter(User.id == owner.id).first() is not None


def test_another_users_role_change_still_works(client, db, owner_configured):
    """Control: the guard is about ONE account, not all admin actions."""
    admin = make_user(db, role="admin")
    other = make_user(db, role="consumer")

    r = client.put(
        f"/admin/users/{other.id}/role",
        json={"role": "admin"},
        headers=auth_header(admin),
    )

    assert r.status_code == 200, r.text


def test_unset_protects_nobody(client, db, monkeypatch):
    """Dev / tests / a staging without the var: the same address is an ordinary
    account. Production cannot reach this state — it does not boot."""
    monkeypatch.setattr(admin_extra.settings, "super_admin_email", "")
    admin = make_user(db, role="admin")
    owner = make_user(db, role="producer", email=OWNER)

    r = client.delete(f"/admin/users/{owner.id}", headers=auth_header(admin))

    assert r.status_code == 200, r.text


# ── the list tells the page which row is protected ───────────────────────────


def test_list_flags_only_the_owner(client, db, owner_configured):
    admin = make_user(db, role="admin")
    make_user(db, role="producer", email="OWNER@example.com")
    make_user(db, role="consumer")

    r = client.get("/admin/users", headers=auth_header(admin))

    assert r.status_code == 200, r.text
    flagged = [u["email"].lower() for u in r.json() if u["is_super_admin"]]
    assert flagged == [OWNER]


def test_no_address_is_left_in_the_code():
    """The point of the change: the owner's mailbox is not in the source."""
    import inspect

    assert "@gmail.com" not in inspect.getsource(admin_extra)
    assert "@gmail.com" not in inspect.getsource(config)
