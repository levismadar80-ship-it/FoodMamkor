"""MEH-3300 (D13) — newsletter signup is double opt-in.

POST /newsletter no longer adds anyone: it mails a confirmation link (a signed
token with its own scope, 48 h expiry). The row, the Resend sync and the
welcome email happen only on POST /newsletter/confirm, which the confirm page
sends from a button click. Existing subscribers are grandfathered: a repeat
signup sends nothing (and still back-fills Resend, MEH-2611).
"""

from datetime import datetime, timedelta, timezone

import pytest
from joserfc import jwt as jose_jwt

from app.config import settings
from app.models import NewsletterSubscriber
from app.routers import marketing
from app.routers.marketing import (
    create_confirm_token,
    create_unsubscribe_token,
    decode_confirm_token,
)

CONFIRM_SENT = "שלחנו מייל לאישור. ההרשמה תושלם אחרי לחיצה על הקישור שבו."  # string 8
CONFIRMED = "ההרשמה אושרה. נכתוב כשיש משהו ששווה לספר."  # string 12


@pytest.fixture
def mail(monkeypatch):
    sent = []
    syncs = []
    monkeypatch.setattr(
        marketing,
        "send_email",
        lambda to, subject, *a, **k: sent.append((to, subject, a, k)),
    )
    monkeypatch.setattr(
        marketing,
        "sync_subscribe",
        lambda e, resubscribe=False: syncs.append((e, resubscribe)),
    )
    monkeypatch.setattr(marketing, "sync_unsubscribe", lambda e: None)
    return {"sent": sent, "syncs": syncs}


def _count(db, email):
    return db.query(NewsletterSubscriber).filter_by(email=email).count()


class TestSignupSendsConfirmationOnly:
    def test_new_signup_mails_a_confirm_link_and_writes_nothing(self, client, db, mail):
        r = client.post("/newsletter", json={"email": "New.Reader@Gmail.com"})
        assert r.status_code == 201, r.text
        assert r.json()["detail"] == CONFIRM_SENT
        assert _count(db, "new.reader@gmail.com") == 0
        assert mail["syncs"] == []
        assert len(mail["sent"]) == 1
        to, subject, args, kwargs = mail["sent"][0]
        assert to == "new.reader@gmail.com"
        assert subject == "אישור הרשמה לעדכונים ממהמקור"  # string 9
        plain = args[0]
        assert "הקישור תקף ל-48 שעות" in plain  # string 10
        assert "/newsletter/confirm?token=" in plain
        assert "אישור הרשמה" in kwargs["html"]  # string 11 (button)

    def test_existing_subscriber_gets_no_email_and_same_answer(self, client, db, mail):
        db.add(NewsletterSubscriber(email="old@gmail.com"))
        db.commit()
        r = client.post("/newsletter", json={"email": "old@gmail.com"})
        assert r.status_code == 201
        assert r.json()["detail"] == CONFIRM_SENT  # no enumeration
        assert mail["sent"] == []
        assert mail["syncs"] == [("old@gmail.com", False)]  # back-fill, opt-out kept

    def test_per_email_limit_holds_across_ips(self, client, mail, monkeypatch):
        # Real distinct callers (TRUSTED_PROXY on, X-Real-IP varies), so only
        # the per-address bucket can refuse the 4th — the per-IP one never fills.
        monkeypatch.setenv("TRUSTED_PROXY", "1")
        codes = [
            client.post(
                "/newsletter",
                json={"email": "flood@gmail.com"},
                headers={"X-Real-IP": f"10.0.0.{i}"},
            ).status_code
            for i in range(5)
        ]
        assert codes == [201, 201, 201, 429, 429]
        assert len(mail["sent"]) == 3

    def test_the_mailed_link_confirms(self, client, db, mail):
        client.post("/newsletter", json={"email": "link@gmail.com"})
        plain = mail["sent"][0][2][0]
        prefix = f"{settings.frontend_url}/newsletter/confirm?token="
        assert prefix in plain
        token = plain.split(prefix, 1)[1].split()[0]
        r = client.post("/newsletter/confirm", json={"token": token})
        assert r.status_code == 200, r.text
        assert _count(db, "link@gmail.com") == 1


