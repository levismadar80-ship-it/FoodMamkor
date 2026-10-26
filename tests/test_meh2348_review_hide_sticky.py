"""MEH-2348 — an admin's hide is sticky; the author cannot undo it.

Before: the author re-POSTing (edit) ran ``existing_review.is_hidden = False``,
and the author could also DELETE the hidden review and post a fresh one (their
old contact click still passes the gate). Either way the admin's decision was
undone by the person it was taken against.

Premise (measured 26/10): ``producer_reviews.is_hidden`` has exactly one
writer that sets it — PUT /admin/reviews/{id}/hide — so hidden ⇒ admin-hidden
and no new column is needed.
"""

from conftest import auth_header, make_producer, make_user
from app.models.models import ProducerReview, ProducerWhatsAppClick

BODY = "המוצרים מדהימים ואוהבת את השירות!"


def _hidden_review(db, *, stars=1):
    author = make_user(db, email="author@example.com")
    producer = make_producer(db)
    db.add(ProducerWhatsAppClick(producer_id=producer.id, user_id=author.id))
    review = ProducerReview(
        producer_id=producer.id,
        user_id=author.id,
        stars=stars,
        body=BODY,
        is_hidden=True,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return author, producer, review


def test_author_edit_keeps_admin_hidden_review_hidden(client, db):
    author, producer, review = _hidden_review(db)
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": BODY + " עריכה"},
        headers=auth_header(author),
    )
    assert r.status_code == 201, r.text
    db.refresh(review)
    assert review.is_hidden is True
    assert review.stars == 5  # the edit itself still lands
    public = client.get(f"/producers/{producer.id}/reviews").json()
    assert str(review.id) not in [x["id"] for x in public["reviews"]]
    db.refresh(producer)
    assert producer.reviews_count == 0


def test_author_edit_of_visible_review_stays_visible(client, db):
    author = make_user(db, email="vis@example.com")
    producer = make_producer(db)
    db.add(ProducerWhatsAppClick(producer_id=producer.id, user_id=author.id))
    db.commit()
    client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 3, "body": BODY},
        headers=auth_header(author),
    )
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 4, "body": BODY + " עריכה"},
        headers=auth_header(author),
    )
    assert r.status_code == 201, r.text
    row = db.query(ProducerReview).filter_by(user_id=author.id).one()
    assert row.is_hidden is False and row.stars == 4


def test_author_cannot_delete_admin_hidden_review(client, db):
    # Deleting would let the author repost a fresh, visible review.
    author, _, review = _hidden_review(db)
    r = client.delete(f"/reviews/{review.id}", headers=auth_header(author))
    assert r.status_code == 404, r.text
    assert db.query(ProducerReview).filter_by(id=review.id).count() == 1


def test_admin_can_still_delete_hidden_review(client, db):
    _, _, review = _hidden_review(db)
    admin = make_user(db, role="admin", email="admin@example.com")
    r = client.delete(f"/reviews/{review.id}", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    assert db.query(ProducerReview).filter_by(id=review.id).count() == 0


def test_admin_unhide_restores_review_and_aggregate(client, db):
    _, producer, review = _hidden_review(db, stars=4)
    admin = make_user(db, role="admin", email="admin2@example.com")
    r = client.put(f"/admin/reviews/{review.id}/unhide", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    db.refresh(review)
    db.refresh(producer)
    assert review.is_hidden is False
    assert producer.reviews_count == 1 and producer.avg_rating == 4.0


def test_unhide_requires_admin(client, db):
    author, _, review = _hidden_review(db)
    r = client.put(f"/admin/reviews/{review.id}/unhide", headers=auth_header(author))
    assert r.status_code == 403, r.text
    db.refresh(review)
    assert review.is_hidden is True


def test_unhide_unknown_review_404(client, db):
    import uuid

    admin = make_user(db, role="admin", email="admin3@example.com")
    r = client.put(f"/admin/reviews/{uuid.uuid4()}/unhide", headers=auth_header(admin))
    assert r.status_code == 404, r.text
