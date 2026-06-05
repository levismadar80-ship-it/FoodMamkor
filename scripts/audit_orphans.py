"""Read-only orphan audit for the מהמקור database (MEH-749).

Maps dangling / orphaned rows after the manual SQL deletions in production
on 2026-06-05 (old admin user row + producer rows deleted directly in
Railway, bypassing the app-level FK unlink and Cloudinary cleanup).

Usage:
    python scripts/audit_orphans.py        # uses $DATABASE_URL

Same bootstrap pattern as scripts/create_admin.py: reads DATABASE_URL from
the environment (defaults to the local dev DB) and adds backend/ to sys.path.

READ-ONLY GUARANTEE: this script issues SELECT/COUNT statements only. It
never calls db.add / db.commit / db.delete / db.flush and emits no
INSERT / UPDATE / DELETE. Safe to run against production.

Schema note (MEH-749 Phase 0): the ticket's check #1 names
`producers.user_id`, but that column does NOT exist — the producer↔user
link is one-directional (`users.producer_id -> producers.id`,
models.py:226). Check #1 is therefore implemented as its schema-valid
inverse: "ownerless producers" (no users row points at them). Admin-created
producers are legitimately ownerless, so that section is informational —
cross-check sample ids by hand.

History: MEH-749 (creation). Related incident: MEH-747 (the missing FK
unlink that forced the manual SQL), MEH-375/510 (bypassed Cloudinary
cleanup paths).
"""
import os
import sys
from dataclasses import dataclass
from typing import Callable

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/mehamakor"
)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sqlalchemy import func, inspect

from app.database import SessionLocal, engine
from app.models import (
    Favorite,
    HomeProduct,
    HomeProductRating,
    HomeProductWhatsAppClick,
    InboundMessage,
    PhoneOtpToken,
    Producer,
    ProducerFollower,
    ProducerReview,
    Product,
    Report,
    User,
)

SAMPLE_LIMIT = 5


@dataclass
class FkCheck:
    """A child table whose foreign key may point at a deleted parent row."""

    label: str
    child: type
    fk_attr: object
    parent: type
    parent_pk: object
    id_fn: Callable
    nullable: bool = True


def _header(title: str) -> None:
    print()
    print("=" * 72)
    print(title)
    print("-" * 72)


def _result(label: str, count: int, samples: list) -> None:
    if count == 0:
        print(f"  [CLEAN]   {label}: 0")
    else:
        joined = ", ".join(samples) if samples else "—"
        print(f"  [ORPHANS] {label}: {count}  (sample: {joined})")


def _run_fk_check(db, spec: FkCheck) -> None:
    """Count + sample children whose non-null FK has no matching parent."""
    q = db.query(spec.child)
    if spec.nullable:
        q = q.filter(spec.fk_attr.isnot(None))
    q = q.filter(~db.query(spec.parent).filter(spec.parent_pk == spec.fk_attr).exists())
    count = q.count()
    samples = [spec.id_fn(row) for row in q.limit(SAMPLE_LIMIT).all()]
    _result(spec.label, count, samples)


def check_ownerless_producers(db) -> None:
    """Check #1 (schema-valid inverse): producers no users row points at.

    NOTE: admin-created producers are legitimately ownerless — this is an
    informational signal, not a hard orphan. Cross-check samples by hand.
    """
    _header("1. Ownerless producers (no users.producer_id -> this producer)")
    print("    note: admin-created producers are expected here — informational only")
    sub = db.query(User).filter(User.producer_id == Producer.id).exists()
    q = db.query(Producer).filter(~sub)
    count = q.count()
    samples = [f"{p.id} ({p.name})" for p in q.limit(SAMPLE_LIMIT).all()]
    _result("producers with no owning user", count, samples)


def check_users_producer_id(db) -> None:
    """Check #2: users.producer_id pointing at a deleted producer."""
    _header("2. users.producer_id -> missing producer (primary MEH-747 orphan)")
    _run_fk_check(
        db,
        FkCheck(
            "users with dangling producer_id",
            User,
            User.producer_id,
            Producer,
            Producer.id,
            lambda r: f"{r.id} (email={r.email})",
        ),
    )


def check_is_producer_flag(db) -> None:
    """Check #3: users.is_producer=true but no backing producer row."""
    _header("3. users.is_producer=true with no producer row")
    sub = db.query(Producer).filter(Producer.id == User.producer_id).exists()
    q = db.query(User).filter(User.is_producer.is_(True), ~sub)
    count = q.count()
    samples = [f"{u.id} (email={u.email})" for u in q.limit(SAMPLE_LIMIT).all()]
    _result("is_producer=true, producer_id null or dangling", count, samples)


def check_otp_tokens(db) -> None:
    """Check #4: phone_otp_tokens.producer_id -> missing producer."""
    _header("4. phone_otp_tokens -> missing producer")
    _run_fk_check(
        db,
        FkCheck(
            "otp tokens with dangling producer_id",
            PhoneOtpToken,
            PhoneOtpToken.producer_id,
            Producer,
            Producer.id,
            lambda r: str(r.id),
            nullable=False,
        ),
    )


