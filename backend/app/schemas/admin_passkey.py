# guard-ok: backend/pyproject.toml is deny-listed for CC; its [tool.mypy].files line rides in the Chrome commit of MEH-3305 part 2. It passes mypy --strict (PR body).
"""
Module:    schemas/admin_passkey
Purpose:   Request and response shapes of the admin passkey routes (MEH-3305).
Does NOT:  Validate a WebAuthn credential — the browser's JSON is passed to
           py_webauthn as-is (services/admin_passkey.py), bounded here in size.
History:   MEH-3305 (creation).
"""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

# A WebAuthn credential from the browser is a small JSON object (an
# attestation is a few KB at most). Anything bigger is refused before parsing.
_MAX_CREDENTIAL_KEYS = 12
_MAX_TICKET = 2048


class PasskeyRequired(BaseModel):
    """Returned by /auth/login, /auth/google and /auth/apple instead of a
    token when the account is an admin with a passkey: the sign-in finishes at
    /auth/passkey/login/verify (or /login/recovery) with this ticket."""

    passkey_required: Literal[True] = True
    ticket: str
    options: dict[str, Any]


class StepUp(BaseModel):
    """Proof that the person at the keyboard is the account holder, asked
    before a passkey is added or removed. Which proof counts depends on the
    account: one of its passkeys if it has any (ticket + credential from
    /auth/passkey/step-up/options), or one of its recovery codes; otherwise its
    password; an account with no password and no passkey has only its session.
    """

    password: str | None = Field(default=None, max_length=256)
    ticket: str | None = Field(default=None, max_length=_MAX_TICKET)
    credential: dict[str, Any] | None = None
    recovery_code: str | None = Field(default=None, max_length=32)

    @field_validator("credential")
    @classmethod
    def _small(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        if v is not None and len(v) > _MAX_CREDENTIAL_KEYS:
            raise ValueError("credential too large")
        return v


class CeremonyOptions(BaseModel):
    ticket: str
    options: dict[str, Any]


class RegisterVerify(BaseModel):
    ticket: str = Field(max_length=_MAX_TICKET)
    credential: dict[str, Any]
    name: str | None = Field(default=None, max_length=60)

    @field_validator("credential")
    @classmethod
    def _small(cls, v: dict[str, Any]) -> dict[str, Any]:
        if len(v) > _MAX_CREDENTIAL_KEYS:
            raise ValueError("credential too large")
        return v


class LoginVerify(BaseModel):
    ticket: str = Field(max_length=_MAX_TICKET)
    credential: dict[str, Any]

    @field_validator("credential")
    @classmethod
    def _small(cls, v: dict[str, Any]) -> dict[str, Any]:
        if len(v) > _MAX_CREDENTIAL_KEYS:
            raise ValueError("credential too large")
        return v


class LoginRecovery(BaseModel):
    ticket: str = Field(max_length=_MAX_TICKET)
    code: str = Field(min_length=1, max_length=32)


class PasskeyOut(BaseModel):
    id: UUID
    name: str | None
    synced: bool
    created_at: datetime
    last_used_at: datetime | None


class PasskeyList(BaseModel):
    enabled: bool
    passkeys: list[PasskeyOut]
    recovery_codes_left: int
    has_password: bool


class RecoveryCodes(BaseModel):
    recovery_codes: list[str]


class Registered(BaseModel):
    passkey: PasskeyOut
    # Shown once, on the first passkey only; None afterwards.
    recovery_codes: list[str] | None
    # MEH-3305: adding a passkey bumps token_version, so the caller's old
    # access token is dead; this one replaces it with no 401 round-trip.
    access_token: str | None = None
