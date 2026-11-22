"""
Module:   review_invite
Purpose:  The one builder of a business's «request a review» URL — the
          verified-review link (`?rt=<30-day invite token>`) that the owner
          shares from her dashboard and the buyer sees after a hand-over.
Touches:  nothing (reads the Producer row it is given; signs a JWT).
Does NOT: decide who may get the link — the owner route checks the business is
          approved (routers/producer_me_review.py), the buyer view checks the
          order was handed (services/product_order_views.py).
Related:  app/auth.py create_review_invite_token / decode_review_invite_token
History:  MEH-3620 (moved out of routers/producer_me_review.py so the order
          page builds the same URL)
"""

from app.auth import create_review_invite_token
from app.config import settings
from app.models import Producer


def review_invite_url(producer: Producer) -> str:
    """`{frontend_url}/p/{slug}?rt=<token>`, or `/producer/{id}` without a slug."""
    base = settings.frontend_url.rstrip("/")
    path = f"/p/{producer.slug}" if producer.slug else f"/producer/{producer.id}"
    token = create_review_invite_token(producer.id)  # type: ignore[arg-type]
    return f"{base}{path}?rt={token}"
