"""MEH-2890 — the protected owner account comes from SUPER_ADMIN_EMAIL.

It used to be a hard-coded private address in admin_extra.py and in the admin
users page, in a public repo. Sapir 10/11: read it from the env, no address in
the code, FAIL CLOSED when unset in production.

Fail closed is at boot, the same as JWT_SECRET_KEY: production does not start
without a valid value, so a running production always has the owner
protected. Production = ENV=production OR RAILWAY_ENVIRONMENT=production.
Outside production, unset means nobody is protected (logged).

The match is EXACT (as the old constant was), not case-insensitive: emails are
unique case-sensitively, so a case-insensitive match would hand the protection
to anyone registering a case variant (fresh reviewer on #4280).
"""

from pathlib import Path

import pytest

from app import config
from app.models.models import User
from app.routers import admin_extra
from tests.conftest import auth_header, make_user

OWNER = "owner@example.com"
REPO = Path(__file__).resolve().parents[1]


def _boot(monkeypatch, *, env, super_admin_email="", railway=""):
    """Run the real settings loader against a controlled environment. Every
    var is SET (possibly to ""), never deleted: a real env var beats the
    dotenv file, so a developer's local .env cannot leak into the test."""
    monkeypatch.setenv("ENV", env)
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", railway)
    monkeypatch.setenv("SECRET_KEY", "x" * 64)
    monkeypatch.setenv("SUPER_ADMIN_EMAIL", super_admin_email)
    return config._load_settings()


# ── boot: fail closed in production only ─────────────────────────────────────


def test_production_refuses_to_boot_without_super_admin_email(monkeypatch):
    with pytest.raises(RuntimeError, match="SUPER_ADMIN_EMAIL"):
        _boot(monkeypatch, env="production")


def test_railway_production_refuses_too_even_when_env_is_unset(monkeypatch):
    """ENV defaults to "development"; RAILWAY_ENVIRONMENT is set by Railway
    itself, so a forgotten ENV cannot skip the check."""
    with pytest.raises(RuntimeError, match="SUPER_ADMIN_EMAIL"):
        _boot(monkeypatch, env="development", railway="production")


@pytest.mark.parametrize(
    "bad",
    [
        "   ",
        "owner",
        "owner@",
        "@example.com",
        "owner@localhost",
        "a@b@c.com",
        "mailto:owner@example.com",
        "a@b..com",
        "ex ample@example.com",
    ],
)
def test_production_refuses_to_boot_with_a_value_that_is_not_an_email(monkeypatch, bad):
    with pytest.raises(RuntimeError, match="SUPER_ADMIN_EMAIL"):
        _boot(monkeypatch, env="production", super_admin_email=bad)


def test_production_boots_with_a_valid_value_trimmed_and_unquoted(monkeypatch):
    s = _boot(monkeypatch, env="production", super_admin_email='  "owner@example.com" ')
    assert s.super_admin_email == OWNER


def test_case_is_kept_not_lowered(monkeypatch):
    s = _boot(monkeypatch, env="production", super_admin_email="Owner@example.com")
    assert s.super_admin_email == "Owner@example.com"


@pytest.mark.parametrize("env", ["development", "staging", "test"])
def test_outside_production_unset_boots_and_protects_nobody(monkeypatch, env):
    s = _boot(monkeypatch, env=env)
    assert s.super_admin_email == ""


def test_outside_production_a_bad_value_is_dropped_not_half_used(monkeypatch):
    s = _boot(monkeypatch, env="staging", super_admin_email="owner")
    assert s.super_admin_email == ""


# ── the guards read the setting, exactly ─────────────────────────────────────


@pytest.fixture
def owner_configured(monkeypatch):
    monkeypatch.setattr(admin_extra.settings, "super_admin_email", OWNER)


def test_role_change_of_the_owner_is_refused(client, db, owner_configured):
    admin = make_user(db, role="admin")
    owner = make_user(db, role="admin", email=OWNER)

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


def test_a_case_variant_registered_by_someone_else_is_not_protected(
    client, db, owner_configured
):
    """The hole a case-insensitive match would open: «Owner@…» is a different,
    registrable account, and must not inherit the owner's protection."""
    admin = make_user(db, role="admin")
    impostor = make_user(db, role="consumer", email="Owner@example.com")

    r = client.delete(f"/admin/users/{impostor.id}", headers=auth_header(admin))

    assert r.status_code == 200, r.text


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
    make_user(db, role="producer", email=OWNER)
    make_user(db, role="consumer", email="OWNER@example.com")
    make_user(db, role="consumer")

    r = client.get("/admin/users", headers=auth_header(admin))

    assert r.status_code == 200, r.text
    flagged = [u["email"] for u in r.json() if u["is_super_admin"]]
    assert flagged == [OWNER]


@pytest.mark.parametrize(
    "rel",
    [
        "backend/app/routers/admin_extra.py",
        "backend/app/config.py",
        "frontend/app/[locale]/admin/users/page.js",
        "frontend/e2e/flows/manual/admin-users-reviews-categories.spec.ts",
        "frontend/__tests__/AdminUsersDeleteAction.test.jsx",
    ],
)
def test_no_owner_mailbox_is_left_where_the_constant_lived(rel):
    """The point of the change: the owner's address is in none of the files
    that held or mirrored the old constant."""
    assert "@gmail.com" not in (REPO / rel).read_text(encoding="utf-8")
