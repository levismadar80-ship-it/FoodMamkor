"""
Module:   draft_preview
Purpose:  The signed token behind a draft business's read-only preview link
          (MEH-3377): mint and decode, nothing else.
Does NOT: decide who may see a draft (routers/producer_draft_preview.py reads
          the row and refuses anything that is not an ownerless draft), or
          grant any write. The scope is its own — a preview link cannot claim
          a business, and a claim link is not a preview link.
Related:  backend/app/auth.py create/decode_producer_claim_token (the shape
          this copies, scope and all).
History:  MEH-3377 (creation).
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from joserfc import jwt as jose_jwt
from joserfc.errors import JoseError
from joserfc.jwt import JWTClaimsRegistry

from app.auth import _jwt_key
from app.config import settings

DRAFT_PREVIEW_SCOPE = "producer_draft_preview"
# The same horizon as the claim link, so the two links an admin may send for
# one draft lapse together.
DRAFT_PREVIEW_TTL_DAYS = 14


def create_draft_preview_token(producer_id: UUID) -> tuple[str, datetime]:
    """Return (token, expires_at)."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=DRAFT_PREVIEW_TTL_DAYS)
    payload = {
        "producer_id": str(producer_id),
        "exp": expire,
        "iat": int(now.timestamp()),
        "scope": DRAFT_PREVIEW_SCOPE,
    }
    token = jose_jwt.encode({"alg": settings.algorithm}, payload, _jwt_key())
    return token, expire


def decode_draft_preview_token(token: str) -> UUID | None:
    """The producer id, or None on ANY failure (bad signature, expired, no
    `exp`, another scope, malformed id). Never raises."""
    try:
        token_obj = jose_jwt.decode(token, _jwt_key(), algorithms=[settings.algorithm])
        # `exp` essential: this travels as a shareable link, and one minted
        # without it must not show a draft forever.
        JWTClaimsRegistry(exp={"essential": True}).validate(token_obj.claims)
    except (JoseError, ValueError):
        return None
    claims = token_obj.claims
    if claims.get("scope") != DRAFT_PREVIEW_SCOPE:
        return None
    try:
        return UUID(str(claims.get("producer_id")))
    except (TypeError, ValueError):
        return None
