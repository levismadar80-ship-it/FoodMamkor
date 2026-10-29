"""Hard-delete a user and everything that belongs to her.

One implementation for both doors (MEH-2585): the self-service
``DELETE /auth/me`` (auth.delete_account) and the admin action
``DELETE /admin/users/{id}`` (admin_extra.admin_delete_user). Before this
module the logic lived inline in auth.delete_account. It moved here with the same
steps in the same order (two helpers split out to satisfy ruff's complexity
limits; the URL capture loops became comprehensions), so the admin path cannot
drift from the GDPR path (Smell #1: one mechanism). Covered by
tests/test_account_deletion_cascade.py and tests/test_cloudinary_cleanup.py.

The caller owns everything around the deletion: auth checks, rate limits and
whether a confirmation email is sent. This function commits.
"""

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.models import Producer, Product, User
from app.models.models import (
    Favorite,
    HomeProduct,
    HomeProductRating,
    HomeProductWhatsAppClick,
    ProducerReview,
    Report,
)
from app.services import retired_slugs  # MEH-2528
from app.services.group_buy_delist import (  # MEH-2503
    cancel_live_group_buys,
    withdraw_user_commits,
)


def delete_user_and_data(
    db: Session,
    user: User,
    background_tasks: BackgroundTasks,
    *,
    context: str,
) -> None:
    """Delete ``user``, her own business (if any) and all linked rows.

    ``context`` labels the post-commit Cloudinary cleanup logs
    (``auth.delete_account`` / ``admin.delete_user``).
    """
    producer_id = user.producer_id

    # MEH-1150: capture the OTHER businesses this user has reviewed BEFORE the
    # cascade runs. ProducerReview.user_id is ondelete=CASCADE (models.py), so
    # `db.delete(user)` below silently removes the user's reviews of third-party
    # businesses — but producers.avg_rating / reviews_count are denormalized and
    # maintained ONLY in reviews.py (_recompute_producer_rating), so without a
    # refresh those businesses would keep an inflated rating that counts reviews
    # no longer in the DB. We collect the set now and recompute each AFTER the
    # deletion commits (below). The user's OWN producer is excluded: it is
    # hard-deleted in step 2, so recomputing it is pointless and it no longer
    # exists. Empty set (user wrote no reviews) → no extra work.
    reviewed_producer_ids = {
        pid
        for (pid,) in db.query(ProducerReview.producer_id)
        .filter(ProducerReview.user_id == user.id)
        .distinct()
        .all()
        if pid != producer_id
    }

    # MEH-375: capture every Cloudinary URL owned by this user BEFORE
    # any db.delete, since the cascade detaches relationships and the
    # URLs become unreachable post-commit. 5 surfaces:
    #   A) user.avatar_url
    #   B) producer.images           (if user.producer_id)
    #   C) every Product.image_url   (for that producer)
    #   D) every HomeProduct.photo   (user-owned, not producer-owned)
    #   E) every HomeProduct.images  (same rows as D)
    # producer.story_card_url IS captured separately (MEH-513) and destroyed
    # post-commit with bypass_reserved=True — required because
    # mehamakor/producers/* is in RESERVED_PUBLIC_ID_PREFIXES and a plain
    # destroy_image call would be silently rejected by the cleanup guard.
    # The sibling fix on the admin path is admin_delete_producer (MEH-510).
    # Destroy runs AFTER the final db.commit so a constraint failure
    # leaves DB and Cloudinary in sync.
    captured_urls, old_story_card_url = _capture_image_urls(db, user, producer_id)

    # 1. Clean up user-linked (not producer-linked) rows that don't cascade
    #    from the user delete. HomeProduct.user_id is CASCADE, but we keep
    #    the explicit deletes for defense-in-depth against pre-cascade data.
    db.query(HomeProductRating).filter(HomeProductRating.user_id == user.id).delete()
    db.query(HomeProductWhatsAppClick).filter(
        HomeProductWhatsAppClick.user_id == user.id
    ).delete()
    db.query(HomeProduct).filter(HomeProduct.user_id == user.id).delete()
    db.query(Favorite).filter(Favorite.user_id == user.id).delete()
    db.query(Report).filter(Report.reporter_id == user.id).delete()

    # 2. If this user owns a Producer, remove the FK reference from the user
    #    row first (User.producer_id has no ondelete, so deleting the
    #    producer while the user still points at it would violate the
    #    constraint), then delete the producer — children cascade.
    # MEH-2503: a participant leaving the site leaves her live group buys the
    # way /group-buys/{id}/commit DELETE does (funded → open below minimum).
    withdraw_user_commits(db, user)

    _delete_own_producer(db, user, producer_id, background_tasks)

    # 3. Finally, delete the user itself.
    db.delete(user)
    db.commit()

    # MEH-1150: the user's reviews of third-party businesses are now gone
    # (cascade committed above). Refresh the cached rating aggregate on each
    # of those businesses so avg_rating / reviews_count no longer count the
    # deleted reviews. Synchronous — the per-user review count is small
    # (over-engineering guard: no background job). `_recompute_producer_rating`
    # commits internally. Local import avoids the auth<->reviews import cycle
    # (reviews.py imports app.auth).
    if reviewed_producer_ids:
        from app.routers.reviews import _recompute_producer_rating

        for reviewed_pid in reviewed_producer_ids:
            _recompute_producer_rating(reviewed_pid, db)

    # MEH-375: post-commit Cloudinary cleanup. fail-open per
    # destroy_image contract — failures log via app.upload, the cleanup
    # script catches misses on its next run, and the DB cascade is
    # never rolled back on a Cloudinary outage. Duplicate URLs across
    # surfaces (rare, e.g. avatar reused as producer image) are
    # idempotent — Cloudinary returns "not found" on the second call.
    from app.cloudinary_utils import destroy_image

    for url in captured_urls:
        destroy_image(url, context=context)
    # MEH-513: story_card needs bypass_reserved=True — the producer is gone,
    # the slot is now an orphan (the cleanup script reject list is for live
    # story-cards; this is explicitly not one).
    destroy_image(
        old_story_card_url,
        bypass_reserved=True,
        context=f"{context} story_card",
    )


