"""
Module:   review_conflicts
Purpose:  Keep a review out of the public list and the rating once its author
          has a conflict of interest with the business: she now owns it, or she
          owns a business sharing one of its categories (a direct competitor).
Touches:  producer_reviews, users, producer_categories (read);
          producers.avg_rating / reviews_count (write, via the recompute).
Does NOT: write ProducerReview.is_hidden. Hidden still means "an admin hid it"
          (routers/reviews.py, MEH-2348) — a conflict is computed on every read,
          so it lifts by itself when the conflict ends (business deleted,
          categories changed). It does not block NEW reviews either; that is
          routers/reviews.py guard 2 / 2b (MEH-2076).
Related:  routers/reviews.py:_shares_category (the same intersection rule, for
          the write guard) · routers/producer_claim.py · routers/auth.py
          upgrade path · routers/producer_me.py + routers/admin.py category
          writes (the recompute triggers).
History:  MEH-3258 (creation — grill retro D2, Sapir 14/11).
"""

from typing import Any
from uuid import UUID

from sqlalchemy import and_, exists, func
from sqlalchemy.orm import Session, aliased
from sqlalchemy.sql.elements import ColumnElement

from app.models import Producer, ProducerCategory, ProducerReview, User


def _owner_conflict() -> ColumnElement[bool]:
    """EXISTS: the author's account now owns the reviewed business."""
    author = aliased(User)
    return exists().where(
        author.id == ProducerReview.user_id,
        author.producer_id == ProducerReview.producer_id,
    )


def _competitor_conflict() -> ColumnElement[bool]:
    """EXISTS: the author owns a business whose category set intersects the
    reviewed one's — the same intersection as reviews._shares_category."""
    author = aliased(User)
    mine = aliased(ProducerCategory)
    theirs = aliased(ProducerCategory)
    return exists().where(
        author.id == ProducerReview.user_id,
        author.producer_id.isnot(None),
        author.producer_id != ProducerReview.producer_id,
        mine.producer_id == author.producer_id,
        theirs.producer_id == ProducerReview.producer_id,
        theirs.category_id == mine.category_id,
    )


def conflict_free() -> ColumnElement[bool]:
    """Filter clause for every public read and aggregate of reviews.

    Correlates to the ProducerReview in the enclosing query."""
    return and_(~_owner_conflict(), ~_competitor_conflict())


def conflict_kind_columns() -> tuple[Any, Any]:
    """For /admin/reviews: two boolean columns (owner, competitor) to select
    beside each ProducerReview — why a review that is not hidden is still off
    the public page. One query, no per-row lookup."""
    return (
        _owner_conflict().label("conflict_owner"),
        _competitor_conflict().label("conflict_competitor"),
    )


def recompute_producer_rating(producer_id: UUID, db: Session) -> None:
    """Recompute avg_rating + reviews_count from the public reviews: not hidden
    by an admin and not in conflict (MEH-3258)."""
    row = (
        db.query(
            func.avg(ProducerReview.stars).label("avg"),
            func.count(ProducerReview.id).label("cnt"),
        )
        .filter(
            ProducerReview.producer_id == producer_id,
            ProducerReview.is_hidden.is_(False),
            conflict_free(),
        )
        .one()
    )
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer:
        producer.avg_rating = float(row.avg) if row.avg is not None else 0.0  # type: ignore[assignment]
        producer.reviews_count = int(row.cnt or 0)  # type: ignore[assignment]
        db.commit()


def _recompute_all(db: Session, producer_ids: set[Any]) -> None:
    for pid in producer_ids:
        recompute_producer_rating(pid, db)


def recompute_after_owner_linked(db: Session, user_id: Any) -> None:
    """A user just became a business owner (claim, or a consumer upgrading at
    registration). Every business she reviewed may now be in conflict."""
    rows = db.query(ProducerReview.producer_id).filter(
        ProducerReview.user_id == user_id
    )
    _recompute_all(db, {r[0] for r in rows})


def recompute_after_categories_changed(
    db: Session, producer_id: Any, category_ids: Any = ()
) -> None:
    """A business's categories changed, or it just went live. Two sets can
    move: reviews ON it by competitors' owners, and reviews BY its own
    owner(s) on other businesses.

    `category_ids` is the PUT payload's value: None means "categories not in
    this save", so nothing moved and nothing is recomputed. The default runs
    it (the approval call site)."""
    if category_ids is None:
        return
    owner_ids = [
        u[0] for u in db.query(User.id).filter(User.producer_id == producer_id)
    ]
    reviewed: set[Any] = {producer_id}
    if owner_ids:
        reviewed |= {
            r[0]
            for r in db.query(ProducerReview.producer_id).filter(
                ProducerReview.user_id.in_(owner_ids)
            )
        }
    _recompute_all(db, reviewed)
