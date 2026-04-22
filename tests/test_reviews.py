"""MEH-103 — verified reviews system tests.

Guards tested:
  - POST without WA click → 403
  - POST from producer owner → 403
  - POST with valid WA click → 201
  - GET /producers/{id}/reviews excludes is_hidden=True rows
  - PUT /admin/reviews/{id}/hide sets is_hidden, recomputes aggregates
  - _recompute_producer_rating excludes hidden reviews
"""
import pytest

from conftest import auth_header, make_producer, make_user
from app.models.models import ProducerReview, ProducerWhatsAppClick


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _wa_click(db, producer, user):
    """Insert a WA click row so the user passes the gate."""
    click = ProducerWhatsAppClick(producer_id=producer.id, user_id=user.id)
    db.add(click)
    db.commit()


VALID_BODY = "המוצרים מדהימים ואוהבת את השירות!"  # >10 chars


# ---------------------------------------------------------------------------
# POST guard: no WA click → 403
# ---------------------------------------------------------------------------

def test_post_review_requires_wa_click(client, db):
    user = make_user(db)
    producer = make_producer(db)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": VALID_BODY},
        headers=auth_header(user),
    )
    assert r.status_code == 403, r.text
    assert "WhatsApp" in r.json().get("detail", "")


# ---------------------------------------------------------------------------
# POST guard: unauthenticated → 401
# ---------------------------------------------------------------------------

def test_post_review_requires_auth(client, db):
    producer = make_producer(db)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 4, "body": VALID_BODY},
    )
    assert r.status_code == 401, r.text


# ---------------------------------------------------------------------------
# POST guard: producer owner cannot review themselves
# ---------------------------------------------------------------------------

def test_post_review_rejects_producer_owner(client, db):
    owner = make_user(db, role="producer")
    producer = make_producer(db)
    owner.producer_id = producer.id
    db.commit()
    # Give owner a WA click so only the owner guard fires
    _wa_click(db, producer, owner)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": VALID_BODY},
        headers=auth_header(owner),
    )
    assert r.status_code == 403, r.text
    assert "עסק" in r.json().get("detail", "") or "עצמ" in r.json().get("detail", "")


# ---------------------------------------------------------------------------
# POST success: user with WA click → 201
# ---------------------------------------------------------------------------

def test_post_review_success(client, db):
    user = make_user(db)
    producer = make_producer(db)
    _wa_click(db, producer, user)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 4, "body": VALID_BODY},
        headers=auth_header(user),
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["stars"] == 4
    assert data["body"] == VALID_BODY


# ---------------------------------------------------------------------------
# POST validation: body too short → 422
# ---------------------------------------------------------------------------

def test_post_review_body_too_short(client, db):
    user = make_user(db)
    producer = make_producer(db)
    _wa_click(db, producer, user)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": "קצר"},  # <10 chars
        headers=auth_header(user),
    )
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# POST upsert: duplicate updates existing review
# ---------------------------------------------------------------------------

def test_post_review_upserts_existing(client, db):
    user = make_user(db)
    producer = make_producer(db)
    _wa_click(db, producer, user)
    client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 3, "body": VALID_BODY},
        headers=auth_header(user),
    )
    r2 = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": VALID_BODY + " עדכון"},
        headers=auth_header(user),
    )
    assert r2.status_code == 201, r2.text
    assert r2.json()["stars"] == 5


# ---------------------------------------------------------------------------
# GET: hidden reviews excluded from public endpoint
# ---------------------------------------------------------------------------

def test_get_excludes_hidden_reviews(client, db):
    user1 = make_user(db)
    user2 = make_user(db, email="other@test.com")
    producer = make_producer(db)

    visible = ProducerReview(
        producer_id=producer.id, user_id=user1.id, stars=5, body="נהדר!"
    )
    hidden = ProducerReview(
        producer_id=producer.id, user_id=user2.id, stars=1, body="ספאם", is_hidden=True
    )
    db.add_all([visible, hidden])
    db.commit()

    r = client.get(f"/producers/{producer.id}/reviews")
    assert r.status_code == 200, r.text
    ids = [rev["id"] for rev in r.json()["reviews"]]
    assert str(visible.id) in ids
    assert str(hidden.id) not in ids
    assert r.json()["total"] == 1


# ---------------------------------------------------------------------------
# Admin: PUT /admin/reviews/{id}/hide sets is_hidden
# ---------------------------------------------------------------------------

def test_admin_hide_review(client, db):
    admin = make_user(db, role="admin")
    user = make_user(db, email="user@test.com")
    producer = make_producer(db)
    review = ProducerReview(
        producer_id=producer.id, user_id=user.id, stars=2, body="לא טוב"
    )
    db.add(review)
    db.commit()

    r = client.put(
        f"/admin/reviews/{review.id}/hide",
        headers=auth_header(admin),
    )
    assert r.status_code == 200, r.text
    db.refresh(review)
    assert review.is_hidden is True


def test_admin_hide_requires_admin(client, db):
    user = make_user(db)
    producer = make_producer(db)
    review = ProducerReview(
        producer_id=producer.id, user_id=user.id, stars=3, body="בסדר"
    )
    db.add(review)
    db.commit()

    r = client.put(
        f"/admin/reviews/{review.id}/hide",
        headers=auth_header(user),
    )
    assert r.status_code == 403, r.text


# ---------------------------------------------------------------------------
# Aggregate: hidden reviews excluded from avg_rating
# ---------------------------------------------------------------------------

def test_rating_aggregate_excludes_hidden(db):
    from app.routers.reviews import _recompute_producer_rating

    user1 = make_user(db)
    user2 = make_user(db, email="u2@test.com")
    producer = make_producer(db)

    visible = ProducerReview(
        producer_id=producer.id, user_id=user1.id, stars=5, is_hidden=False, body="מצוין"
    )
    hidden = ProducerReview(
        producer_id=producer.id, user_id=user2.id, stars=1, is_hidden=True, body="ספאם"
    )
    db.add_all([visible, hidden])
    db.commit()

    _recompute_producer_rating(producer.id, db)
    db.refresh(producer)
    assert producer.avg_rating == 5.0   # hidden 1-star excluded
    assert producer.reviews_count == 1  # only the visible review counted


# ---------------------------------------------------------------------------
# Rating threshold: ProducerCard shows rating only when reviews_count >= 3
# (backend stores the raw count; frontend enforces the ≥3 gate)
# ---------------------------------------------------------------------------

def test_rating_threshold_in_aggregate(db):
    """With 2 visible reviews, reviews_count should be 2 (< threshold for display)."""
    from app.routers.reviews import _recompute_producer_rating

    users = [make_user(db, email=f"u{i}@test.com") for i in range(2)]
    producer = make_producer(db)

    for i, u in enumerate(users):
        db.add(ProducerReview(
            producer_id=producer.id, user_id=u.id, stars=4, body="טוב מאוד!"
        ))
    db.commit()

    _recompute_producer_rating(producer.id, db)
    db.refresh(producer)
    assert producer.reviews_count == 2  # below the ≥3 frontend threshold
