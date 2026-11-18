# guard-ok: backend/pyproject.toml is deny-listed for CC; its [tool.mypy].files line rides in the Chrome commit of MEH-3305 part 2. It passes mypy --strict (PR body).
"""
Module:    services/admin_passkey
Purpose:   The second factor of an admin account: a passkey (WebAuthn) checked
           after the password or Google / Apple sign-in, and ten one-time
           recovery codes for a lost device.
Touches:   admin_passkeys, admin_recovery_codes (read and write); signs
           short-lived "ticket" JWTs with the app secret (scope passkey_ticket).
Does NOT:  Issue the session (routers/admin_passkey.py does, through the same
           cookie helpers as /auth/login), and never stores a recovery code in
           the clear — only a salted SHA-256.
Related:   routers/auth.py login / google_auth / apple_auth (the gate),
           models/admin_passkeys.py (the tables), auth.py _jwt_key.
History:   MEH-3305 (creation — Sapir's approval 18/11: enforced per admin
           account once she enrolls a passkey; off where WEBAUTHN_RP_ID is
           unset, which covers local runs and vercel.app previews).
"""

from __future__ import annotations

import hashlib
import json
import secrets
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from joserfc import jwt as jose_jwt
from joserfc.errors import JoseError
from joserfc.jwt import JWTClaimsRegistry
from sqlalchemy.orm import Session
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.exceptions import (
    InvalidAuthenticationResponse,
    InvalidRegistrationResponse,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    AuthenticatorTransport,
    CredentialDeviceType,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.auth import _jwt_key
from app.config import settings
from app.models import User
from app.models.admin_passkeys import AdminPasskey, AdminRecoveryCode
from app.rate_limit import LOGIN_FAILURE_LIMIT, limiter
from app.utils.clock import utc_now

TICKET_SCOPE = "passkey_ticket"
TICKET_MINUTES = 5
MAX_PASSKEYS = 10
RECOVERY_CODE_COUNT = 10
# 32 letters and digits with the look-alikes (0/O, 1/I/L) taken out; 10 of
# them = 50 bits, against 5 tries a minute per address.
_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_CODE_LENGTH = 10
RP_NAME = "מהמקור"

# A ticket is single-use: its jti is remembered until it expires. Process
# memory, like the rate-limit counters (SYSTEM_MAP): one uvicorn process per
# deploy (Dockerfile CMD). A restart forgets the set, and a ticket outlives a
# restart by at most TICKET_MINUTES.
_spent_tickets: dict[str, float] = {}


class PasskeyError(Exception):
    """A passkey check that failed. The message is never shown to the user."""


def rp_id() -> str:
    # getattr: the setting lands in config.py through the Chrome commit
    # (MEH-3305 part 2); until then the feature reads as off.
    return str(getattr(settings, "webauthn_rp_id", "") or "").strip()


def origins() -> list[str]:
    raw = str(getattr(settings, "webauthn_origin", "") or "")
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


def enabled() -> bool:
    return bool(rp_id() and origins())


def passkeys_of(db: Session, user: User) -> list[AdminPasskey]:
    return (
        db.query(AdminPasskey)
        .filter(AdminPasskey.user_id == user.id)
        .order_by(AdminPasskey.created_at)
        .all()
    )


def requires_passkey(db: Session, user: User) -> bool:
    """True when this sign-in must also show a passkey.

    Only an admin account, only once it has enrolled one, and only where the
    feature is configured. A demoted account keeps its rows but signs in
    with its password alone.
    """
    if not enabled() or user.role != "admin":
        return False
    return (
        db.query(AdminPasskey.id).filter(AdminPasskey.user_id == user.id).first()
        is not None
    )


# --- tickets -----------------------------------------------------------------


def _b64(data: bytes) -> str:
    return urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return urlsafe_b64decode(text + "=" * (-len(text) % 4))


def create_ticket(user: User, purpose: str, challenge: bytes) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "scope": TICKET_SCOPE,
        "purpose": purpose,
        "chal": _b64(challenge),
        "tv": user.token_version,
        "jti": secrets.token_urlsafe(16),
        "iat": int(now.timestamp()),
        "exp": now + timedelta(minutes=TICKET_MINUTES),
    }
    return jose_jwt.encode({"alg": settings.algorithm}, payload, _jwt_key())


def _prune_spent(now: float) -> None:
    for jti in [j for j, exp in _spent_tickets.items() if exp < now]:
        del _spent_tickets[jti]


