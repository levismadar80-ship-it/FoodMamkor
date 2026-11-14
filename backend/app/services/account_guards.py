"""MEH-3248 — who may be deleted, and through which door.

One authority for both doors that delete an account: the self-service
``POST /auth/me/delete`` (routers/auth.py) and the admin removal
``DELETE /admin/users/{id}`` (routers/admin_extra.py). Before this module the
admin door refused admins and the self-service door refused nobody, so an
admin, the protected super-admin included, could delete herself with one
request.

``is_super_admin`` lives here, not in admin_extra, because admin_extra imports
services.user_deletion at module top: a service importing back from that
router would be an import cycle in either load order.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.auth import verify_password
from app.config import settings
from app.models import User
from app.services import oauth_verifiers

# The admin door's texts are unchanged (MEH-2585). The self-service door gets
# its own: the person reading it IS the admin, and she cannot demote herself
# (admin_extra.update_user_role refuses a self-change), so the way out is
# another admin.
ADMIN_DOOR_SUPER_ADMIN = "לא ניתן למחוק את האדמין הראשי"
ADMIN_DOOR_ADMIN = "לא ניתן למחוק אדמין. קודם מורידים את הרשאת האדמין."
SELF_DOOR_SUPER_ADMIN = "זה החשבון הראשי של האתר, ואי אפשר למחוק אותו."
SELF_DOOR_ADMIN = (
    "חשבון של מנהלת מערכת לא נמחק מכאן. כדי למחוק אותו, "
    "מנהלת אחרת צריכה קודם להסיר את הרשאת הניהול."
)


def is_super_admin(target: User) -> bool:
    """MEH-2890: the protected owner account, from SUPER_ADMIN_EMAIL (config).
    EXACT match on the stored address, as the old constant was: emails are
    unique case-sensitively, so a case-insensitive match would hand the
    protection to anyone who registers a case variant. Never true when the
    setting is empty — and production cannot run with it empty
    (config._load_settings refuses to boot)."""
    protected = settings.super_admin_email
    return bool(protected) and (target.email or "").strip() == protected


def assert_deletable(target: User, *, door: Literal["self", "admin"]) -> None:
    """Raise 403 when ``target`` may not be deleted through ``door``.

    Rule (one rule, both doors): an admin account is never deleted while it is
    an admin — the role is removed first, by another admin — and the
    super-admin is never deleted at all. Checked BEFORE any password or
    provider check, so an admin is not asked to type a password only to be
    refused afterwards.
    """
    if is_super_admin(target):
        raise HTTPException(
            status_code=403,
            detail=SELF_DOOR_SUPER_ADMIN if door == "self" else ADMIN_DOOR_SUPER_ADMIN,
        )
    if target.role == "admin":
        raise HTTPException(
            status_code=403,
            detail=SELF_DOOR_ADMIN if door == "self" else ADMIN_DOOR_ADMIN,
        )


# A provider token older than this is not a fresh sign-in (MEH-3248 / D15).
REAUTH_MAX_AGE_SECONDS = 5 * 60
WRONG_PASSWORD = "הסיסמה הנוכחית שגויה"  # REUSES: routers/users_me.py _change_email (guard-ok: an error message, not a credential)
# Approved string 17 (decisions doc 14/11). Also the 403 when the token fails.
REAUTH_REQUIRED = "כדי לאשר את המחיקה, התחברי שוב עם {provider}."


class AccountDeleteRequest(BaseModel):
    """Body of POST /auth/me/delete. A session alone is not enough to delete
    an account (D15, same threat as MEH-3104's email change): an account with
    a password sends it; an account that signs in only with Google or Apple
    sends a fresh id_token from that provider."""

    password: str | None = Field(None, max_length=256)
    id_token: str | None = Field(None, max_length=8192)


def _linked_providers(user: User) -> list[tuple[str, Callable[[str], Any]]]:
    """(stored provider id, verifier) for every provider linked to ``user``.
    An account linked to both may re-confirm with either (review finding,
    PR #4603): someone who signs in with Apple must not be asked for Google."""
    pairs: list[tuple[str, Callable[[str], Any]]] = []
    if user.google_id:
        pairs.append((str(user.google_id), oauth_verifiers.verify_google_token))
    if user.apple_id:
        pairs.append((str(user.apple_id), oauth_verifiers.verify_apple_token))
    return pairs


def _fresh_match(claims: Any, linked_id: str) -> bool:
    # DO NOT accept any valid token — it must be THIS account's provider id,
    # and recent, or a token for another account (or an old one) would pass.
    if not isinstance(claims, dict):
        return False
    issued_at = int(claims.get("iat") or 0)
    return (
        str(claims.get("sub") or "") == linked_id
        and time.time() - issued_at <= REAUTH_MAX_AGE_SECONDS
    )


def _reauth_error(user: User) -> HTTPException:
    provider = "Google" if user.google_id else "Apple"
    return HTTPException(
        status_code=403, detail=REAUTH_REQUIRED.format(provider=provider)
    )


def verify_deletion_credentials(user: User, body: AccountDeleteRequest) -> None:
    """Raise 403 unless ``body`` proves the person holding the session is the
    account owner. Order matters: a password account is judged by its password
    only, so a provider token can never stand in for it."""
    if user.password_hash:
        if not body.password or not verify_password(
            body.password, str(user.password_hash)
        ):
            raise HTTPException(status_code=403, detail=WRONG_PASSWORD)
        return
    if body.id_token and any(
        _fresh_match(verify(body.id_token), linked_id)
        for linked_id, verify in _linked_providers(user)
    ):
        return
    raise _reauth_error(user)
