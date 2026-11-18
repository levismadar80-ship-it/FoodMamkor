# guard-ok: backend/pyproject.toml is deny-listed for CC; the [tool.mypy].files line for this module rides in the Chrome commit of MEH-3305 chunk 2. It passes mypy --strict (PR body).
"""
Module:    models/admin_passkeys
Purpose:   Where an admin account's second factor lives: its registered
           passkeys (WebAuthn credentials) and its one-time recovery codes.
Touches:   admin_passkeys, admin_recovery_codes.
Does NOT:  Verify a signature or a code (that is the passkey service, chunk 3),
           and never stores a recovery code in the clear — only its hash.
Related:   alembic/versions/*_meh3305_admin_passkeys.py (the schema),
           models/models.py User (the account both tables hang off).
History:   MEH-3305 (creation — Sapir's approval 18/11: passkey for admin,
           recovery codes for a lost phone).
"""

import uuid

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    LargeBinary,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class AdminPasskey(Base):
    """One registered passkey of an admin account.

    `credential_id` is the authenticator's own id and is unique across the
    table: one credential can never sign in as two accounts. `sign_count` is
    the authenticator's counter, kept to detect a cloned key (a count that
    goes backwards). Rows go with the account (ON DELETE CASCADE).
    """

    __tablename__ = "admin_passkeys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    credential_id = Column(LargeBinary, nullable=False, unique=True)
    public_key = Column(LargeBinary, nullable=False)
    sign_count = Column(BigInteger, nullable=False, default=0, server_default="0")
    # "internal,hybrid" — what the browser reported, passed back as a hint.
    transports = Column(String(120), nullable=True)
    # The admin's own label («הטלפון», «המחשב»). Never shown to anyone else.
    name = Column(String(60), nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_used_at = Column(DateTime(timezone=True), nullable=True)


class AdminRecoveryCode(Base):
    """One one-time recovery code, stored as a hash. `used_at` set = spent."""

    __tablename__ = "admin_recovery_codes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code_hash = Column(String(128), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
