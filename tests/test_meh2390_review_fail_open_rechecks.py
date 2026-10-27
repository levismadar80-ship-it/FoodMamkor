"""MEH-2390 — a review that failed open is stored as unchecked and re-checked.

Before: a fail-open (no key, API error, unreadable reply) stored
``ai_moderation_status = "APPROVED"``. Re-saving the same body keeps the
stored verdict (MEH-2349), so that review was never checked again, even
after the model came back. Now a fail-open stores NULL ("no verdict"), and
the next save of the same body runs the model.

The fail-open LOCK is unchanged: the review publishes either way.
"""

import json

from conftest import auth_header, make_producer, make_user
from app.models.models import ProducerReview, ProducerWhatsAppClick
from app.routers import reviews as reviews_mod

BODY = "המוצרים מדהימים ואוהבת את השירות!"


class _Text:
    type = "text"

    def __init__(self, text):
        self.text = text


class _Msg:
    stop_reason = "end_turn"

    def __init__(self, status):
        self.content = [_Text(json.dumps({"status": status, "reason": "x"}))]


class _Client:
    def __init__(self, status):
        self.calls = 0
        self._status = status
        self.messages = self

    def create(self, **kwargs):
        self.calls += 1
        return _Msg(self._status)


def _setup(db):
    author = make_user(db, email="failopen@example.com")
    producer = make_producer(db)
    db.add(ProducerWhatsAppClick(producer_id=producer.id, user_id=author.id))
    db.commit()
    return author, producer


def _post(client, author, producer, body=BODY):
    return client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 4, "body": body},
        headers=auth_header(author),
    )


def test_fail_open_stores_null_and_still_publishes(client, db, monkeypatch):
    author, producer = _setup(db)
    monkeypatch.setattr(reviews_mod, "report_fail_open", lambda s, r: None)
    monkeypatch.setattr(reviews_mod, "_get_ai_client", lambda: None)

    r = _post(client, author, producer)

    assert r.status_code == 201, r.text
    row = db.query(ProducerReview).filter_by(user_id=author.id).one()
    assert row.ai_moderation_status is None
    public = client.get(f"/producers/{producer.id}/reviews").json()
    assert len(public["reviews"]) == 1


def test_resaving_after_fail_open_runs_the_model(client, db, monkeypatch):
    author, producer = _setup(db)
    monkeypatch.setattr(reviews_mod, "report_fail_open", lambda s, r: None)
    monkeypatch.setattr(reviews_mod, "_get_ai_client", lambda: None)
    _post(client, author, producer)

    model = _Client("FLAGGED")
    monkeypatch.setattr(reviews_mod, "_get_ai_client", lambda: model)
    r = _post(client, author, producer)  # same body

    assert r.status_code == 201, r.text
    assert model.calls == 1
    row = db.query(ProducerReview).filter_by(user_id=author.id).one()
    db.refresh(row)
    assert row.ai_moderation_status == "FLAGGED"


def test_resaving_a_real_verdict_still_skips_the_model(client, db, monkeypatch):
    # The MEH-2349 rule this sits next to: a stored verdict on an unchanged
    # body is kept, with no model call.
    author, producer = _setup(db)
    first = _Client("FLAGGED")
    monkeypatch.setattr(reviews_mod, "_get_ai_client", lambda: first)
    _post(client, author, producer)

    second = _Client("APPROVED")
    monkeypatch.setattr(reviews_mod, "_get_ai_client", lambda: second)
    _post(client, author, producer)

    assert second.calls == 0
    row = db.query(ProducerReview).filter_by(user_id=author.id).one()
    db.refresh(row)
    assert row.ai_moderation_status == "FLAGGED"
