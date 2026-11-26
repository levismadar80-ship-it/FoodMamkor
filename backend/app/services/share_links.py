"""
Module:   share_links
Purpose:  Mint and resolve the short code behind a draft's preview link
          (/v/<code>) and claim link (/c/<code>) — MEH-3896. A 12-character
          random code replaces the ~250-character JWT, which read like
          phishing in a WhatsApp message.
Touches:  DB table share_links (INSERT on mint, SELECT on resolve).
Does NOT: decide who may see or claim a draft — the routers still read the
          producer row and refuse anything that is not an ownerless draft;
          commit (the caller does, with its own writes); or replace the JWT
          links. A link already sent keeps working until its `exp`:
          `link_producer_id` tries the short code first and falls back to the
          JWT decoder the route already used.
Related:  app/models/share_links.py · app/routers/producer_draft_preview.py ·
          app/routers/producer_claim.py · app/services/draft_preview.py and
          app/auth.py (the JWT decoders kept for old links).
History:  MEH-3896 (creation).

Why a stored random code and not a shorter signed token: industry practice
for links that a person receives (password reset, invitations, Google Docs /
Slack share links) is an opaque random value held server-side (OWASP Forgot
Password cheat sheet). 12 base62 characters are ~71 bits, above OWASP's
64-bit floor for a value that is itself the credential. Only the SHA-256 is
stored, so a leaked table yields no working link; a plain hash (not a slow
KDF) is enough because the input is 71 random bits, not a human password.
"""

import hashlib
import re
import secrets
import string
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.share_links import SHARE_LINK_SCOPES, ShareLink
from app.utils.clock import utc_now

CODE_LENGTH = 12
_ALPHABET = string.ascii_letters + string.digits
# The shape check runs before any hashing or query, so a junk path segment
# (or a JWT, which always has dots) never reaches the database.
_CODE_RE = re.compile(rf"^[A-Za-z0-9]{{{CODE_LENGTH}}}$")


def looks_like_share_code(value: str) -> bool:
    return bool(_CODE_RE.match(value))


# REUSES: backend/app/services/product_order_create.py:129 token_hash — the
# same plain sha256 hex that producer_staff.py stores as token_hash.
def _hash(code: str) -> str:
    return hashlib.sha256(code.encode("ascii")).hexdigest()


def mint_share_code(
    db: Session,
    *,
    producer_id: UUID,
    scope: str,
    ttl_days: int,
    created_by: UUID | None,
) -> tuple[str, datetime]:
    """Add a share_links row and return (code, expires_at). The row holds
    naive UTC; the returned expires_at is aware UTC, the same type the JWT
    mint functions return to the admin UI. The caller commits. The code exists only in the return value:
    it is never stored, logged or returned again."""
    if scope not in SHARE_LINK_SCOPES:
        raise ValueError(f"unknown share-link scope: {scope}")
    # secrets.choice is the CSPRNG; 62^12 makes a collision on the unique
    # code_hash practically impossible, and the constraint catches it if not.
    code = "".join(secrets.choice(_ALPHABET) for _ in range(CODE_LENGTH))
    expires_at = utc_now() + timedelta(days=ttl_days)
    db.add(
        ShareLink(
            code_hash=_hash(code),
            scope=scope,
            producer_id=producer_id,
            expires_at=expires_at,
            created_by=created_by,
        )
    )
    return code, expires_at.replace(tzinfo=timezone.utc)


def resolve_share_code(
    db: Session, code: str, scope: str, *, grace: timedelta = timedelta(0)
) -> UUID | None:
    """The producer id of a live code of `scope`, or None for any failure:
    wrong shape, unknown, another scope, or expired more than `grace` ago.
    Never raises. `grace` exists for ONE caller, the «send me a new link»
    request, exactly like decode_lapsed_producer_claim_token."""
    if not looks_like_share_code(code):
        return None
    row = (
        db.query(ShareLink.producer_id, ShareLink.expires_at)
        .filter(ShareLink.code_hash == _hash(code), ShareLink.scope == scope)
        .first()
    )
    if row is None or row.expires_at <= utc_now() - grace:
        return None
    return row.producer_id  # type: ignore[no-any-return]


def link_producer_id(
    db: Session,
    token: str,
    scope: str,
    jwt_decoder: Callable[[str], UUID | None],
    *,
    grace: timedelta = timedelta(0),
) -> UUID | None:
    """One entry point for a link from either era. A 12-character code is
    looked up; anything else goes to the JWT decoder the route used before
    MEH-3896, so the long links already sent keep working until they expire.
    The two shapes cannot overlap: a JWT always contains dots."""
    if looks_like_share_code(token):
        return resolve_share_code(db, token, scope, grace=grace)
    return jwt_decoder(token)
