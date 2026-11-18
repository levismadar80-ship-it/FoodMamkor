"""Hard-delete a user and everything that belongs to her.

One implementation for both doors (MEH-2585): the self-service
``POST /auth/me/delete`` (auth.delete_account) and the admin action
``DELETE /admin/users/{id}`` (admin_extra.admin_delete_user). Before this
module the logic lived inline in auth.delete_account. It moved here with the same
steps in the same order (two helpers split out to satisfy ruff's complexity
limits; the URL capture loops became comprehensions), so the admin path cannot
drift from the GDPR path (Smell #1: one mechanism). Covered by
tests/test_account_deletion_cascade.py and tests/test_cloudinary_cleanup.py.

The caller owns everything around the deletion: auth checks, rate limits and
whether a confirmation email is sent. This function commits.
"""

from uuid import UUID
from fastapi import BackgroundTasks
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Producer, Product, User
from app.models.models import (
    ContactMessage,
    DeliveryWaitlistEntry,
    Favorite,
    HomeProduct,
    HomeProductRating,
    HomeProductWhatsAppClick,
    InboundMessage,
    NewsletterSubscriber,
    OutboundMessage,
    OutreachLead,
    ProducerReview,
    Report,
    RescueOffer,
    RescueOrder,
)
from app.utils.clock import utc_now
from app.utils.phone import canonical_il_msisdn
from app.services import retired_slugs  # MEH-2528
from app.services.booking_cancellations import delist_business  # MEH-3227
from app.services.product_order_guards import refuse_delete_with_open_orders
from app.services.group_buy_delist import withdraw_user_commits  # MEH-2503
from app.services.rescue_no_show import record_tombstones  # MEH-3225


def _release_reserved_bags(db: Session, user: User) -> None:
    """Return the bags of ``user``'s still-reserved orders to their offers.

    rescue_orders.user_id is ON DELETE CASCADE, so without this the order
    vanishes while ``qty_left`` keeps counting it: a bag nobody can reserve and
    the business has no order for. Same lock order and same arithmetic as the
    buyer's own cancel (routers/rescue.py cancel_order) — offer first, then
    the order re-read under the lock.
    """
    order_ids = [
        (order_id, offer_id)
        for order_id, offer_id in db.query(RescueOrder.id, RescueOrder.offer_id)
        .filter(RescueOrder.user_id == user.id, RescueOrder.status == "reserved")
        # One fixed order, so two deletions that share offers lock them the
        # same way round.
        .order_by(RescueOrder.offer_id, RescueOrder.id)
    ]
    for order_id, offer_id in order_ids:
        offer = (
            db.query(RescueOffer)
            .filter(RescueOffer.id == offer_id)
            .populate_existing()
            .with_for_update()
            .one()
        )
        order = (
            db.query(RescueOrder)
            .filter(RescueOrder.id == order_id)
            .populate_existing()
            .with_for_update()
            .one()
        )
        if order.status != "reserved":
            continue
        order.status = "cancelled"  # type: ignore[assignment]
        order.cancelled_at = utc_now()  # type: ignore[assignment]
        offer.qty_left = min(offer.qty_left + order.qty, offer.qty_total)  # type: ignore[arg-type]
    db.flush()


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
    # MEH-3262: before the first write — a business with an open order stays.
    refuse_delete_with_open_orders(db, producer_id)
    # MEH-3225: the no-show block outlives the account (hashed email only).
    record_tombstones(db, user)

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
    captured_urls, old_story_card_url = _capture_image_urls(db, user, producer_id)  # type: ignore[arg-type]

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

    # MEH-3252: rows keyed by her email / phone, not by user_id. The
    # privacy policy says every identifiable record goes at deletion
    # («עם מחיקת חשבון נמחקים כל הנתונים המזוהים מיידית»), so they go here,
    # before the producer (whose phone counts as hers) is deleted.
    _erase_contact_trail(db, user, producer_id, background_tasks)  # type: ignore[arg-type]

    # 2. If this user owns a Producer, remove the FK reference from the user
    #    row first (User.producer_id has no ondelete, so deleting the
    #    producer while the user still points at it would violate the
    #    constraint), then delete the producer — children cascade.
    # MEH-2503: a participant leaving the site leaves her live group buys the
    # way /group-buys/{id}/commit DELETE does (funded → open below minimum).
    withdraw_user_commits(db, user)
    # MEH-2871: her reserved surprise bags go back to stock before the rows
    # cascade away with her.
    _release_reserved_bags(db, user)

    _delete_own_producer(db, user, producer_id, background_tasks)  # type: ignore[arg-type]

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
        # MEH-3258: the owner of the recompute is the service, not the router.
        from app.services.review_conflicts import recompute_producer_rating

        for reviewed_pid in reviewed_producer_ids:
            recompute_producer_rating(reviewed_pid, db)

    # MEH-375: post-commit Cloudinary cleanup. fail-open per
    # destroy_image contract — failures log via app.upload, the cleanup
    # script catches misses on its next run, and the DB cascade is
    # never rolled back on a Cloudinary outage. Duplicate URLs across
    # surfaces (rare, e.g. avatar reused as producer image) are
    # idempotent — Cloudinary returns "not found" on the second call.
    from app.cloudinary_utils import destroy_image

    for url in captured_urls:
        destroy_image(url, context=context, db=db)  # MEH-3247
    # MEH-513: story_card needs bypass_reserved=True — the producer is gone,
    # the slot is now an orphan (the cleanup script reject list is for live
    # story-cards; this is explicitly not one).
    destroy_image(
        old_story_card_url,
        bypass_reserved=True,
        context=f"{context} story_card",
        db=db,  # MEH-3247
    )


