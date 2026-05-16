"""MEH-249 — DELETE /auth/me must cascade a Producer row too.

Before MEH-249, deleting a producer-user cleaned up HomeProducts,
Favorites, and Reports but left the Producer row in the public
directory (with stale reviews, followers, and page views). GDPR /
חוק הגנת הפרטיות violation — the user consented to display only
while active.

MEH-513 — DELETE /auth/me must also destroy the producer's story_card
Cloudinary asset with bypass_reserved=True (the asset lives under
mehamakor/producers/*, which is in RESERVED_PUBLIC_ID_PREFIXES; a plain
destroy call would be silently rejected).
"""
from app import cloudinary_utils
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


_STORY_CARD_URL = (
    "https://res.cloudinary.com/mehamakor/image/upload/v1/"
    "mehamakor/producers/abc-uuid/story-card.jpg"
)


def test_delete_account_cascades_story_card_destroy(client, db, monkeypatch):
    """MEH-513: story_card_url destroy must fire with bypass_reserved=True."""
    user, producer = _make_producer_user(db)
    producer.story_card_url = _STORY_CARD_URL
    db.commit()

    calls: list[dict] = []

    def fake_destroy(url, bypass_reserved=False, context=""):
        calls.append({"url": url, "bypass_reserved": bypass_reserved})
        return True

    monkeypatch.setattr(cloudinary_utils, "destroy_image", fake_destroy)

    r = client.delete("/auth/me", headers=auth_header(user))
    assert r.status_code == 200

    story_card_calls = [c for c in calls if c["url"] == _STORY_CARD_URL]
    assert len(story_card_calls) == 1, (
        f"expected exactly one destroy call for story_card_url, got "
        f"{len(story_card_calls)}; full call list: {calls}"
    )
    assert story_card_calls[0]["bypass_reserved"] is True, (
        f"story-card destroy MUST pass bypass_reserved=True; got: "
        f"{story_card_calls[0]}"
    )


def test_delete_account_with_no_story_card_still_calls_destroy(
    client, db, monkeypatch
):
    """MEH-513: no story_card_url — destroy(None, bypass_reserved=True) fires."""
    user, producer = _make_producer_user(db)
    # story_card_url defaults to None — don't set it.

    calls: list[dict] = []

    def fake_destroy(url, bypass_reserved=False, context=""):
        calls.append({"url": url, "bypass_reserved": bypass_reserved})
        return True

    monkeypatch.setattr(cloudinary_utils, "destroy_image", fake_destroy)

    r = client.delete("/auth/me", headers=auth_header(user))
    assert r.status_code == 200

    none_with_bypass = [
        c for c in calls if c["url"] is None and c["bypass_reserved"] is True
    ]
    assert len(none_with_bypass) == 1, (
        f"expected exactly one bypass=True call with url=None for the "
        f"story-card slot; full call list: {calls}"
    )
