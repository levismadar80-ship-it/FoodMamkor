"""MEH-2381 — the admin sees when a hidden review was edited after the hide.

A hidden review stays hidden when its author edits it (MEH-2348), and until
now nothing told the admin the text had changed since she hid it.
``producer_reviews.edited_after_hidden_at`` is set when the author changes the
body or the stars of a HIDDEN review, and cleared by both admin actions: a
re-hide (she has now seen the current text) and an unhide (it is public).
"""

from datetime import datetime

import pytest

from conftest import auth_header, make_producer, make_user
from app.database import SessionLocal
from app.models.models import ProducerReview, ProducerWhatsAppClick
from app.routers import reviews as reviews_mod

BODY = "המוצרים מדהימים ואוהבת את השירות!"


@pytest.fixture(autouse=True)
def _no_ai(monkeypatch):
    monkeypatch.setattr(reviews_mod, "_moderate_review_body", lambda body: "APPROVED")


def _review(db, *, hidden, stars=4, email="author@example.com"):
    author = make_user(db, email=email)
    producer = make_producer(db)
    db.add(ProducerWhatsAppClick(producer_id=producer.id, user_id=author.id))
    review = ProducerReview(
        producer_id=producer.id, user_id=author.id, stars=stars, body=BODY, is_hidden=hidden
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return author, producer, review


def _edit(client, author, producer, *, body=BODY, stars=4):
    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": stars, "body": body},
        headers=auth_header(author),
    )
    assert r.status_code == 201, r.text


def _marker(db, review):
    db.refresh(review)
    return review.edited_after_hidden_at


def test_hidden_review_body_edit_sets_marker(client, db):
    author, producer, review = _review(db, hidden=True)
    _edit(client, author, producer, body=BODY + " עריכה")
    assert isinstance(_marker(db, review), datetime)
    assert review.is_hidden is True


def test_hidden_review_stars_only_edit_sets_marker(client, db):
    author, producer, review = _review(db, hidden=True, stars=1)
    _edit(client, author, producer, stars=5)
    assert _marker(db, review) is not None


def test_hidden_review_unchanged_resave_does_not_set_marker(client, db):
    author, producer, review = _review(db, hidden=True)
    _edit(client, author, producer)
    assert _marker(db, review) is None


def test_visible_review_edit_never_sets_marker(client, db):
    author, producer, review = _review(db, hidden=False)
    _edit(client, author, producer, body=BODY + " עריכה")
    assert _marker(db, review) is None


def test_second_edit_moves_marker_to_the_latest_edit(client, db, monkeypatch):
    author, producer, review = _review(db, hidden=True)
    first, second = datetime(2026, 10, 27, 8, 0), datetime(2026, 10, 27, 9, 30)
    monkeypatch.setattr(reviews_mod, "utc_now", lambda: first)
    _edit(client, author, producer, body=BODY + " א")
    assert _marker(db, review) == first
    monkeypatch.setattr(reviews_mod, "utc_now", lambda: second)
    _edit(client, author, producer, body=BODY + " ב")
    assert _marker(db, review) == second


