"""MEH-3302 (D14 part ב): WhatsApp alerts go only to a phone the user verified.

Decision (e), 14/11: the code is bound to the canonical phone; 5 wrong
guesses kill it; 3 sends per user per day and 3 per phone per day; no code
to a number whose latest message to us was «הסר». fire_alerts stops sending
to unverified numbers but keeps the opt-in flag, so verifying resumes alerts.
A phone change clears verification and expires pending codes; «הסר» clears
consent.
"""

from datetime import timedelta

import pytest

from app.models import (
    Favorite,
    FavoriteAlert,
    InboundMessage,
    UserPhoneOtpToken,
)
from app.routers import producer_me_review
from app.routers.alerts import fire_alerts
from app.schemas.schemas import AlertContent
from app.utils.clock import utc_now
from conftest import auth_header, make_producer, make_user, verify_phone

PHONE = "0501234567"
CANON = "972501234567"


@pytest.fixture
def sent(monkeypatch):
    calls = []
    monkeypatch.setattr(
        producer_me_review,
        "_send_whatsapp_otp",
        lambda phone, code, test_cause=False: calls.append((phone, code)) or True,
    )
    return calls


def _user(db, phone=PHONE, email=None):
    u = make_user(db, email=email)
    u.phone = phone
    db.commit()
    return u


def _code(db, user):
    tok = (
        db.query(UserPhoneOtpToken)
        .filter_by(user_id=user.id, used=False)
        .order_by(UserPhoneOtpToken.created_at.desc())
        .first()
    )
    return tok


class TestSendAndConfirm:
    def test_send_then_confirm_verifies_and_records_consent(self, client, db, sent):
        u = _user(db)
        r = client.post("/users/me/verify-phone", headers=auth_header(u))
        assert r.status_code == 200, r.text
        assert len(sent) == 1
        tok = _code(db, u)
        assert tok.phone == CANON  # bound to the canonical number
        r = client.post(
            "/users/me/verify-phone/confirm",
            json={"code": tok.code},
            headers=auth_header(u),
        )
        assert r.status_code == 200, r.text
        db.refresh(u)
        assert u.phone_verified_at is not None
        assert u.whatsapp_consent_at is not None
        me = client.get("/auth/me", headers=auth_header(u)).json()
        assert me["phone_verified"] is True

    def test_no_phone_is_400(self, client, db, sent):
        u = make_user(db)
        assert (
            client.post("/users/me/verify-phone", headers=auth_header(u)).status_code
            == 400
        )
        assert sent == []

    def test_code_must_be_six_digits(self, client, db, sent):
        u = _user(db)
        r = client.post(
            "/users/me/verify-phone/confirm",
            json={"code": "12ab56"},
            headers=auth_header(u),
        )
        assert r.status_code == 422

    def test_fifth_wrong_guess_kills_the_token(self, client, db, sent, monkeypatch):
        from app.rate_limit import limiter

        monkeypatch.setattr(limiter, "enabled", False)
        u = _user(db)
        client.post("/users/me/verify-phone", headers=auth_header(u))
        tok = _code(db, u)
        wrong = "000000" if tok.code != "000000" else "111111"
        for _ in range(5):
            r = client.post(
                "/users/me/verify-phone/confirm",
                json={"code": wrong},
                headers=auth_header(u),
            )
            assert r.status_code == 400
        db.refresh(tok)
        assert tok.used is True and tok.attempts == 5
        r = client.post(
            "/users/me/verify-phone/confirm",
            json={"code": tok.code},
            headers=auth_header(u),
        )
        assert r.status_code == 400  # the right code no longer works
        db.refresh(u)
        assert u.phone_verified_at is None

    def test_expired_code_is_refused(self, client, db, sent):
        u = _user(db)
        client.post("/users/me/verify-phone", headers=auth_header(u))
        tok = _code(db, u)
        tok.expires_at = utc_now() - timedelta(seconds=1)
        db.commit()
        r = client.post(
            "/users/me/verify-phone/confirm",
            json={"code": tok.code},
            headers=auth_header(u),
        )
        assert r.status_code == 400


