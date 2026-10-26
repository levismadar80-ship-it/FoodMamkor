"""MEH-2349 — the AI's FLAGGED verdict on a review is recorded and shown.

Before: `_moderate_review_body` returned FLAGGED and the router dropped it —
a FLAGGED review published exactly like an APPROVED one and the admin list
carried no trace of it. Now the verdict lands on
``producer_reviews.ai_moderation_status`` and GET /admin/reviews returns it.

Fail-open stays APPROVED (the LOCK); its signal is the Sentry report from
MEH-2352, not this column. NULL = never checked: every row that predates the
column (the body is required by ReviewCreateNested, so the API itself always
checks).
"""

import pytest
from sqlalchemy.exc import IntegrityError

from conftest import auth_header, make_producer, make_user
from app.models.models import ProducerReview, ProducerWhatsAppClick
from app.routers import reviews as reviews_mod

BODY = "המוצרים מדהימים ואוהבת את השירות!"


def _setup(db, email="r@example.com"):
    author = make_user(db, email=email)
    producer = make_producer(db)
    db.add(ProducerWhatsAppClick(producer_id=producer.id, user_id=author.id))
    db.commit()
    return author, producer


def _verdict(monkeypatch, value):
    monkeypatch.setattr(reviews_mod, "_moderate_review_body", lambda body: value)


def _post(client, author, producer, body=BODY, stars=4):
    return client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": stars, "body": body},
        headers=auth_header(author),
    )


@pytest.mark.parametrize("verdict", ["APPROVED", "FLAGGED"])
def test_create_records_ai_verdict(client, db, monkeypatch, verdict):
    author, producer = _setup(db)
    _verdict(monkeypatch, verdict)
    r = _post(client, author, producer)
    assert r.status_code == 201, r.text
    row = db.query(ProducerReview).filter_by(user_id=author.id).one()
    assert row.ai_moderation_status == verdict


def test_flagged_review_still_publishes(client, db, monkeypatch):
    # The flag informs the admin; it does not hide (MEH-2349 option א).
    author, producer = _setup(db)
    _verdict(monkeypatch, "FLAGGED")
    _post(client, author, producer)
    public = client.get(f"/producers/{producer.id}/reviews").json()
    assert len(public["reviews"]) == 1
    assert "ai_moderation_status" not in public["reviews"][0]


def test_edit_overwrites_verdict(client, db, monkeypatch):
    author, producer = _setup(db)
    _verdict(monkeypatch, "FLAGGED")
    _post(client, author, producer)
    _verdict(monkeypatch, "APPROVED")
    _post(client, author, producer, body=BODY + " עריכה")
    row = db.query(ProducerReview).filter_by(user_id=author.id).one()
    assert row.ai_moderation_status == "APPROVED"
    # …and back: the column follows the latest body, it is not sticky.
    _verdict(monkeypatch, "FLAGGED")
    _post(client, author, producer, body=BODY + " שוב")
    db.refresh(row)
    assert row.ai_moderation_status == "FLAGGED"


def test_fail_open_records_approved(client, db, monkeypatch):
    # No AI client → the real moderator fails open → APPROVED on the row.
    author, producer = _setup(db)
    monkeypatch.setattr(reviews_mod, "_get_ai_client", lambda: None)
    _post(client, author, producer)
    row = db.query(ProducerReview).filter_by(user_id=author.id).one()
    assert row.ai_moderation_status == "APPROVED"


def test_admin_list_returns_verdict(client, db, monkeypatch):
    author, producer = _setup(db)
    _verdict(monkeypatch, "FLAGGED")
    _post(client, author, producer)
    # A row that predates the column: never checked → NULL.
    plain = make_user(db, email="plain@example.com")
    db.add(ProducerReview(producer_id=producer.id, user_id=plain.id, stars=5))
    db.commit()
    admin = make_user(db, role="admin", email="adm@example.com")
    rows = client.get("/admin/reviews", headers=auth_header(admin)).json()
    by_user = {r["user_id"]: r for r in rows}
    assert by_user[str(author.id)]["ai_moderation_status"] == "FLAGGED"
    assert by_user[str(plain.id)]["ai_moderation_status"] is None


def test_db_check_rejects_unknown_value(db):
    author, producer = _setup(db)
    db.add(
        ProducerReview(
            producer_id=producer.id,
            user_id=author.id,
            stars=3,
            ai_moderation_status="REJECTED",  # never stored: REJECTED → 422
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_race_branch_writes_verdict_to_the_winning_row(client, db, monkeypatch):
    # A second request inserts the (producer, user) row between this
    # request's existence check and its INSERT — the unique-pair race the
    # IntegrityError branch exists for. The verdict must land on that row.
    from app.database import SessionLocal

    author, producer = _setup(db)

    def _race_then_flag(body):
        other = SessionLocal()
        other.add(
            ProducerReview(
                producer_id=producer.id, user_id=author.id, stars=1, body="x" * 12
            )
        )
        other.commit()
        other.close()
        return "FLAGGED"

    monkeypatch.setattr(reviews_mod, "_checked_ai_status", _race_then_flag)
    r = _post(client, author, producer)
    assert r.status_code == 201, r.text
    row = db.query(ProducerReview).filter_by(user_id=author.id).one()
    assert (row.stars, row.body, row.ai_moderation_status) == (4, BODY, "FLAGGED")


def test_race_branch_reraises_an_unrelated_integrity_error(client, db, monkeypatch):
    # An IntegrityError with no racing row (here: the CHECK on the column)
    # is not the race — it must propagate, not crash on `None.stars`.
    author, producer = _setup(db)
    monkeypatch.setattr(reviews_mod, "_checked_ai_status", lambda body: "BOGUS")
    with pytest.raises(IntegrityError):
        _post(client, author, producer)