class TestConfirm:
    def test_confirm_adds_syncs_and_welcomes(self, client, db, mail):
        token = create_confirm_token("reader@gmail.com")
        r = client.post("/newsletter/confirm", json={"token": token})
        assert r.status_code == 200, r.text
        assert r.json()["detail"] == CONFIRMED
        assert _count(db, "reader@gmail.com") == 1
        assert mail["syncs"] == [("reader@gmail.com", True)]  # consent clears opt-out
        assert [s[0] for s in mail["sent"]] == ["reader@gmail.com"]  # welcome

    def test_second_confirm_is_idempotent_without_second_welcome(
        self, client, db, mail
    ):
        token = create_confirm_token("twice@gmail.com")
        assert (
            client.post("/newsletter/confirm", json={"token": token}).status_code == 200
        )
        assert (
            client.post("/newsletter/confirm", json={"token": token}).status_code == 200
        )
        assert _count(db, "twice@gmail.com") == 1
        assert len(mail["sent"]) == 1

    def test_confirm_token_expires_after_48h(self, monkeypatch):
        token = create_confirm_token("late@gmail.com")
        assert decode_confirm_token(token) == "late@gmail.com"
        start = datetime.now(timezone.utc)
        monkeypatch.setattr(
            marketing, "_utcnow", lambda: start + timedelta(hours=47, minutes=59)
        )
        assert decode_confirm_token(token) == "late@gmail.com"  # not too short
        monkeypatch.setattr(
            marketing, "_utcnow", lambda: start + timedelta(hours=48, minutes=1)
        )
        assert decode_confirm_token(token) is None  # not too long

    def test_expired_token_is_400_and_adds_nothing(self, client, db, mail, monkeypatch):
        token = create_confirm_token("late@gmail.com")
        later = datetime.now(timezone.utc) + timedelta(hours=49)
        monkeypatch.setattr(marketing, "_utcnow", lambda: later)
        r = client.post("/newsletter/confirm", json={"token": token})
        assert r.status_code == 400
        assert _count(db, "late@gmail.com") == 0
        assert mail["syncs"] == []

    def test_unsubscribe_token_cannot_confirm(self, client, db, mail):
        r = client.post(
            "/newsletter/confirm",
            json={"token": create_unsubscribe_token("x@gmail.com")},
        )
        assert r.status_code == 400
        assert _count(db, "x@gmail.com") == 0

    def test_confirm_token_cannot_unsubscribe(self, client, db, mail):
        db.add(NewsletterSubscriber(email="stay@gmail.com"))
        db.commit()
        r = client.post(
            "/newsletter/unsubscribe",
            json={"token": create_confirm_token("stay@gmail.com")},
        )
        assert r.status_code == 400
        assert _count(db, "stay@gmail.com") == 1

    def test_token_without_exp_is_refused(self, client, db, mail):
        key = marketing._unsubscribe_key()
        token = jose_jwt.encode(
            {"alg": settings.algorithm},
            {"sub": "noexp@gmail.com", "scope": "newsletter_confirm"},
            key,
        )
        r = client.post("/newsletter/confirm", json={"token": token})
        assert r.status_code == 400
        assert _count(db, "noexp@gmail.com") == 0

    def test_wrong_scope_with_valid_exp_is_refused(self, client, db, mail):
        # Isolates the scope check: this token passes the exp check, so only
        # the scope can refuse it (an unsubscribe token alone has no exp).
        exp = int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp())
        token = jose_jwt.encode(
            {"alg": settings.algorithm},
            {"sub": "scope@gmail.com", "scope": "newsletter_unsubscribe", "exp": exp},
            marketing._unsubscribe_key(),
        )
        r = client.post("/newsletter/confirm", json={"token": token})
        assert r.status_code == 400
        assert _count(db, "scope@gmail.com") == 0

    def test_get_does_not_confirm(self, client, db, mail):
        token = create_confirm_token("prefetch@gmail.com")
        r = client.get(f"/newsletter/confirm?token={token}")
        assert r.status_code == 405  # the API has no GET; the page posts on click
        assert _count(db, "prefetch@gmail.com") == 0

    def test_lost_insert_race_is_200_without_a_second_welcome(
        self, client, db, mail, monkeypatch
    ):
        from sqlalchemy.exc import IntegrityError
        from sqlalchemy.orm import Session

        real_commit = Session.commit
        state = {"raised": False}

        def racing_commit(self):
            if not state["raised"]:
                state["raised"] = True
                raise IntegrityError("insert", {}, Exception("duplicate"))
            return real_commit(self)

        monkeypatch.setattr(Session, "commit", racing_commit)
        token = create_confirm_token("race@gmail.com")
        r = client.post("/newsletter/confirm", json={"token": token})
        assert r.status_code == 200, r.text
        assert state["raised"]
        assert mail["sent"] == []  # the winner sent the welcome, not us
