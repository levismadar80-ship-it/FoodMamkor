"""MEH-1330 — newsletter one-click unsubscribe endpoint.

Covers the three states the acceptance criteria name: happy-path (valid
token removes the row), idempotent (clicking twice stays calm), and
bad-token (gentle 400, no stack trace). The token is stateless (signed
JWT, no DB column) so these exercise the real create/decode round-trip.
"""

from app.models import NewsletterSubscriber
from app.routers.marketing import create_unsubscribe_token


def _add_subscriber(db, email="reader@example.com"):
    sub = NewsletterSubscriber(email=email)
    db.add(sub)
    db.commit()
    return email


def _count(db, email):
    return (
        db.query(NewsletterSubscriber)
        .filter(NewsletterSubscriber.email == email)
        .count()
    )


class TestNewsletterUnsubscribe:
    def test_valid_token_removes_the_subscriber(self, client, db):
        email = _add_subscriber(db)
        assert _count(db, email) == 1
        token = create_unsubscribe_token(email)

        resp = client.post("/newsletter/unsubscribe", json={"token": token})

        assert resp.status_code == 200, resp.text
        assert _count(db, email) == 0

    def test_idempotent_second_click_stays_calm(self, client, db):
        email = _add_subscriber(db)
        token = create_unsubscribe_token(email)

        first = client.post("/newsletter/unsubscribe", json={"token": token})
        second = client.post("/newsletter/unsubscribe", json={"token": token})

        assert first.status_code == 200, first.text
        # Row already gone — still a calm 200, no error.
        assert second.status_code == 200, second.text
        assert _count(db, email) == 0

    def test_unknown_but_valid_token_is_still_200(self, client, db):
        # A correctly-signed token for an address that was never subscribed
        # (or already removed) reaches the same end-state: not subscribed.
        token = create_unsubscribe_token("never-subscribed@example.com")
        resp = client.post("/newsletter/unsubscribe", json={"token": token})
        assert resp.status_code == 200, resp.text

    def test_bad_token_returns_gentle_400(self, client, db):
        resp = client.post(
            "/newsletter/unsubscribe", json={"token": "not-a-real-token"}
        )
        assert resp.status_code == 400, resp.text
        assert "תקין" in resp.json()["detail"]

    def test_missing_token_is_422(self, client, db):
        resp = client.post("/newsletter/unsubscribe", json={})
        assert resp.status_code == 422, resp.text
