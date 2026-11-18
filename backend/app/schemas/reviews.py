"""
Module:    schemas/reviews
Purpose:   Reviews, review invites, owner replies and listing removal.
Does NOT:  Moderate anything (routers/reviews.py).
Split out of schemas/schemas.py (MEH-3270); the code is moved verbatim and
every name is still importable from app.schemas.schemas.
"""

from typing import Literal
from uuid import UUID
from pydantic import BaseModel, Field, field_validator
from app.services.sanitization import sanitize_text
from app.schemas.schemas import (
    _min_letters_validator,
)


# --- Review (ProducerReview) ---
# MEH-458: relocated from routers/reviews.py per ADR-006 R1.
# created_at: str preserved (Drift #4 in audit, intentional out-of-scope).
class ReviewCreateNested(BaseModel):
    stars: int = Field(..., ge=1, le=5)
    body: str = Field(..., min_length=10, max_length=500)
    # MEH-1428 chunk 1: the `rt` query param from a "request a review" link,
    # forwarded as-is. A valid token for THIS producer satisfies the
    # contact-click gate; anything else falls through to the click check.
    # Never persisted — only `source` ("click" | "invite_link") is.
    review_token: str | None = Field(default=None, max_length=2048)

    @field_validator("body")
    @classmethod
    def _sanitize_body(cls, v: str) -> str | str | None:
        return sanitize_text(v, max_length=500)


class ReviewInviteLinkOut(BaseModel):
    """MEH-1428 chunk 1: GET /producers/me/review-link — the shareable URL
    (public producer page + `?rt=<token>`)."""

    url: str


class ReviewReplyUpdate(BaseModel):
    """MEH-1039: business-owner reply to a customer review. An empty/blank
    `reply` clears the existing reply; a non-empty reply is 2-1000 chars with
    ≥3 letters (MEH-555) after sanitize."""

    reply: str = Field(..., max_length=1000)

    @field_validator("reply")
    @classmethod
    def _validate_reply(cls, v: str | None) -> str:
        v = sanitize_text(v, max_length=1000)
        stripped = (v or "").strip()
        if not stripped:
            return ""  # empty → clear the reply
        if len(stripped) < 2:
            raise ValueError("התגובה חייבת להכיל לפחות 2 תווים")
        # MEH-555: reject punctuation-only ("???") — require ≥3 letters.
        return _min_letters_validator(stripped, min_count=3)


class ReviewOut(BaseModel):
    id: UUID
    producer_id: UUID
    # MEH-3221 (B10): the public payload carries no user_id and only the
    # shortened name («שם פרטי + אות»). `is_mine` replaces the client-side
    # `user_id === me` comparison; False for an anonymous viewer.
    is_mine: bool = False
    user_name: str | None = None
    stars: int
    body: str | None = None
    created_at: str
    # MEH-1039: business-owner reply (owner-only PUT /reviews/{id}/reply).
    reply: str | None = None
    reply_at: str | None = None
    # MEH-1428: `source` ("click" | "invite_link") is deliberately NOT here.
    # It says how a reviewer passed the contact gate — whether the owner
    # sent them an invite link — which is moderation signal, not something
    # every visitor to a producer page should be able to read off each
    # review. Admin-only: AdminReviewOut.source (reviewer finding on #3368).

    model_config = {"from_attributes": True}


class AdminReviewOut(BaseModel):
    id: UUID
    producer_id: UUID
    producer_name: str | None = None
    user_id: UUID
    user_name: str | None = None
    user_email: str | None = None
    stars: int
    body: str | None = None
    is_hidden: bool
    created_at: str
    # MEH-1428: "click" | "invite_link" — how the reviewer passed the contact
    # gate. Admin-only on purpose; the public ReviewOut does not carry it.
    source: Literal["click", "invite_link"] = "click"
    # MEH-2349: the AI verdict on the body. None = no body, or the review
    # predates the column. Admin-only, like `source`.
    ai_moderation_status: Literal["APPROVED", "FLAGGED"] | None = None
    # MEH-2381: ISO time of the author's last edit while hidden; None = not
    # edited since the admin last hid or unhid it. Admin-only, like `source`.
    edited_after_hidden_at: str | None = None
    # MEH-3258: "owner" | "competitor" | None. Not hidden, yet not public: the
    # author now owns this business, or one sharing a category. Computed per
    # read (services/review_conflicts.py), never stored. Admin-only.
    conflict: Literal["owner", "competitor"] | None = None

    model_config = {"from_attributes": True}


class ReviewsPage(BaseModel):
    reviews: list[ReviewOut]
    total: int
    page: int
    pages: int
    # MEH-1337: visible reviews per star, "1".."5", over the whole business
    # (every page), for the distribution bars. Always all five keys.
    rating_counts: dict[str, int] = {}

    model_config = {"from_attributes": True}


# --- Admin (admin.py + admin_extra.py) ---
# MEH-460 Pkg 1: relocated from routers/admin.py + routers/admin_extra.py
# per ADR-006 R1. Pure relocation — fields, validators, model_config
# preserved verbatim. CategoryOut excluded — it was byte-identical to
# the public CategoryOut in the Category section above; admin_extra.py
# now imports it from there instead of redefining.


# Admin: Moderation
class RemoveListingBody(BaseModel):
    reason: str | None = None