@pytest.mark.parametrize("action", ["hide", "unhide"])
def test_admin_action_clears_marker(client, db, action):
    author, producer, review = _review(db, hidden=True)
    _edit(client, author, producer, body=BODY + " עריכה")
    assert _marker(db, review) is not None
    admin = make_user(db, role="admin", email="admin@example.com")
    r = client.put(f"/admin/reviews/{review.id}/{action}", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    assert _marker(db, review) is None


def test_admin_list_carries_marker_public_list_does_not(client, db):
    author, producer, review = _review(db, hidden=True)
    _edit(client, author, producer, body=BODY + " עריכה")
    _, _, plain = _review(db, hidden=True, email="plain@example.com")
    admin = make_user(db, role="admin", email="admin@example.com")

    rows = client.get("/admin/reviews", headers=auth_header(admin)).json()
    by_id = {row["id"]: row for row in rows}
    assert by_id[str(review.id)]["edited_after_hidden_at"]
    assert by_id[str(plain.id)]["edited_after_hidden_at"] is None

    db.query(ProducerReview).filter_by(id=review.id).update({"is_hidden": False})
    db.commit()
    public = client.get(f"/producers/{producer.id}/reviews").json()
    assert "edited_after_hidden_at" not in public["reviews"][0]


@pytest.mark.parametrize("same_after_sanitize", [BODY + "  ", f"<b>{BODY}</b>"])
def test_resave_that_sanitizes_to_the_same_body_does_not_set_marker(
    client, db, same_after_sanitize
):
    author, producer, review = _review(db, hidden=True)
    _edit(client, author, producer, body=same_after_sanitize)
    db.refresh(review)
    assert review.body == BODY  # the input really did sanitize back to BODY
    assert review.edited_after_hidden_at is None


def _flip_hidden_during_moderation(monkeypatch, review_id, hidden):
    """An admin hide/unhide commits from another session while the
    moderation call is in flight — after the route read the row."""

    def moderate(body):
        other = SessionLocal()
        try:
            other.query(ProducerReview).filter_by(id=review_id).update(
                {"is_hidden": hidden}
            )
            other.commit()
        finally:
            other.close()
        return "APPROVED"

    monkeypatch.setattr(reviews_mod, "_moderate_review_body", moderate)


def test_hide_committed_during_moderation_still_marks_the_edit(
    client, db, monkeypatch
):
    author, producer, review = _review(db, hidden=False)
    _flip_hidden_during_moderation(monkeypatch, review.id, hidden=True)
    _edit(client, author, producer, body=BODY + " עריכה")
    db.refresh(review)
    assert review.is_hidden is True
    assert review.edited_after_hidden_at is not None


def test_unhide_committed_during_moderation_leaves_no_marker(
    client, db, monkeypatch
):
    author, producer, review = _review(db, hidden=True)
    _flip_hidden_during_moderation(monkeypatch, review.id, hidden=False)
    _edit(client, author, producer, body=BODY + " עריכה")
    db.refresh(review)
    assert review.is_hidden is False
    assert review.edited_after_hidden_at is None


def test_owner_reply_on_hidden_review_does_not_set_marker(client, db):
    _, producer, review = _review(db, hidden=True)
    owner = make_user(db, role="producer", email="owner@example.com")
    owner.producer_id = producer.id
    db.commit()
    r = client.put(
        f"/reviews/{review.id}/reply",
        json={"reply": "תודה רבה על הביקורת"},
        headers=auth_header(owner),
    )
    assert r.status_code == 200, r.text
    assert _marker(db, review) is None


def _keep_hidden(client, db, review, seen):
    admin = make_user(db, role="admin", email="keeper@example.com")
    return client.put(
        f"/admin/reviews/{review.id}/hide",
        params={"seen": seen},
        headers=auth_header(admin),
    )


@pytest.mark.parametrize(
    "stamp",
    [None, datetime(2026, 10, 27, 8, 0)],
    ids=["real-clock-microseconds", "microsecond-zero"],
)
def test_keep_hidden_with_the_seen_edit_clears_the_marker(
    client, db, monkeypatch, stamp
):
    # isoformat() drops the fraction when microsecond == 0; both shapes must
    # round-trip through GET /admin/reviews → ?seen= unchanged.
    if stamp is not None:
        monkeypatch.setattr(reviews_mod, "utc_now", lambda: stamp)
    author, producer, review = _review(db, hidden=True)
    _edit(client, author, producer, body=BODY + " עריכה")
    admin = make_user(db, role="admin", email="admin@example.com")
    row = next(
        r
        for r in client.get("/admin/reviews", headers=auth_header(admin)).json()
        if r["id"] == str(review.id)
    )
    r = _keep_hidden(client, db, review, row["edited_after_hidden_at"])
    assert r.status_code == 200, r.text
    db.refresh(review)
    assert review.is_hidden is True
    assert review.edited_after_hidden_at is None


def test_keep_hidden_after_a_newer_edit_is_409_and_keeps_the_marker(
    client, db, monkeypatch
):
    author, producer, review = _review(db, hidden=True)
    first, second = datetime(2026, 10, 27, 8, 0), datetime(2026, 10, 27, 9, 30)
    monkeypatch.setattr(reviews_mod, "utc_now", lambda: first)
    _edit(client, author, producer, body=BODY + " א")
    seen = first.isoformat()  # what the admin's page showed
    monkeypatch.setattr(reviews_mod, "utc_now", lambda: second)
    _edit(client, author, producer, body=BODY + " ב")  # unseen edit

    r = _keep_hidden(client, db, review, seen)
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["code"] == "review_changed"
    assert _marker(db, review) == second
    assert review.is_hidden is True