def _capture_image_urls(
    db: Session, user: User, producer_id
) -> tuple[list[str], str | None]:
    """Cloudinary URLs owned by ``user`` (see the MEH-375 note at the call)."""
    captured_urls: list[str] = [user.avatar_url] if user.avatar_url else []
    old_story_card_url: str | None = None
    producer = (
        db.query(Producer).filter(Producer.id == producer_id).first()
        if producer_id is not None
        else None
    )
    if producer is not None:
        old_story_card_url = producer.story_card_url
        captured_urls += [url for url in producer.images or [] if url]
        products = db.query(Product).filter(Product.producer_id == producer.id)
        captured_urls += [p.image_url for p in products.all() if p.image_url]
    for hp in db.query(HomeProduct).filter(HomeProduct.user_id == user.id).all():
        captured_urls += [url for url in [hp.photo, *(hp.images or [])] if url]
    return captured_urls, old_story_card_url


def _delete_own_producer(
    db: Session, user: User, producer_id, background_tasks: BackgroundTasks
) -> None:
    """Step 2: unlink and hard-delete the user's own business, if any."""
    if producer_id is None:
        return
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is not None:
        # MEH-2503: her own live group buys are cancelled and their
        # participants told, as on a suspension (MEH-2498) — before the
        # unlink, since the helper skips users linked to this producer.
        cancel_live_group_buys(db, producer, background_tasks)
        # MEH-2528: her business's URL stays reserved after she leaves, so
        # the next business with that name cannot inherit her links.
        retired_slugs.retire_slug(db, producer, "deleted")
    user.producer_id = None
    db.flush()
    if producer is not None:
        # MEH-816: phone_otp_tokens cascade via the DB FK (ondelete=CASCADE)
        # plus passive_deletes=True on the Producer.otp_tokens backref
        # (MEH-773 Chunk B), so no explicit pre-delete is needed. DO NOT
        # re-add one — passive_deletes already pre-empts the NotNullViolation
        # the old MEH-755 bulk-delete guarded.
        db.delete(producer)
