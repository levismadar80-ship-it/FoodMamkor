"""MEH-3305 chunk 1 — the two tables an admin's second factor lives in.

`admin_passkeys`: one row per registered passkey (WebAuthn credential).
`admin_recovery_codes`: one row per one-time recovery code, stored hashed.

What is pinned here, and why each matters:
- a credential id belongs to exactly one row (the authenticator's id is
  global; two rows with one id would let a passkey sign in as two accounts);
- both tables go with the account (ON DELETE CASCADE): a deleted admin
  leaves no usable key or code behind;
- the code column holds a hash, never the code, and the model has no field
  that could carry the plain code;
- the migration file matches the model (same tables, same down revision as
  the head it was written on).
"""

from pathlib import Path

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from app.models.admin_passkeys import AdminPasskey, AdminRecoveryCode
from tests.conftest import make_user

ROOT = Path(__file__).resolve().parents[1]
VERSIONS = ROOT / "backend" / "alembic" / "versions"


def test_tables_and_columns(db):
    insp = inspect(db.get_bind())
    keys = {c["name"] for c in insp.get_columns("admin_passkeys")}
    assert keys == {
        "id",
        "user_id",
        "credential_id",
        "public_key",
        "sign_count",
        "aaguid",
        "backup_eligible",
        "backup_state",
        "transports",
        "name",
        "created_at",
        "last_used_at",
    }
    codes = {c["name"] for c in insp.get_columns("admin_recovery_codes")}
    assert codes == {"id", "user_id", "code_hash", "used_at", "created_at"}


def test_a_credential_id_belongs_to_one_row(db):
    a, b = make_user(db, role="admin"), make_user(db, role="admin")
    db.add(AdminPasskey(user_id=a.id, credential_id=b"cred-1", public_key=b"pk"))
    db.commit()
    db.add(AdminPasskey(user_id=b.id, credential_id=b"cred-1", public_key=b"pk2"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_keys_and_codes_go_with_the_account(db):
    admin = make_user(db, role="admin")
    db.add(AdminPasskey(user_id=admin.id, credential_id=b"cred-x", public_key=b"pk"))
    db.add(AdminRecoveryCode(user_id=admin.id, code_hash="h" * 64))
    db.commit()
    db.delete(admin)
    db.commit()
    db.expire_all()
    assert db.query(AdminPasskey).count() == 0
    assert db.query(AdminRecoveryCode).count() == 0


def test_a_new_passkey_starts_unused_with_count_zero(db):
    admin = make_user(db, role="admin")
    row = AdminPasskey(user_id=admin.id, credential_id=b"cred-y", public_key=b"pk")
    db.add(row)
    db.commit()
    db.refresh(row)
    assert row.sign_count == 0
    assert row.backup_eligible is False and row.backup_state is False
    assert row.last_used_at is None
    assert row.created_at is not None


def test_no_column_can_hold_a_plain_recovery_code():
    cols = {c.name for c in AdminRecoveryCode.__table__.columns}
    assert "code" not in cols and "plain_code" not in cols
    assert "code_hash" in cols


def test_the_migration_creates_both_tables():
    files = list(VERSIONS.glob("*meh3305_admin_passkeys.py"))
    assert len(files) == 1, files
    src = files[0].read_text()
    assert '"admin_passkeys"' in src and '"admin_recovery_codes"' in src
    assert 'ondelete="CASCADE"' in src
    # The model-vs-migration match itself is `alembic check` in CI
    # (pr-checks.yml, "No new upgrade operations detected").


def test_a_passkey_needs_a_credential_id(db):
    admin = make_user(db, role="admin")
    db.add(AdminPasskey(user_id=admin.id, credential_id=None, public_key=b"pk"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
