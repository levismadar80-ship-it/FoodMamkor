"""
Module:   verify_session
Purpose:  Build the reply of GET /auth/verify-email: the Hebrew ack, plus a
          session when the link is opened in the browser that registered.
          Also owns the "signup marker" cookie that proves that.
Touches:  Response cookies (signup marker; refresh token + fingerprint
          through the two setters the caller passes in). No DB writes.
Does NOT: consume the token or flip email_verified — routers/auth.py
          `verify_email` does both, and calls this only after the commit.
Related:  backend/app/routers/auth.py `_set_refresh_cookie`,
          `_set_fingerprint_cookie`, `login` (same session shape).
History:  MEH-3087 (creation).
"""

import hashlib
import hmac
import secrets
from collections.abc import Callable
from typing import cast
from uuid import UUID

from fastapi import Request, Response

from app.auth import create_access_token, generate_fingerprint, hash_fingerprint
from app.config import settings
from app.models import User

VERIFIED_DETAIL = "האימייל אומת בהצלחה"
SIGNUP_MARKER = "signup_marker"
_MARKER_MAX_AGE = 24 * 3600  # the verify token's own lifetime


def _marker_value(verify_token: str) -> str:
    """HMAC of the emailed token. Useless without the token; reveals nothing
    about it. Stateless on purpose — no column, no migration."""
    return hmac.new(
        settings.secret_key.encode(),
        b"signup-marker:" + verify_token.encode(),
        hashlib.sha256,
    ).hexdigest()


def set_signup_marker(response: Response, verify_token: str | None) -> None:
    """Mark the browser that registered, on EVERY register reply.

    `verify_token` is None on the email-already-registered branch: the cookie
    is then the HMAC of a throwaway token — same name, same attributes, same
    length — so the reply still cannot tell a new email from a taken one.
    DO NOT skip the cookie on that branch; that would be the tell.
    """
    response.set_cookie(
        key=SIGNUP_MARKER,
        value=_marker_value(verify_token or secrets.token_urlsafe(32)),
        max_age=_MARKER_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/api/auth",
    )


def _same_browser(request: Request, verify_token: str) -> bool:
    marker = request.cookies.get(SIGNUP_MARKER) or ""
    return hmac.compare_digest(marker, _marker_value(verify_token))


def verify_email_session(
    request: Request,
    response: Response,
    user: User,
    verify_token: str,
    cookie_setters: tuple[
        Callable[[Response, User], None], Callable[[Response, str], None]
    ],
) -> dict[str, str]:
    """Ack for a freshly verified user, plus a session when it is safe to give one.

    A session is issued only when ALL hold (MEH-3087):
      * the link is opened in the browser that registered (signup marker).
        Without this, someone who registers another person's email with a
        password of their own would keep access to the account that person
        is then signed in to — the old "verify, then log in" flow forced
        the real owner through a password she knows.
      * the user is not blocked — /auth/login refuses them with 403.
      * the browser carries no session already — never swap one user's
        cookies for another's.
    Everyone else gets the ack only, and logs in as before.
    """
    response.headers["Cache-Control"] = "no-store"
    if (
        getattr(user, "is_blocked", False)
        or request.cookies.get("refresh_token")
        or not _same_browser(request, verify_token)
    ):
        return {"detail": VERIFIED_DETAIL}
    # The two setters are passed in: they live in routers/auth.py, which
    # imports this module, so importing them here would be a cycle.
    # REUSES: backend/app/routers/users_me.py:171 — the same session shape.
    set_refresh_cookie, set_fingerprint_cookie = cookie_setters
    fingerprint = generate_fingerprint()
    set_refresh_cookie(response, user)
    set_fingerprint_cookie(response, fingerprint)
    response.delete_cookie(
        SIGNUP_MARKER, path="/api/auth", httponly=True, secure=True, samesite="lax"
    )
    return {
        "detail": VERIFIED_DETAIL,
        "access_token": create_access_token(
            # The models are untyped Column[...] to mypy; the values are plain.
            cast(UUID, user.id),
            cast(int, user.token_version),
            fingerprint_hash=hash_fingerprint(fingerprint),
        ),
        "token_type": "bearer",
    }