class TestCaps:
    def _seed_tokens(self, db, user_id, phone, n):
        for _ in range(n):
            db.add(
                UserPhoneOtpToken(
                    user_id=user_id,
                    phone=phone,
                    code="123456",
                    expires_at=utc_now(),
                    used=True,
                )
            )
        db.commit()

    def test_three_sends_per_user_per_day(self, client, db, sent):
        u = _user(db)
        self._seed_tokens(db, u.id, CANON, 3)
        r = client.post("/users/me/verify-phone", headers=auth_header(u))
        assert r.status_code == 429
        assert sent == []

    def test_three_sends_per_phone_per_day_across_accounts(self, client, db, sent):
        others = [_user(db, email=f"o{i}@example.com") for i in range(3)]
        for o in others:
            self._seed_tokens(db, o.id, CANON, 1)
        u = _user(db, phone="050-123-4567", email="me@example.com")  # same number
        r = client.post("/users/me/verify-phone", headers=auth_header(u))
        assert r.status_code == 429
        assert sent == []

    def test_old_sends_do_not_count(self, client, db, sent):
        u = _user(db)
        self._seed_tokens(db, u.id, CANON, 3)
        db.query(UserPhoneOtpToken).filter_by(user_id=u.id).update(
            {"created_at": utc_now() - timedelta(days=1, minutes=1)}
        )
        db.commit()
        assert (
            client.post("/users/me/verify-phone", headers=auth_header(u)).status_code
            == 200
        )

    def test_no_code_to_a_number_that_said_remove(self, client, db, sent):
        u = _user(db)
        db.add(InboundMessage(from_phone=CANON, body="הסר"))
        db.commit()
        r = client.post("/users/me/verify-phone", headers=auth_header(u))
        assert r.status_code == 503
        assert sent == []

    def test_a_later_message_lifts_the_remove(self, client, db, sent):
        u = _user(db)
        db.add(
            InboundMessage(
                from_phone=CANON, body="הסר", received_at=utc_now() - timedelta(hours=2)
            )
        )
        db.add(InboundMessage(from_phone=CANON, body="שלום", received_at=utc_now()))
        db.commit()
        assert (
            client.post("/users/me/verify-phone", headers=auth_header(u)).status_code
            == 200
        )


class TestPhoneChange:
    def test_new_number_clears_verification_and_kills_codes(self, client, db, sent):
        u = _user(db)
        verify_phone(u)
        db.add(
            UserPhoneOtpToken(
                user_id=u.id,
                phone=CANON,
                code="123456",
                expires_at=utc_now() + timedelta(minutes=5),
            )
        )
        db.commit()
        r = client.patch(
            "/users/me", json={"phone": "0527654321"}, headers=auth_header(u)
        )
        assert r.status_code == 200, r.text
        db.refresh(u)
        assert u.phone_verified_at is None
        assert (
            db.query(UserPhoneOtpToken).filter_by(user_id=u.id, used=False).count() == 0
        )

    def test_same_number_reformatted_stays_verified(self, client, db, sent):
        u = _user(db)
        verify_phone(u)
        db.commit()
        r = client.patch(
            "/users/me", json={"phone": "050-123-4567"}, headers=auth_header(u)
        )
        assert r.status_code == 200, r.text
        db.refresh(u)
        assert u.phone_verified_at is not None


