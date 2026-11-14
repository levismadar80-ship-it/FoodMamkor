"""MEH-3122 — «שלחו לי קישור חדש» on a claim link that no longer works.

Sapir's decision (14/11): the admin is told and sends the new link herself.
So the route must (a) tell the admin for a real, lapsed link of a draft that
can still be claimed, (b) tell nobody for anything else, (c) answer the same
either way, and (d) never mint or return a link.

Each case is named for the input it covers. The recorder replaces the
notifier the ROUTE imports, so a case that expects a call fails if the route
stops calling it, and a case that expects none fails if a guard is removed.
"""

from datetime import datetime, timedelta, timezone

import pytest
from joserfc import jwt as jose_jwt

from conftest import auth_header, make_producer, make_user
from app.auth import (
    PRODUCER_CLAIM_RENEW_GRACE_DAYS,
    PRODUCER_CLAIM_SCOPE,
    _jwt_key,
    create_access_token,
    create_producer_claim_token,
    create_refresh_token,
    create_review_invite_token,
    decode_lapsed_producer_claim_token,
    decode_producer_claim_token,
)
from app.config import settings
from app.models import User
from app.routers import producer_claim

URL = "/producer-claim/new-link-request"
PREVIEW = "/producer-claim/preview"
CLAIM = "/producer-claim"
EXPECTED_BODY = {"ok": True}


def _mint(producer_id, *, exp_delta, scope=PRODUCER_CLAIM_SCOPE, key=None, exp=None):
    """`exp`: None = now + exp_delta, False = no exp claim, else the raw value."""
    now = datetime.now(timezone.utc)
    payload = {"producer_id": str(producer_id), "iat": int(now.timestamp()), "scope": scope}
    if exp is None:
        payload["exp"] = now + exp_delta
    elif exp is not False:
        payload["exp"] = exp
    return jose_jwt.encode({"alg": settings.algorithm}, payload, key or _jwt_key())


def _expired(producer, days=1):
    return _mint(producer.id, exp_delta=timedelta(days=-days))


@pytest.fixture
def notices(monkeypatch):
    calls = []
    monkeypatch.setattr(
        producer_claim,
        "notify_admin_claim_link_requested",
        lambda name, city, test_cause=False: calls.append((name, city, test_cause)),
    )
    producer_claim._new_link_last_notice.clear()
    yield calls
    producer_claim._new_link_last_notice.clear()


def _draft(db, **kw):
    return make_producer(db, status="draft", **kw)


def _post(client, token):
    return client.post(URL, json={"token": token})


class TestDecodeLapsed:
    def test_expired_yesterday_is_accepted_here_and_refused_by_the_claim_decoder(self, db):
        p = _draft(db)
        token = _expired(p)
        assert decode_lapsed_producer_claim_token(token) == p.id
        assert decode_producer_claim_token(token) is None

    def test_still_valid_token_is_accepted(self, db):
        p = _draft(db)
        assert decode_lapsed_producer_claim_token(create_producer_claim_token(p.id)[0]) == p.id

    def test_expired_past_the_grace_window_is_refused(self, db):
        p = _draft(db)
        assert decode_lapsed_producer_claim_token(
            _expired(p, days=PRODUCER_CLAIM_RENEW_GRACE_DAYS + 1)
        ) is None

    def test_expired_just_inside_the_grace_window_is_accepted(self, db):
        p = _draft(db)
        assert decode_lapsed_producer_claim_token(
            _expired(p, days=PRODUCER_CLAIM_RENEW_GRACE_DAYS - 1)
        ) == p.id

    def test_wrong_signing_key_is_refused(self, db):
        from joserfc.jwk import OctKey

        p = _draft(db)
        forged = _mint(
            p.id, exp_delta=timedelta(days=-1), key=OctKey.import_key("x" * 48)
        )
        assert decode_lapsed_producer_claim_token(forged) is None

    def test_review_invite_token_is_refused(self, db):
        p = _draft(db)
        assert decode_lapsed_producer_claim_token(create_review_invite_token(p.id)) is None

    def test_token_without_exp_is_refused(self, db):
        p = _draft(db)
        assert decode_lapsed_producer_claim_token(
            _mint(p.id, exp_delta=timedelta(0), exp=False)
        ) is None

    def test_string_exp_is_refused(self, db):
        p = _draft(db)
        stamp = str(int((datetime.now(timezone.utc) - timedelta(days=1)).timestamp()))
        assert decode_lapsed_producer_claim_token(
            _mint(p.id, exp_delta=timedelta(0), exp=stamp)
        ) is None

    def test_access_token_is_refused(self, db):
        user = make_user(db)
        assert decode_lapsed_producer_claim_token(create_access_token(user.id)) is None

    def test_refresh_token_is_refused(self, db):
        user = make_user(db)
        assert decode_lapsed_producer_claim_token(create_refresh_token(user.id, 0)) is None

    def test_garbage_is_refused(self):
        assert decode_lapsed_producer_claim_token("nope") is None

    def test_malformed_producer_id_is_refused(self):
        assert decode_lapsed_producer_claim_token(
            _mint("not-a-uuid", exp_delta=timedelta(days=-1))
        ) is None