def open_ticket(
    db: Session, token: str, purpose: str, *, spend: bool = True
) -> tuple[User, bytes, str]:
    """Check a ticket, spend it (unless `spend=False`), and return its account,
    challenge and jti. A caller that defers the spend calls `spend_ticket`.

    Raises PasskeyError on a bad signature, an expired or spent ticket, the
    wrong purpose, a missing or blocked account, or a token_version that moved
    (a password change or "sign out everywhere" kills open tickets).
    """
    try:
        obj = jose_jwt.decode(token, _jwt_key(), algorithms=[settings.algorithm])
        JWTClaimsRegistry(exp={"essential": True}).validate(obj.claims)
    except (JoseError, ValueError) as exc:
        raise PasskeyError("ticket") from exc
    claims = obj.claims
    if claims.get("scope") != TICKET_SCOPE or claims.get("purpose") != purpose:
        raise PasskeyError("ticket scope")
    jti = str(claims.get("jti") or "")
    now = time.time()
    _prune_spent(now)
    if not jti or jti in _spent_tickets:
        raise PasskeyError("ticket spent")
    try:
        user_id = UUID(str(claims.get("sub")))
        challenge = _unb64(str(claims.get("chal") or ""))
    except ValueError as exc:
        raise PasskeyError("ticket claims") from exc
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or user.is_blocked or claims.get("tv") != user.token_version:
        raise PasskeyError("ticket account")
    if spend:
        _spent_tickets[jti] = float(claims.get("exp") or now)
    return user, challenge, jti


def spend_ticket(jti: str) -> None:
    _spent_tickets[jti] = time.time() + TICKET_MINUTES * 60


# Wrong recovery codes have their OWN budget, apart from the MEH-3372
# password-failure one: someone who knows only the password must not be able
# to use up the budget of the recovery path (and the reverse).
_RECOVERY_SCOPE = "passkey-recovery-failures"


def recovery_failures_exceeded(user: User) -> bool:
    return not limiter.limiter.test(LOGIN_FAILURE_LIMIT, _RECOVERY_SCOPE, str(user.id))


def record_recovery_failure(user: User) -> None:
    limiter.limiter.hit(LOGIN_FAILURE_LIMIT, _RECOVERY_SCOPE, str(user.id))


# --- WebAuthn ceremonies ------------------------------------------------------


def _descriptor(row: AdminPasskey) -> PublicKeyCredentialDescriptor:
    transports: list[AuthenticatorTransport] = []
    for t in str(row.transports or "").split(","):
        try:
            transports.append(AuthenticatorTransport(t))
        except ValueError:
            continue
    return PublicKeyCredentialDescriptor(
        id=bytes(row.credential_id),
        transports=transports or None,
    )


