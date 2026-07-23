"""MEH-1241: regression tests for seed_demo_business._sync_users.

Executes the non-destructive --sync-users seed mode against the test DB and
proves it repairs exactly the two QA user rows (demo-owner password reset,
demo-consumer created) while leaving the demo producer, its products/reviews,
and the display-only review consumers byte-for-byte unchanged.

Chunk 1 could only transcribe _sync_users' writes to SQL (pip was denied in the
CC sandbox); this file is the real ORM execution — CI runs it via `pytest tests/`
against the Postgres service. Lives at repo-root tests/ (NOT backend/tests/) so
it inherits the conftest fixtures and is collected by CI (tests/CLAUDE.md).
"""
import pytest

from app.auth import hash_password, verify_password
from app.models.models import Producer, Product, ProducerReview, User
from scripts.seed_demo_business import (
    DEMO_CONSUMER_EMAIL,
    DEMO_OWNER_EMAIL,
    _sync_users,
)

OWNER_PW = "OwnerQaPw2026xyz"
CONSUMER_PW = "ConsumerQaPw2026xyz"
REVIEWER_EMAIL = "demo-reviewer-1@example.com"


def _seed_demo_like(db):
    """Minimal staging-like fixture: an approved producer + product + owner
    (with a random, unrecorded password, mirroring the real seed gap) + one
    display-only review consumer + a review. Returns the created rows."""
    producer = Producer(
        name="מאפיית רוח השדה (test)",
        description="Test producer",
        city="זכרון יעקב",
        lat=32.5732,
        lng=34.9519,
        status="approved",
        images=[],
    )
    db.add(producer)
    db.flush()

    product = Product(producer_id=producer.id, name="לחם מחמצת כפרי")
    owner = User(
        email=DEMO_OWNER_EMAIL,
        name="נועה לביא",
        role="producer",
        producer_id=producer.id,
        password_hash=hash_password("random-unrecorded-at-seed"),
        email_verified=True,
    )
    reviewer = User(
        email=REVIEWER_EMAIL,
        name="רות כהן",
        role="consumer",
        password_hash=hash_password("reviewer-random-unrecorded"),
        email_verified=True,
    )
    db.add_all([product, owner, reviewer])
    db.flush()
    review = ProducerReview(
        producer_id=producer.id, user_id=reviewer.id, stars=5, body="הלחם הכי טוב"
    )
    db.add(review)
    db.commit()
    return producer, product, owner, reviewer, review


def test_sync_users_updates_owner_and_creates_consumer(db, monkeypatch):
    monkeypatch.setenv("DEMO_OWNER_PASSWORD", OWNER_PW)
    monkeypatch.setenv("DEMO_CONSUMER_PASSWORD", CONSUMER_PW)
    producer, product, owner, reviewer, review = _seed_demo_like(db)

    # Snapshots of the rows that MUST NOT change.
    prod_id, prod_verified_at = producer.id, producer.verified_at
    owner_old_hash = owner.password_hash
    reviewer_old_hash = reviewer.password_hash
    product_snap = (product.id, product.producer_id, product.name)
    review_snap = (review.id, review.producer_id, review.user_id, review.stars, review.body)

    _sync_users(db)
    db.expire_all()

    # Owner: password reset to hash(DEMO_OWNER_PASSWORD), still verified, linkage kept.
    owner2 = db.query(User).filter_by(email=DEMO_OWNER_EMAIL).one()
    assert owner2.password_hash != owner_old_hash
    assert verify_password(OWNER_PW, owner2.password_hash)
    assert owner2.email_verified is True
    assert owner2.role == "producer"
    assert owner2.producer_id == prod_id  # linkage untouched

    # Consumer: created, verified, consumer role, no producer linkage.
    consumer = db.query(User).filter_by(email=DEMO_CONSUMER_EMAIL).one()
    assert consumer.role == "consumer"
    assert consumer.email_verified is True
    assert consumer.producer_id is None
    assert verify_password(CONSUMER_PW, consumer.password_hash)

    # Producer / product / review / display reviewer: unchanged.
    producer2 = db.query(Producer).filter_by(id=prod_id).one()
    assert producer2.verified_at == prod_verified_at
    product2 = db.query(Product).filter_by(id=product.id).one()
    assert (product2.id, product2.producer_id, product2.name) == product_snap
    review2 = db.query(ProducerReview).filter_by(id=review.id).one()
    assert (
        review2.id,
        review2.producer_id,
        review2.user_id,
        review2.stars,
        review2.body,
    ) == review_snap
    reviewer2 = db.query(User).filter_by(email=REVIEWER_EMAIL).one()
    assert reviewer2.password_hash == reviewer_old_hash  # display-only reviewer untouched


def test_sync_users_aborts_when_owner_password_unset(db, monkeypatch):
    monkeypatch.delenv("DEMO_OWNER_PASSWORD", raising=False)
    monkeypatch.setenv("DEMO_CONSUMER_PASSWORD", CONSUMER_PW)
    _seed_demo_like(db)

    with pytest.raises(SystemExit):
        _sync_users(db)

    # Aborts before any write — the consumer is not created.
    db.expire_all()
    assert db.query(User).filter_by(email=DEMO_CONSUMER_EMAIL).first() is None


def test_sync_users_aborts_when_consumer_password_unset(db, monkeypatch):
    monkeypatch.setenv("DEMO_OWNER_PASSWORD", OWNER_PW)
    monkeypatch.delenv("DEMO_CONSUMER_PASSWORD", raising=False)
    _, _, owner, _, _ = _seed_demo_like(db)
    owner_old_hash = owner.password_hash

    with pytest.raises(SystemExit):
        _sync_users(db)

    # Aborts before any write — the owner password is NOT touched.
    db.expire_all()
    owner2 = db.query(User).filter_by(email=DEMO_OWNER_EMAIL).one()
    assert owner2.password_hash == owner_old_hash


def test_sync_users_aborts_when_owner_row_missing(db, monkeypatch):
    monkeypatch.setenv("DEMO_OWNER_PASSWORD", OWNER_PW)
    monkeypatch.setenv("DEMO_CONSUMER_PASSWORD", CONSUMER_PW)
    # No owner row seeded — the producer_id linkage only comes from the full seed.

    with pytest.raises(SystemExit):
        _sync_users(db)

    db.expire_all()
    assert db.query(User).filter_by(email=DEMO_CONSUMER_EMAIL).first() is None


def test_sync_users_is_idempotent(db, monkeypatch):
    monkeypatch.setenv("DEMO_OWNER_PASSWORD", OWNER_PW)
    monkeypatch.setenv("DEMO_CONSUMER_PASSWORD", CONSUMER_PW)
    _seed_demo_like(db)

    _sync_users(db)
    db.expire_all()
    consumer_id_first = db.query(User).filter_by(email=DEMO_CONSUMER_EMAIL).one().id

    _sync_users(db)  # second run — no duplicate, same row.
    db.expire_all()
    consumers = db.query(User).filter_by(email=DEMO_CONSUMER_EMAIL).all()
    assert len(consumers) == 1
    assert consumers[0].id == consumer_id_first
    assert verify_password(CONSUMER_PW, consumers[0].password_hash)
