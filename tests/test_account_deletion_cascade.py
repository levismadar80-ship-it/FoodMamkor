"""MEH-249 — DELETE /auth/me must cascade a Producer row too.

Before MEH-249, deleting a producer-user cleaned up HomeProducts,
Favorites, and Reports but left the Producer row in the public
directory (with stale reviews, followers, and page views). GDPR /
חוק הגנת הפרטיות violation — the user consented to display only
while active.
"""
from app.models.models import (
    Favorite,
    Producer,
    ProducerCategory,
    ProducerFollower,
    ProducerReview,
)
from tests.conftest import auth_header, make_producer, make_user


def _make_producer_user(db):
    """Create a user wired up as a producer owner."""
    producer = make_producer(db, name="Doomed Farm", status="approved")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def test_delete_account_cascades_producer(client, db):
    user, producer = _make_producer_user(db)
    producer_id = producer.id

    r = client.delete("/auth/me", headers=auth_header(user))
    assert r.status_code == 200

    # Producer row is gone from the directory.
    assert db.query(Producer).filter(Producer.id == producer_id).first() is None


def test_delete_account_cascades_producer_children(client, db):
    """Reviews, followers, favorites pointing at the producer also go."""
    user, producer = _make_producer_user(db)
    producer_id = producer.id

    # A consumer leaves a review + favorite on the producer.
    consumer = make_user(db, role="consumer")
    db.add(ProducerReview(producer_id=producer.id, user_id=consumer.id, stars=5))
    db.add(ProducerFollower(producer_id=producer.id, user_id=consumer.id))
    db.add(Favorite(producer_id=producer.id, user_id=consumer.id))
    db.commit()

    r = client.delete("/auth/me", headers=auth_header(user))
    assert r.status_code == 200

    assert db.query(ProducerReview).filter(ProducerReview.producer_id == producer_id).count() == 0
    assert db.query(ProducerFollower).filter(ProducerFollower.producer_id == producer_id).count() == 0
    assert db.query(Favorite).filter(Favorite.producer_id == producer_id).count() == 0


def test_delete_account_without_producer_still_works(client, db):
    """Regression: consumer account deletion unchanged by the cascade."""
    user = make_user(db, role="consumer")
    r = client.delete("/auth/me", headers=auth_header(user))
    assert r.status_code == 200


def test_deleted_producer_not_in_public_listing(client, db):
    """The core GDPR concern — after account deletion the producer is
    gone from the public /producers list, not just marked inactive."""
    user, producer = _make_producer_user(db)
    name = producer.name

    client.delete("/auth/me", headers=auth_header(user))

    r = client.get("/producers")
    assert r.status_code == 200
    assert not any(p["name"] == name for p in r.json())