def registration_options(db: Session, user: User) -> tuple[dict[str, Any], str]:
    """The browser's `navigator.credentials.create` options, plus a ticket."""
    opts = generate_registration_options(
        rp_id=rp_id(),
        rp_name=RP_NAME,
        user_id=user.id.bytes,
        user_name=str(user.email),
        user_display_name=str(user.name or user.email),
        exclude_credentials=[_descriptor(r) for r in passkeys_of(db, user)],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    options: dict[str, Any] = json.loads(options_to_json(opts))
    return options, create_ticket(user, "register", opts.challenge)


def authentication_options(
    db: Session, user: User, purpose: str
) -> tuple[dict[str, Any], str]:
    """`navigator.credentials.get` options for this account's passkeys."""
    opts = generate_authentication_options(
        rp_id=rp_id(),
        allow_credentials=[_descriptor(r) for r in passkeys_of(db, user)],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    options: dict[str, Any] = json.loads(options_to_json(opts))
    return options, create_ticket(user, purpose, opts.challenge)


def register(
    db: Session,
    user: User,
    challenge: bytes,
    credential: dict[str, Any],
    name: str | None,
) -> AdminPasskey:
    if len(passkeys_of(db, user)) >= MAX_PASSKEYS:
        raise PasskeyError("cap")
    try:
        verified = verify_registration_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id(),
            expected_origin=origins(),
            require_user_verification=True,
        )
    except (InvalidRegistrationResponse, ValueError, KeyError, TypeError) as exc:
        raise PasskeyError("registration") from exc
    taken = (
        db.query(AdminPasskey.id)
        .filter(AdminPasskey.credential_id == verified.credential_id)
        .first()
    )
    if taken is not None:
        raise PasskeyError("duplicate")
    raw_transports = credential.get("response", {}).get("transports") or []
    transports = ",".join(
        t for t in raw_transports if isinstance(t, str) and t.isalnum()
    )[:120]
    row = AdminPasskey(
        user_id=user.id,
        credential_id=verified.credential_id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        aaguid=str(verified.aaguid)[:36] or None,
        backup_eligible=verified.credential_device_type
        == CredentialDeviceType.MULTI_DEVICE,
        backup_state=verified.credential_backed_up,
        transports=transports or None,
        name=(name or "").strip()[:60] or None,
    )
    db.add(row)
    db.flush()
    return row


def authenticate(
    db: Session, user: User, challenge: bytes, credential: dict[str, Any]
) -> AdminPasskey:
    """Verify an assertion against one of THIS account's passkeys."""
    try:
        raw_id = _unb64(str(credential.get("rawId") or credential.get("id") or ""))
    except ValueError as exc:
        raise PasskeyError("credential id") from exc
    row = (
        db.query(AdminPasskey)
        .filter(AdminPasskey.user_id == user.id, AdminPasskey.credential_id == raw_id)
        .first()
    )
    if row is None:
        raise PasskeyError("unknown credential")
    try:
        verified = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id(),
            expected_origin=origins(),
            credential_public_key=bytes(row.public_key),
            credential_current_sign_count=int(row.sign_count),
            require_user_verification=True,
        )
    except (InvalidAuthenticationResponse, ValueError, KeyError, TypeError) as exc:
        raise PasskeyError("authentication") from exc
    row.sign_count = verified.new_sign_count  # type: ignore[assignment]
    row.backup_state = verified.credential_backed_up  # type: ignore[assignment]
    row.last_used_at = utc_now()  # type: ignore[assignment]
    return row


# --- recovery codes -----------------------------------------------------------


def _normalise(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def _hash_code(code: str, salt: str) -> str:
    digest = hashlib.sha256((salt + _normalise(code)).encode()).hexdigest()
    return f"{salt}${digest}"


def new_recovery_codes(db: Session, user: User) -> list[str]:
    """Replace every recovery code of this account; return the new ones once."""
    db.query(AdminRecoveryCode).filter(AdminRecoveryCode.user_id == user.id).delete()
    codes: list[str] = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))
        codes.append(f"{raw[:5]}-{raw[5:]}")
        db.add(
            AdminRecoveryCode(
                user_id=user.id, code_hash=_hash_code(raw, secrets.token_hex(16))
            )
        )
    db.flush()
    return codes


def codes_left(db: Session, user: User) -> int:
    return (
        db.query(AdminRecoveryCode)
        .filter(
            AdminRecoveryCode.user_id == user.id, AdminRecoveryCode.used_at.is_(None)
        )
        .count()
    )


def spend_recovery_code(db: Session, user: User, code: str) -> bool:
    """Mark the matching unused code as spent. False when none matches.

    Every unused code is compared (constant-time), so the time taken does
    not say which one matched.
    """
    match: AdminRecoveryCode | None = None
    # Row lock: two requests at once cannot both spend the same code.
    rows = (
        db.query(AdminRecoveryCode)
        .filter(
            AdminRecoveryCode.user_id == user.id, AdminRecoveryCode.used_at.is_(None)
        )
        .with_for_update()
        .all()
    )
    for row in rows:
        salt = str(row.code_hash).split("$", 1)[0]
        if secrets.compare_digest(_hash_code(code, salt), str(row.code_hash)):
            match = row
    if match is None:
        return False
    match.used_at = utc_now()  # type: ignore[assignment]
    return True


def remove_all(db: Session, user: User) -> None:
    """The last passkey went: the codes go with it (nothing left to recover)."""
    db.query(AdminRecoveryCode).filter(AdminRecoveryCode.user_id == user.id).delete()


def login_step(db: Session, user: User) -> dict[str, Any] | None:
    """For routers/auth.py: the second-step payload when this sign-in needs
    one (routers/admin_passkey.py finishes it), else None and the caller
    issues the session exactly as before."""
    if not requires_passkey(db, user):
        return None
    options, ticket = authentication_options(db, user, "login")
    return {"passkey_required": True, "ticket": ticket, "options": options}