class TestNewLinkRequest:
    def test_expired_link_of_a_claimable_draft_tells_the_admin_once(self, client, db, notices):
        p = _draft(db, name="מאפיית הבוקר", city="חדרה")
        r = _post(client, _expired(p))
        assert r.status_code == 200
        assert r.json() == EXPECTED_BODY
        assert notices == [("מאפיית הבוקר", "חדרה", False)]

    def test_second_request_for_the_same_draft_within_a_day_tells_nobody(self, client, db, notices):
        p = _draft(db)
        _post(client, _expired(p))
        r = _post(client, _expired(p, days=2))
        assert r.status_code == 200 and r.json() == EXPECTED_BODY
        assert len(notices) == 1

    def test_a_different_draft_is_not_held_back_by_the_first_ones_cooldown(self, client, db, notices):
        _post(client, _expired(_draft(db)))
        _post(client, _expired(_draft(db)))
        assert len(notices) == 2

    def test_the_cooldown_ends_after_a_day(self, client, db, notices):
        p = _draft(db)
        _post(client, _expired(p))
        producer_claim._new_link_last_notice[p.id] -= producer_claim._NEW_LINK_COOLDOWN_SECONDS + 1
        _post(client, _expired(p))
        assert len(notices) == 2

    def test_forged_signature_tells_nobody_and_answers_the_same(self, client, db, notices):
        from joserfc.jwk import OctKey

        p = _draft(db)
        r = _post(client, _mint(p.id, exp_delta=timedelta(days=-1), key=OctKey.import_key("x" * 48)))
        assert r.status_code == 200 and r.json() == EXPECTED_BODY
        assert notices == []

    def test_garbage_token_tells_nobody_and_answers_the_same(self, client, db, notices):
        r = _post(client, "nope")
        assert r.status_code == 200 and r.json() == EXPECTED_BODY
        assert notices == []

    def test_draft_that_already_has_an_owner_tells_nobody(self, client, db, notices):
        p = _draft(db)
        owner = make_user(db, role="producer")
        owner.producer_id = p.id
        db.commit()
        r = _post(client, _expired(p))
        assert r.status_code == 200 and r.json() == EXPECTED_BODY
        assert notices == []

    def test_approved_listing_tells_nobody(self, client, db, notices):
        p = make_producer(db, status="approved")
        r = _post(client, _expired(p))
        assert r.status_code == 200 and r.json() == EXPECTED_BODY
        assert notices == []

    def test_deleted_draft_tells_nobody(self, client, db, notices):
        p = _draft(db)
        token = _expired(p)
        db.delete(p)
        db.commit()
        r = _post(client, token)
        assert r.status_code == 200 and r.json() == EXPECTED_BODY
        assert notices == []

    def test_link_expired_past_the_grace_window_tells_nobody(self, client, db, notices):
        p = _draft(db)
        r = _post(client, _expired(p, days=PRODUCER_CLAIM_RENEW_GRACE_DAYS + 1))
        assert r.status_code == 200 and r.json() == EXPECTED_BODY
        assert notices == []

    def test_test_marked_draft_passes_the_test_cause_flag(self, client, db, notices):
        p = _draft(db)
        p.is_test = True
        db.commit()
        _post(client, _expired(p))
        assert [c[2] for c in notices] == [True]

    def test_empty_token_is_a_422_not_a_notice(self, client, db, notices):
        assert client.post(URL, json={"token": ""}).status_code == 422
        assert notices == []

    def test_the_response_never_carries_a_link_or_the_business(self, client, db, notices):
        p = _draft(db, name="שם סודי")
        text = _post(client, _expired(p)).text
        assert "claim/" not in text and "שם סודי" not in text and str(p.id) not in text

    def test_asking_does_not_revive_the_expired_link(self, client, db, notices):
        """The request must not make the dead link usable: preview stays 404
        and a SIGNED-IN claim with it is refused exactly as before."""
        p = _draft(db)
        token = _expired(p)
        user = make_user(db, email="asker3122@example.com")
        _post(client, token)
        assert len(notices) == 1
        assert client.post(PREVIEW, json={"token": token}).status_code == 404
        r = client.post(
            CLAIM,
            json={"token": token, "declaration_accepted": True, "terms_accepted": True},
            headers=auth_header(user),
        )
        assert r.status_code == 404, r.text
        db.expire_all()
        assert db.get(User, user.id).producer_id is None
        assert db.get(type(p), p.id).status == "draft"

    def test_still_valid_link_also_tells_the_admin(self, client, db, notices):
        """Documented behaviour: the page offers the button only after a
        refusal, and a notice for a live link costs one message."""
        p = _draft(db)
        r = _post(client, create_producer_claim_token(p.id)[0])
        assert r.status_code == 200 and r.json() == EXPECTED_BODY
        assert len(notices) == 1

    def test_access_token_as_input_tells_nobody(self, client, db, notices):
        user = make_user(db)
        r = _post(client, create_access_token(user.id))
        assert r.status_code == 200 and r.json() == EXPECTED_BODY
        assert notices == []


class TestNotifierMessage:
    def test_message_names_the_business_and_holds_no_link_to_claim(self, monkeypatch):
        from app.services import auth_notifications as n

        sent = []
        monkeypatch.setattr(n.settings, "admin_email", "admin@example.com")
        monkeypatch.setattr(n.settings, "admin_whatsapp_to", "")
        monkeypatch.setattr(
            n, "send_email", lambda to, subject, body, test_cause=False: sent.append((to, subject, body))
        )
        n.notify_admin_claim_link_requested("מאפיית\nהבוקר", "חדרה")
        assert len(sent) == 1
        to, subject, body = sent[0]
        assert to == "admin@example.com"
        assert "מאפיית הבוקר" in subject and "\n" not in subject
        assert "חדרה" in body and "/admin/producers" in body
        assert "/claim/" not in body

    def test_test_cause_sends_nothing(self, monkeypatch):
        from app.services import auth_notifications as n

        sent = []
        monkeypatch.setattr(n, "send_email", lambda *a, **k: sent.append(a))
        monkeypatch.setattr(n, "send_text", lambda *a, **k: sent.append(a))
        n.notify_admin_claim_link_requested("x", "y", test_cause=True)
        assert sent == []