def _capture_image_urls(
    db: Session, user: User, producer_id: UUID | None
) -> tuple[list[str], str | None]:
    """Cloudinary URLs owned by ``user`` (see the MEH-375 note at the call)."""
    captured_urls: list[str] = [user.avatar_url] if user.avatar_url else []  # type: ignore[list-item]
    old_story_card_url: str | None = None
    producer = (
        db.query(Producer).filter(Producer.id == producer_id).first()
        if producer_id is not None
        else None
    )
    if producer is not None:
        old_story_card_url = producer.story_card_url  # type: ignore[assignment]
        captured_urls += [url for url in producer.images or [] if url]  # type: ignore[union-attr]
        products = db.query(Product).filter(Product.producer_id == producer.id)
        captured_urls += [p.image_url for p in products.all() if p.image_url]  # type: ignore[misc]
    for hp in db.query(HomeProduct).filter(HomeProduct.user_id == user.id).all():
        captured_urls += [url for url in [hp.photo, *(hp.images or [])] if url]
    return captured_urls, old_story_card_url


def _delete_own_producer(
    db: Session, user: User, producer_id: UUID | None, background_tasks: BackgroundTasks
) -> None:
    """Step 2: unlink and hard-delete the user's own business, if any."""
    if producer_id is None:
        return
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is not None:
        # MEH-2503: her own live group buys are cancelled and their
        # participants told, as on a suspension (MEH-2498) — before the
        # unlink, since the helper skips users linked to this producer.
        delist_business(db, producer, background_tasks)  # MEH-3227: + bags, sign-ups
        # MEH-2528: her business's URL stays reserved after she leaves, so
        # the next business with that name cannot inherit her links.
        retired_slugs.retire_slug(db, producer, "deleted")
    user.producer_id = None  # type: ignore[assignment]
    db.flush()
    if producer is not None:
        # MEH-816: phone_otp_tokens cascade via the DB FK (ondelete=CASCADE)
        # plus passive_deletes=True on the Producer.otp_tokens backref
        # (MEH-773 Chunk B), so no explicit pre-delete is needed. DO NOT
        # re-add one — passive_deletes already pre-empts the NotNullViolation
        # the old MEH-755 bulk-delete guarded.
        db.delete(producer)


def _phone_forms(phone: str | None) -> set[str]:
    """Every stored notation of one IL mobile number: the canonical
    ``972…`` (what Meta sends and the outbound log keeps), ``+972…`` and
    the local ``05…``. A number that does not canonicalise is matched as is."""
    if not phone or not phone.strip():
        return set()
    canonical = canonical_il_msisdn(phone)
    if canonical is None:
        return {phone.strip()}
    return {canonical, "+" + canonical, "0" + canonical[3:]}


def _erase_contact_trail(
    db: Session, user: User, producer_id: UUID | None, background_tasks: BackgroundTasks
) -> None:
    """MEH-3252: delete the email/phone-keyed rows that do not cascade.

    - newsletter_subscribers, contact_messages, delivery_waitlist: by email
      (case-insensitive) — delivery_waitlist also by user_id, whose FK is
      SET NULL and would otherwise leave the email behind.
    - inbound_messages / outbound_messages (the WhatsApp inbox): by her
      phone and, when her business goes with her, the business phone.
    - outreach_leads: the lead is about a business and stays; only the
      suggester's name and email are cleared, with her update consent.

    Kept on purpose: event/experience registrations. They were handed to the
    business for that date and the policy gives them their own window
    («נמחקים 30 יום אחרי המועד», retention_purge.REGISTRATION_RETENTION_DAYS).
    A phone match can also clear a WhatsApp log of another account that
    typed the same number; users.phone is not unique, and the log is the
    admin inbox, not anyone's account data.
    """
    email = (user.email or "").strip().lower()
    if email:
        db.query(NewsletterSubscriber).filter(
            func.lower(NewsletterSubscriber.email) == email
        ).delete(synchronize_session=False)
        # The list is also held in Resend Contacts (MEH-2611): remove it
        # there too, as the unsubscribe link does. Fail-open, post-request.
        from app.services.newsletter_sync import sync_unsubscribe

        background_tasks.add_task(sync_unsubscribe, email)
        db.query(ContactMessage).filter(
            func.lower(ContactMessage.email) == email
        ).delete(synchronize_session=False)
        db.query(OutreachLead).filter(
            func.lower(OutreachLead.suggested_by_email) == email
        ).update(
            {
                OutreachLead.suggested_by_email: None,
                OutreachLead.suggested_by_name: None,
                OutreachLead.suggester_wants_update: False,
            },
            synchronize_session=False,
        )
    waitlist = db.query(DeliveryWaitlistEntry).filter(
        DeliveryWaitlistEntry.user_id == user.id
    )
    if email:
        waitlist = db.query(DeliveryWaitlistEntry).filter(
            (DeliveryWaitlistEntry.user_id == user.id)
            | (func.lower(DeliveryWaitlistEntry.email) == email)
        )
    waitlist.delete(synchronize_session=False)

    phones = _phone_forms(user.phone)  # type: ignore[arg-type]
    if producer_id is not None:
        producer = db.query(Producer).filter(Producer.id == producer_id).first()
        if producer is not None:
            phones |= _phone_forms(producer.phone)  # type: ignore[arg-type]
    if phones:
        db.query(InboundMessage).filter(InboundMessage.from_phone.in_(phones)).delete(
            synchronize_session=False
        )
        db.query(OutboundMessage).filter(OutboundMessage.to_phone.in_(phones)).delete(
            synchronize_session=False
        )