class TestFireAlertsGate:
    def _alert(self, db, user):
        producer = make_producer(db, name="משק הגדר")
        db.add(Favorite(user_id=user.id, producer_id=producer.id))
        db.add(
            FavoriteAlert(
                user_id=user.id,
                producer_id=producer.id,
                notify_new_product=True,
                whatsapp_opt_in=True,
            )
        )
        db.commit()
        return producer

    @pytest.fixture
    def wa(self, monkeypatch):
        to = []
        monkeypatch.setattr(
            "app.routers.alerts.send_template",
            lambda phone, tmpl, test_cause=False: to.append(phone) or True,
        )
        monkeypatch.setattr(
            "app.services.push.send_push_notification", lambda *a, **k: None
        )
        return to

    def _fire(self, db, producer):
        fire_alerts(
            db,
            producer.id,
            "new_product",
            AlertContent(title="מוצר חדש", body="", url="/p/1"),
        )

    def test_unverified_phone_gets_no_whatsapp_and_keeps_opt_in(self, db, wa):
        u = _user(db)
        p = self._alert(db, u)
        self._fire(db, p)
        assert wa == []
        alert = db.query(FavoriteAlert).filter_by(user_id=u.id).one()
        assert alert.whatsapp_opt_in is True  # verifying resumes alerts

    def test_verified_with_consent_gets_whatsapp(self, db, wa):
        u = _user(db)
        verify_phone(u)
        db.commit()
        p = self._alert(db, u)
        self._fire(db, p)
        assert wa == [PHONE]

    def test_verified_without_consent_gets_none(self, db, wa):
        u = _user(db)
        verify_phone(u)
        u.whatsapp_consent_at = None
        db.commit()
        p = self._alert(db, u)
        self._fire(db, p)
        assert wa == []


def test_remove_reply_clears_consent(client, db, monkeypatch):
    from app.routers import whatsapp_webhook

    monkeypatch.setattr(whatsapp_webhook, "send_text", lambda *a, **k: True)
    u = _user(db)
    verify_phone(u)
    db.commit()
    whatsapp_webhook._maybe_process_optout(
        db, {"type": "text", "from": CANON, "text": {"body": "הסר"}}
    )
    db.refresh(u)
    assert u.whatsapp_consent_at is None
    assert u.phone_verified_at is not None  # the number is still hers


def test_purge_drops_user_codes_a_day_after_expiry(db):
    from app.services.retention_purge import run_purge

    u = _user(db)
    old = UserPhoneOtpToken(
        user_id=u.id,
        phone=CANON,
        code="123456",
        expires_at=utc_now() - timedelta(days=2),
    )
    fresh = UserPhoneOtpToken(
        user_id=u.id,
        phone=CANON,
        code="654321",
        expires_at=utc_now() - timedelta(hours=1),
    )
    db.add_all([old, fresh])
    db.commit()
    run_purge(db)
    left = {t.code for t in db.query(UserPhoneOtpToken).filter_by(user_id=u.id)}
    assert left == {"654321"}


def test_after_remove_a_new_code_restores_consent(client, db, sent):
    """Reviewer finding: «הסר» clears consent but keeps the phone verified.
    She must be able to say yes again with a new code, or she is locked out
    of WhatsApp alerts for good."""
    u = _user(db)
    verify_phone(u)
    u.whatsapp_consent_at = None  # what the «הסר» webhook leaves behind
    db.commit()
    me = client.get("/auth/me", headers=auth_header(u)).json()
    assert me["phone_verified"] is True
    assert me["whatsapp_ready"] is False
    r = client.post("/users/me/verify-phone", headers=auth_header(u))
    assert r.status_code == 200, r.text
    assert len(sent) == 1  # a code went out; not «already verified»
    r = client.post(
        "/users/me/verify-phone/confirm",
        json={"code": _code(db, u).code},
        headers=auth_header(u),
    )
    assert r.status_code == 200, r.text
    db.refresh(u)
    assert u.whatsapp_consent_at is not None
    assert client.get("/auth/me", headers=auth_header(u)).json()["whatsapp_ready"] is True


def test_capped_number_that_said_remove_answers_429_like_any_capped(client, db, sent):
    """The cap runs before the opt-out check, so the status does not reveal
    a «הסר» on a number that is also capped."""
    u = _user(db)
    db.add(InboundMessage(from_phone=CANON, body="הסר"))
    for _ in range(3):
        db.add(
            UserPhoneOtpToken(
                user_id=u.id,
                phone=CANON,
                code="000000",
                expires_at=utc_now() + timedelta(minutes=10),
                used=True,
            )
        )
    db.commit()
    r = client.post("/users/me/verify-phone", headers=auth_header(u))
    assert r.status_code == 429
    assert sent == []