def check_relationship_tables(db) -> None:
    """Check #5: favorites / reviews / reports / followers -> missing parents."""
    _header("5. favorites / producer_reviews / reports / producer_followers")
    specs = [
        FkCheck("favorites -> missing user", Favorite, Favorite.user_id, User,
                User.id, lambda r: f"user={r.user_id},producer={r.producer_id}", False),
        FkCheck("favorites -> missing producer", Favorite, Favorite.producer_id,
                Producer, Producer.id,
                lambda r: f"user={r.user_id},producer={r.producer_id}", False),
        FkCheck("producer_reviews -> missing producer", ProducerReview,
                ProducerReview.producer_id, Producer, Producer.id,
                lambda r: str(r.id), False),
        FkCheck("producer_reviews -> missing user", ProducerReview,
                ProducerReview.user_id, User, User.id, lambda r: str(r.id), False),
        FkCheck("reports -> missing reporter (user)", Report, Report.reporter_id,
                User, User.id, lambda r: str(r.id), False),
        FkCheck("reports -> missing producer", Report, Report.producer_id,
                Producer, Producer.id, lambda r: str(r.id), False),
        FkCheck("producer_followers -> missing user", ProducerFollower,
                ProducerFollower.user_id, User, User.id, lambda r: str(r.id), False),
        FkCheck("producer_followers -> missing producer", ProducerFollower,
                ProducerFollower.producer_id, Producer, Producer.id,
                lambda r: str(r.id), False),
    ]
    for spec in specs:
        _run_fk_check(db, spec)


def check_home_products(db) -> None:
    """Check #6: home_products + ratings/clicks -> missing users."""
    _header("6. home_products + ratings/clicks -> missing user")
    specs = [
        FkCheck("home_products -> missing user", HomeProduct, HomeProduct.user_id,
                User, User.id, lambda r: str(r.id), False),
        FkCheck("home_product_ratings -> missing user", HomeProductRating,
                HomeProductRating.user_id, User, User.id, lambda r: str(r.id), False),
        FkCheck("home_product_whatsapp_clicks -> missing user",
                HomeProductWhatsAppClick, HomeProductWhatsAppClick.user_id, User,
                User.id, lambda r: str(r.id), False),
    ]
    for spec in specs:
        _run_fk_check(db, spec)


def check_inbound_messages(db) -> None:
    """Check #7: inbound WhatsApp messages — orphan count only (heuristic).

    inbound_messages has no FK to producers/users (keyed on from_phone), so
    "orphan" here is a heuristic: messages whose from_phone matches no
    producer.phone. Count only, no sample ids.
    """
    _header("7. inbound_messages (orphan count only)")
    if not inspect(engine).has_table("inbound_messages"):
        print("  [SKIP]    inbound_messages table does not exist")
        return
    total = db.query(InboundMessage).count()
    sub = db.query(Producer).filter(Producer.phone == InboundMessage.from_phone).exists()
    no_match = db.query(InboundMessage).filter(~sub).count()
    print(f"  total inbound_messages: {total}")
    label = "inbound messages whose from_phone matches no producer.phone (heuristic)"
    _result(label, no_match, [])


def check_cloudinary_refs(db) -> None:
    """Check #8: count Cloudinary URLs referenced in the DB (no API calls).

    For manual cross-check against the Cloudinary console — a higher asset
    count there than referenced here points at orphaned uploads.
    """
    _header("8. Cloudinary URL references in DB (counts only — no API calls)")
    story_cards = db.query(Producer).filter(Producer.story_card_url.isnot(None)).count()
    avatars = db.query(User).filter(User.avatar_url.isnot(None)).count()
    product_images = db.query(Product).filter(Product.image_url.isnot(None)).count()
    hp_photos = db.query(HomeProduct).filter(HomeProduct.photo.isnot(None)).count()
    producer_gallery = (
        db.query(func.coalesce(func.sum(func.coalesce(
            func.array_length(Producer.images, 1), 0)), 0)).scalar()
    )
    hp_gallery = (
        db.query(func.coalesce(func.sum(func.coalesce(
            func.array_length(HomeProduct.images, 1), 0)), 0)).scalar()
    )
    print(f"  producers.story_card_url (non-null): {story_cards}")
    print(f"  producers.images (total urls):       {producer_gallery}")
    print(f"  products.image_url (non-null):       {product_images}")
    print(f"  users.avatar_url (non-null):         {avatars}")
    print(f"  home_products.photo (non-null):      {hp_photos}")
    print(f"  home_products.images (total urls):   {hp_gallery}")


def main() -> int:
    db = SessionLocal()
    try:
        print("מהמקור — orphan audit (READ-ONLY). DB:", os.environ["DATABASE_URL"])
        check_ownerless_producers(db)
        check_users_producer_id(db)
        check_is_producer_flag(db)
        check_otp_tokens(db)
        check_relationship_tables(db)
        check_home_products(db)
        check_inbound_messages(db)
        check_cloudinary_refs(db)
        print()
        print("=" * 72)
        print("Audit complete. No rows were modified.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
