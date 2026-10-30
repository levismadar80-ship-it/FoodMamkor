"""MEH-2602 — the risk score is taken again when the owner submits.

The only score used to be taken at registration, before contact_email and
the description existed, so the admin reviewing the finished profile read a
reasoning that said there was no email (staging sweep 29/10)."""

from conftest import auth_header, make_submit_ready_producer


def test_submit_for_review_rescores_the_producer(client, db, monkeypatch):
    calls: list = []
    monkeypatch.setattr("app.routers.producer_me.score_producer", calls.append)
    monkeypatch.setattr(
        "app.routers.producer_me.send_submission_confirmation", lambda *a: None
    )
    producer, user = make_submit_ready_producer(db)

    resp = client.post("/producers/me/submit-for-review", headers=auth_header(user))

    assert resp.status_code == 200, resp.text
    assert calls == [producer.id]


def test_a_rejected_submit_does_not_rescore(client, db, monkeypatch):
    calls: list = []
    monkeypatch.setattr("app.routers.producer_me.score_producer", calls.append)
    producer, user = make_submit_ready_producer(db, status="pending")

    resp = client.post("/producers/me/submit-for-review", headers=auth_header(user))

    assert resp.status_code == 409, resp.text
    assert calls == []
