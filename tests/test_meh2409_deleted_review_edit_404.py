"""MEH-2409 — an edit whose review is deleted during moderation is a 404.

The author edits; the route reads her row, then calls the AI moderation; an
admin deletes the review in that window. The re-read under FOR UPDATE in
``_apply_review_edit`` used to be ``db.refresh``, which raises
``InvalidRequestError`` on a vanished row and the request ended in a 500.
"""

import pytest

from conftest import auth_header, make_producer, make_user
from app.database import SessionLocal
from app.models.models import ProducerReview, ProducerWhatsAppClick
from app.routers import reviews as reviews_mod

BODY = "המוצרים מדהימים ואוהבת את השירות!"


@pytest.fixture
def review_deleted_during_moderation(db, monkeypatch):
    author = make_user(db, email="author@example.com")
    producer = make_producer(db)
    db.add(ProducerWhatsAppClick(producer_id=producer.id, user_id=author.id))
    review = ProducerReview(producer_id=producer.id, user_id=author.id, stars=4, body=BODY)
    db.add(review)
    db.commit()
    review_id = review.id

    def moderate(body):
        other = SessionLocal()
        try:
            other.query(ProducerReview).filter_by(id=review_id).delete()
            other.commit()
        finally:
            other.close()
        return "APPROVED"

    monkeypatch.setattr(reviews_mod, "_moderate_review_body", moderate)
    return author, producer, review_id


def test_edit_of_review_deleted_mid_moderation_is_404(client, db, review_deleted_during_moderation):
    author, producer, review_id = review_deleted_during_moderation
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": BODY + " עריכה"},
        headers=auth_header(author),
    )
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == "ביקורת לא נמצאה"
    # The edit did not resurrect the row the admin deleted.
    db.expire_all()
    assert db.query(ProducerReview).filter_by(id=review_id).first() is None
