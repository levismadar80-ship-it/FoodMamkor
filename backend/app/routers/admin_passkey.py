# guard-ok: backend/pyproject.toml is deny-listed for CC; its [tool.mypy].files line rides in the Chrome commit of MEH-3305 part 2. It passes mypy --strict (PR body).
"""
Module:    routers/admin_passkey
Purpose:   An admin account's passkeys: add one, list them, remove one, new
           recovery codes, and the second step of signing in (a passkey, or a
           recovery code when the device is lost).
Touches:   admin_passkeys, admin_recovery_codes; sets the session cookies on a
           finished sign-in (same helpers as /auth/login).
Does NOT:  Decide WHEN a sign-in needs the second step — that is
           services/admin_passkey.requires_passkey, called from routers/auth.py
           login / google_auth / apple_auth. Never manages another admin's
           passkeys: every route acts on the signed-in account only.
Related:   services/admin_passkey.py (ceremonies, tickets, codes),
           routers/auth.py _set_refresh_cookie / _set_fingerprint_cookie.
History:   MEH-3305 (creation); MEH-3305 follow-up: adding a passkey signs
           every other session out (token_version bump).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    generate_fingerprint,
    hash_fingerprint,
    require_admin,
    verify_password,
)
from app.database import get_db
from app.models import User
from app.models.admin_passkeys import AdminPasskey
from app.rate_limit import limiter
from app.routers.auth import _set_fingerprint_cookie, _set_refresh_cookie
from app.schemas.admin_passkey import (
    CeremonyOptions,
    LoginRecovery,
    LoginVerify,
    PasskeyList,
    PasskeyOut,
    RecoveryCodes,
    Registered,
    RegisterVerify,
    StepUp,
)
from app.schemas.registration import Token
from app.services import admin_passkey as pk

router = APIRouter(prefix="/auth/passkey", tags=["auth"])

_OFF = "מפתח גישה לא זמין בסביבה הזאת"
_FAILED = "האימות לא הצליח. אפשר לנסות שוב"
_EXPIRED = "עבר יותר מדי זמן. צריך להתחבר מחדש"
_CODE_WRONG = "קוד השחזור לא נכון או שכבר השתמשת בו"
_STEP_UP = "צריך לאשר את הזהות לפני השינוי"
_CAP = "אפשר לשמור עד 10 מפתחות גישה"
_TOO_MANY = "יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות"


def _require_enabled() -> None:
    if not pk.enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_OFF)


def _out(row: AdminPasskey) -> PasskeyOut:
    return PasskeyOut(
        id=row.id,
        name=row.name,
        synced=bool(row.backup_eligible),
        created_at=row.created_at,
        last_used_at=row.last_used_at,
    )


def _issue_session(response: Response, user: User) -> Token:
    fp = generate_fingerprint()
    _set_refresh_cookie(response, user)
    _set_fingerprint_cookie(response, fp)
    return Token(
        access_token=create_access_token(
            user.id,  # type: ignore[arg-type]
            user.token_version,  # type: ignore[arg-type]
            fingerprint_hash=hash_fingerprint(fp),
        )
    )


def _check_step_up(db: Session, user: User, proof: StepUp) -> None:
    """Raise 403 unless `proof` is the strongest one this account can give."""
    if pk.passkeys_of(db, user):
        if proof.recovery_code:
            if pk.recovery_failures_exceeded(user):
                raise HTTPException(status_code=429, detail=_TOO_MANY)
            if pk.spend_recovery_code(db, user, proof.recovery_code):
                return
            pk.record_recovery_failure(user)
            raise HTTPException(status_code=403, detail=_STEP_UP)
        if not proof.ticket or proof.credential is None:
            raise HTTPException(status_code=403, detail=_STEP_UP)
        try:
            ticket_user, challenge, _jti = pk.open_ticket(db, proof.ticket, "step_up")
            if ticket_user.id != user.id:
                raise pk.PasskeyError("other account")
            pk.authenticate(db, user, challenge, proof.credential)
        except pk.PasskeyError:
            raise HTTPException(status_code=403, detail=_STEP_UP)
        return
    if user.password_hash:
        if not proof.password or not verify_password(
            proof.password,
            user.password_hash,  # type: ignore[arg-type]
        ):
            raise HTTPException(status_code=403, detail=_STEP_UP)
    # No passkey and no password (a Google / Apple account): the session is
    # the only proof there is, and the same proof the sign-in itself gave.


# --- managing the account's passkeys (signed in) ------------------------------


@router.get("", response_model=PasskeyList)
def list_passkeys(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> PasskeyList:
    return PasskeyList(
        enabled=pk.enabled(),
        passkeys=[_out(r) for r in pk.passkeys_of(db, user)],
        recovery_codes_left=pk.codes_left(db, user),
        has_password=bool(user.password_hash),
    )


@router.post("/step-up/options", response_model=CeremonyOptions)
@limiter.limit("10/minute")
def step_up_options(
    request: Request,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CeremonyOptions:
    _require_enabled()
    if not pk.passkeys_of(db, user):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_FAILED)
    options, ticket = pk.authentication_options(db, user, "step_up")
    return CeremonyOptions(ticket=ticket, options=options)


@router.post("/register/options", response_model=CeremonyOptions)
@limiter.limit("10/minute")
def register_options(
    request: Request,
    proof: StepUp,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CeremonyOptions:
    _require_enabled()
    if len(pk.passkeys_of(db, user)) >= pk.MAX_PASSKEYS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_CAP)
    _check_step_up(db, user, proof)
    db.commit()  # a recovery code spent as step-up stays spent
    options, ticket = pk.registration_options(db, user)
    return CeremonyOptions(ticket=ticket, options=options)


@router.post("/register/verify", response_model=Registered)
@limiter.limit("10/minute")
def register_verify(
    request: Request,
    response: Response,
    data: RegisterVerify,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Registered:
    _require_enabled()
    try:
        ticket_user, challenge, _jti = pk.open_ticket(db, data.ticket, "register")
        if ticket_user.id != user.id:
            raise pk.PasskeyError("other account")
        first = not pk.passkeys_of(db, user)
        row = pk.register(db, user, challenge, data.credential, data.name)
    except pk.PasskeyError as exc:
        db.rollback()
        detail = _CAP if str(exc) == "cap" else _FAILED
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
    codes = pk.new_recovery_codes(db, user) if first else None
    # MEH-3305: a new passkey is a new way into the account, so every session
    # opened before it ends (as logout-all and an email change do, MEH-3425).
    # In the same commit as the row: no passkey without the sign-out.
    user.token_version = (user.token_version or 1) + 1  # type: ignore[assignment]
    try:
        db.commit()
    except IntegrityError:
        # Two registrations of one credential at once: the unique index wins.
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_FAILED)
    db.refresh(row)
    db.refresh(user)
    # This device stays signed in: a new session in the same response, so the
    # page never meets a 401 while the one-time codes are on screen.
    session = _issue_session(response, user)
    return Registered(
        passkey=_out(row), recovery_codes=codes, access_token=session.access_token
    )


@router.post("/{passkey_id}/delete", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def delete_passkey(
    request: Request,
    passkey_id: UUID,
    proof: StepUp,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    row = (
        db.query(AdminPasskey)
        .filter(AdminPasskey.id == passkey_id, AdminPasskey.user_id == user.id)
        .first()
    )
    # Another account's passkey answers exactly like a missing one.
    if row is None:
        raise HTTPException(status_code=404, detail="מפתח הגישה לא נמצא")
    _check_step_up(db, user, proof)
    db.delete(row)
    db.flush()
    if not pk.passkeys_of(db, user):
        pk.remove_all(db, user)
    db.commit()


@router.post("/recovery-codes", response_model=RecoveryCodes)
@limiter.limit("5/minute")
def regenerate_codes(
    request: Request,
    proof: StepUp,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> RecoveryCodes:
    _require_enabled()
    if not pk.passkeys_of(db, user):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_FAILED)
    _check_step_up(db, user, proof)
    codes = pk.new_recovery_codes(db, user)
    db.commit()
    return RecoveryCodes(recovery_codes=codes)


# --- the second step of signing in (no session yet; the ticket is the proof
# that the password / Google / Apple step passed) ------------------------------


def _open_login_ticket(
    db: Session, ticket: str, *, spend: bool = True
) -> tuple[User, bytes, str]:
    _require_enabled()
    try:
        return pk.open_ticket(db, ticket, "login", spend=spend)
    except pk.PasskeyError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_EXPIRED)


@router.post("/login/verify", response_model=Token)
@limiter.limit("10/minute")
def login_verify(
    request: Request,
    response: Response,
    data: LoginVerify,
    db: Session = Depends(get_db),
) -> Token:
    user, challenge, _jti = _open_login_ticket(db, data.ticket)
    try:
        pk.authenticate(db, user, challenge, data.credential)
    except pk.PasskeyError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_FAILED)
    db.commit()
    return _issue_session(response, user)


@router.post("/login/recovery", response_model=Token)
@limiter.limit("5/minute")
def login_recovery(
    request: Request,
    response: Response,
    data: LoginRecovery,
    db: Session = Depends(get_db),
) -> Token:
    # A wrong code does not burn the ticket (a typo should not send her back
    # to the password); the ticket is spent with the first RIGHT code, and
    # wrong codes count against their own budget.
    user, _challenge, jti = _open_login_ticket(db, data.ticket, spend=False)
    if pk.recovery_failures_exceeded(user):
        raise HTTPException(status_code=429, detail=_TOO_MANY)
    if not pk.spend_recovery_code(db, user, data.code):
        db.rollback()
        pk.record_recovery_failure(user)
        raise HTTPException(status_code=401, detail=_CODE_WRONG)
    pk.spend_ticket(jti)
    db.commit()
    return _issue_session(response, user)
