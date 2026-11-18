"""MEH-3295 — link tokens in app/auth.py, checked directly.

Found by mutation testing (scripts/mutation/run.sh, first run 15/11/2026):
123 of 451 mutants in auth.py were "no tests" — every one in the review-invite
and owner-claim link tokens. The endpoint tests that use these links live in
large router files, so nothing in the auth test set touched the token code
itself: flipping `!=` to `==` on the scope check, or `+` to `-` on the expiry,
passed the whole auth suite. Each test below kills a named class of those
mutants and says which.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from joserfc import jwt as jose_jwt
from joserfc.jwk import OctKey

from app import auth
from app.config import settings

PID = uuid4()
NOW = lambda: datetime.now(timezone.utc)  # noqa: E731


def _mint(payload, key=None, alg=None):
    return jose_jwt.encode(
        {"alg": alg or settings.algorithm}, payload, key or auth._jwt_key()
    )


def _claims(token):
    return jose_jwt.decode(
        token, auth._jwt_key(), algorithms=[settings.algorithm]
    ).claims


def _ts(dt):
    return int(dt.timestamp())


OTHER_KEY = OctKey.import_key(b"not-the-app-secret-not-the-app-secret-0123456789")


# ── review invite ──────────────────────────────────────────────────────────


def test_review_invite_carries_producer_scope_and_a_30_day_expiry():
    # kills: key renames (producer_id/exp/iat/scope), payload=None, `+`→`-`,
    # days=None, alg header mutations (decode would fail).
    before = NOW()
    claims = _claims(auth.create_review_invite_token(PID))
    assert claims["producer_id"] == str(PID)
    assert claims["scope"] == auth.REVIEW_INVITE_SCOPE == "review_invite"
    want = before + timedelta(days=30)
    assert abs(claims["exp"] - _ts(want)) <= 5
    assert abs(claims["iat"] - _ts(before)) <= 5


def test_review_invite_decodes_back():
    claims = auth.decode_review_invite_token(auth.create_review_invite_token(PID))
    assert claims is not None
    assert claims["producer_id"] == str(PID)


def test_review_invite_refuses_each_broken_shape():
    exp = _ts(NOW() + timedelta(days=1))
    good = {"producer_id": str(PID), "exp": exp, "scope": "review_invite"}
    assert auth.decode_review_invite_token(_mint(good)) is not None  # control
    cases = {
        "expired": {**good, "exp": _ts(NOW() - timedelta(seconds=60))},
        "no exp": {k: v for k, v in good.items() if k != "exp"},
        "wrong scope": {**good, "scope": "producer_claim"},
        "no scope": {k: v for k, v in good.items() if k != "scope"},
        "no producer": {k: v for k, v in good.items() if k != "producer_id"},
        "empty producer": {**good, "producer_id": ""},
    }
    for name, payload in cases.items():
        assert auth.decode_review_invite_token(_mint(payload)) is None, name
    assert auth.decode_review_invite_token(_mint(good, key=OTHER_KEY)) is None
    assert auth.decode_review_invite_token("not-a-token") is None


# ── owner-claim link ───────────────────────────────────────────────────────


def test_claim_token_carries_producer_scope_and_a_14_day_expiry():
    before = NOW()
    token, expires_at = auth.create_producer_claim_token(PID)
    claims = _claims(token)
    assert claims["producer_id"] == str(PID)
    assert claims["scope"] == auth.PRODUCER_CLAIM_SCOPE == "producer_claim"
    assert abs((expires_at - before) - timedelta(days=14)) <= timedelta(seconds=5)
    assert expires_at.tzinfo is not None
    assert claims["exp"] == _ts(expires_at)
    assert abs(claims["iat"] - _ts(before)) <= 5


def test_claim_token_decodes_to_its_producer():
    token, _ = auth.create_producer_claim_token(PID)
    assert auth.decode_producer_claim_token(token) == PID


def test_claim_token_refuses_each_broken_shape():
    exp = _ts(NOW() + timedelta(days=1))
    good = {"producer_id": str(PID), "exp": exp, "scope": "producer_claim"}
    assert auth.decode_producer_claim_token(_mint(good)) == PID  # control
    cases = {
        "expired": {**good, "exp": _ts(NOW() - timedelta(seconds=60))},
        "no exp": {k: v for k, v in good.items() if k != "exp"},
        "review scope": {**good, "scope": "review_invite"},
        "no producer": {k: v for k, v in good.items() if k != "producer_id"},
        "bad producer": {**good, "producer_id": "x"},
    }
    for name, payload in cases.items():
        assert auth.decode_producer_claim_token(_mint(payload)) is None, name
    assert auth.decode_producer_claim_token(_mint(good, key=OTHER_KEY)) is None
    # A review-invite link must never open a claim, and the reverse.
    assert (
        auth.decode_producer_claim_token(auth.create_review_invite_token(PID)) is None
    )
    token, _ = auth.create_producer_claim_token(PID)
    assert auth.decode_review_invite_token(token) is None


# ── lapsed claim link (asks for a new link only) ───────────────────────────


def _claim_payload(exp):
    return {"producer_id": str(PID), "exp": exp, "scope": "producer_claim"}


def test_lapsed_claim_accepts_live_and_recently_expired_links():
    assert (
        auth.decode_lapsed_producer_claim_token(
            _mint(_claim_payload(_ts(NOW() + timedelta(days=1))))
        )
        == PID
    )
    assert (
        auth.decode_lapsed_producer_claim_token(
            _mint(_claim_payload(_ts(NOW() - timedelta(days=10))))
        )
        == PID
    )
    assert (
        auth.decode_lapsed_producer_claim_token(
            _mint(_claim_payload(_ts(NOW() - timedelta(days=89))))
        )
        == PID
    )


def test_lapsed_claim_window_ends_at_90_days():
    assert auth.PRODUCER_CLAIM_RENEW_GRACE_DAYS == 90
    assert (
        auth.decode_lapsed_producer_claim_token(
            _mint(_claim_payload(_ts(NOW() - timedelta(days=91))))
        )
        is None
    )


def test_lapsed_claim_refuses_a_non_numeric_or_missing_exp():
    for name, exp in {"bool": True, "string": "9999999999", "null": None}.items():
        assert (
            auth.decode_lapsed_producer_claim_token(_mint(_claim_payload(exp))) is None
        ), name
    no_exp = {"producer_id": str(PID), "scope": "producer_claim"}
    assert auth.decode_lapsed_producer_claim_token(_mint(no_exp)) is None


def test_lapsed_claim_still_checks_scope_signature_and_producer():
    live = _ts(NOW() - timedelta(days=5))
    assert (
        auth.decode_lapsed_producer_claim_token(
            _mint({**_claim_payload(live), "scope": "review_invite"})
        )
        is None
    )
    assert (
        auth.decode_lapsed_producer_claim_token(
            _mint(_claim_payload(live), key=OTHER_KEY)
        )
        is None
    )
    assert (
        auth.decode_lapsed_producer_claim_token(
            _mint({**_claim_payload(live), "producer_id": "x"})
        )
        is None
    )
    assert auth.decode_lapsed_producer_claim_token("garbage") is None
