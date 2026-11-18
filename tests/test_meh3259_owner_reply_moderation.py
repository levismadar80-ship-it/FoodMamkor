"""MEH-3259 — the business owner's reply to a review gets the AI check, and
the admin can see and remove it.

Before: PUT /reviews/{id}/reply stored any text that passed the length and
letters rules — an owner could insult the reviewer in public with no check,
and /admin/reviews showed no reply at all, so nobody could remove it.

Now: a REJECTED reply is a 422 and nothing is written; FLAGGED (or a
fail-open) publishes and the verdict lands on
``producer_reviews.reply_ai_moderation_status``; GET /admin/reviews returns
the reply and its verdict; PUT /admin/reviews/{id}/clear-reply removes it.
"""

import pytest

from conftest import auth_header, make_producer, make_user
from app.models.models import ProducerReview
from app.routers import reviews as reviews_mod

REPLY = "תודה רבה על הביקורת, שמחנו לארח אותך!"


def _setup(db):
    producer = make_producer(db)
    owner = make_user(db, email="owner3259@example.com", role="producer")
    owner.producer_id = producer.id
    author = make_user(db, email="author3259@example.com")
    admin = make_user(db, email="admin3259@example.com", role="admin")
    review = ProducerReview(
        producer_id=producer.id, user_id=author.id, stars=4, body="היה טעים מאוד"
    )
    db.add(review)
    db.commit()
    return owner, admin, review


def _calls(monkeypatch, value):
    seen = []

    def fake(text):
        seen.append(text)
        return value

    monkeypatch.setattr(reviews_mod, "_moderate_reply_text", fake)
    return seen


def _reply(client, owner, review, text=REPLY):
    return client.put(
        f"/reviews/{review.id}/reply", json={"reply": text}, headers=auth_header(owner)
    )


def test_rejected_reply_is_422_and_nothing_is_written(client, db, monkeypatch):
    owner, _, review = _setup(db)
    _calls(monkeypatch, "REJECTED")
    r = _reply(client, owner, review)
    assert r.status_code == 422, r.text
    assert r.json()["detail"] == (
        "תוכן התגובה אינו עומד בהנחיות הקהילה שלנו. אפשר לנסח מחדש ולשלוח שוב."
    )
    db.refresh(review)
    assert review.reply is None
    assert review.reply_ai_moderation_status is None


def test_rejected_edit_keeps_the_previous_reply(client, db, monkeypatch):
    owner, _, review = _setup(db)
    _calls(monkeypatch, "APPROVED")
    assert _reply(client, owner, review).status_code == 200
    _calls(monkeypatch, "REJECTED")
    assert _reply(client, owner, review, REPLY + " ועוד").status_code == 422
    db.refresh(review)
    assert review.reply == REPLY
    assert review.reply_ai_moderation_status == "APPROVED"


@pytest.mark.parametrize("verdict", ["APPROVED", "FLAGGED", None])
def test_reply_publishes_and_records_verdict(client, db, monkeypatch, verdict):
    # FLAGGED informs the admin; None is the fail-open — both still publish.
    owner, _, review = _setup(db)
    _calls(monkeypatch, verdict)
    r = _reply(client, owner, review)
    assert r.status_code == 200, r.text
    assert r.json()["reply"] == REPLY
    db.refresh(review)
    assert review.reply_ai_moderation_status == verdict
    public = client.get(f"/producers/{review.producer_id}/reviews").json()
    assert public["reviews"][0]["reply"] == REPLY
    assert "reply_ai_moderation_status" not in public["reviews"][0]


def test_unchanged_reply_keeps_its_flag_without_a_new_check(client, db, monkeypatch):
    owner, _, review = _setup(db)
    _calls(monkeypatch, "FLAGGED")
    _reply(client, owner, review)
    seen = _calls(monkeypatch, "APPROVED")
    assert _reply(client, owner, review).status_code == 200
    assert seen == []  # not asked again
    db.refresh(review)
    assert review.reply_ai_moderation_status == "FLAGGED"


def test_changed_reply_is_checked_again(client, db, monkeypatch):
    owner, _, review = _setup(db)
    _calls(monkeypatch, "FLAGGED")
    _reply(client, owner, review)
    seen = _calls(monkeypatch, "APPROVED")
    _reply(client, owner, review, REPLY + " נשמח לראות אותך שוב")
    assert seen == [REPLY + " נשמח לראות אותך שוב"]
    db.refresh(review)
    assert review.reply_ai_moderation_status == "APPROVED"


def test_clearing_the_reply_skips_the_check(client, db, monkeypatch):
    owner, _, review = _setup(db)
    _calls(monkeypatch, "FLAGGED")
    _reply(client, owner, review)
    seen = _calls(monkeypatch, "REJECTED")
    assert _reply(client, owner, review, "").status_code == 200
    assert seen == []
    db.refresh(review)
    assert review.reply is None
    assert review.reply_ai_moderation_status is None


def test_admin_list_carries_reply_and_verdict(client, db, monkeypatch):
    owner, admin, review = _setup(db)
    _calls(monkeypatch, "FLAGGED")
    _reply(client, owner, review)
    rows = client.get("/admin/reviews", headers=auth_header(admin)).json()
    row = next(x for x in rows if x["id"] == str(review.id))
    assert row["reply"] == REPLY
    assert row["reply_at"]
    assert row["reply_ai_moderation_status"] == "FLAGGED"


def test_admin_clear_reply_removes_it(client, db, monkeypatch):
    owner, admin, review = _setup(db)
    _calls(monkeypatch, "FLAGGED")
    _reply(client, owner, review)
    r = client.put(
        f"/admin/reviews/{review.id}/clear-reply", headers=auth_header(admin)
    )
    assert r.status_code == 200, r.text
    db.refresh(review)
    assert review.reply is None
    assert review.reply_at is None
    assert review.reply_ai_moderation_status is None
    assert review.body == "היה טעים מאוד"  # the review itself is untouched
    assert review.is_hidden is False
    public = client.get(f"/producers/{review.producer_id}/reviews").json()
    assert public["reviews"][0]["reply"] is None


def test_clear_reply_is_admin_only(client, db, monkeypatch):
    owner, _, review = _setup(db)
    r = client.put(
        f"/admin/reviews/{review.id}/clear-reply", headers=auth_header(owner)
    )
    assert r.status_code == 403
    assert client.put(f"/admin/reviews/{review.id}/clear-reply").status_code == 401


def test_clear_reply_unknown_review_is_404(client, db):
    _, admin, _ = _setup(db)
    r = client.put(
        "/admin/reviews/00000000-0000-0000-0000-000000000000/clear-reply",
        headers=auth_header(admin),
    )
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "review_not_found"


def test_reply_prompt_names_the_reply_not_a_review():
    who, task, rules = reviews_mod._MODERATION_SUBJECTS["review_reply"]
    assert "בעלת בית עסק" in task
    assert "ללקוחה" in rules
    # The business's own contact details are not "advertising" in a reply;
    # the reviewer's personal details still are.
    assert "פרטי הקשר שלו עצמו" in rules
    assert "פרטים אישיים של הלקוחה" in rules
    assert "פרסומת" not in rules.split("REJECTED")[1]
