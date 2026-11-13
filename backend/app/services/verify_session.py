"""
Module:   verify_session
Purpose:  Build the reply of GET /auth/verify-email: the Hebrew ack, plus a
          session for the person who just proved they own the mailbox.
Touches:  Response cookies (refresh token + fingerprint) through the two
          setters the caller passes in. No DB writes.
Does NOT: consume the token or flip email_verified — routers/auth.py
          `verify_email` does both, and calls this only after the commit.
Related:  backend/app/routers/auth.py `_set_refresh_cookie`,
          `_set_fingerprint_cookie`, `login` (same session shape).
History:  MEH-3087 (creation).
"""

from collections.abc import Callable
from typing import cast
from uuid import UUID

from fastapi import Response

from app.auth import create_access_token, generate_fingerprint, hash_fingerprint
from app.models import User

VERIFIED_DETAIL = "האימייל אומת בהצלחה"


def verify_email_session(
    response: Response,
    user: User,
    set_refresh_cookie: Callable[[Response, User], None],
    set_fingerprint_cookie: Callable[[Response, str], None],
) -> dict[str, str]:
    """Ack + access token for a freshly verified user.

    DO NOT sign in a blocked user — /auth/login refuses them with 403, and
    this must not be a way around it (MEH-3087). They still get the ack: the
    mailbox is verified either way.
    """
    if getattr(user, "is_blocked", False):
        return {"detail": VERIFIED_DETAIL}
    # The two setters are passed in: they live in routers/auth.py, which
    # imports this module, so importing them here would be a cycle.
    # REUSES: backend/app/routers/users_me.py:171 — the same session shape.
    fingerprint = generate_fingerprint()
    set_refresh_cookie(response, user)
    set_fingerprint_cookie(response, fingerprint)
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
