"""
Module:   test_meh2231_otp_test_numbers
Purpose:  MEH-2231 — a fixed allow-list of TEST phone numbers gets a fixed
          OTP code and no WhatsApp send, outside production only. Four
          DoD rows from the card, each its own test: exploit (listed number
          confirms), separation (unlisted number untouched), production
          refusal, and empty-config-is-off.
Touches:  The test DB via `client` + `db` (producers, users,
          phone_otp_tokens). The WhatsApp sender is replaced by a recorder
          at the router's module attribute — no network.
Does NOT: test the confirm handler's own rules (wrong code, expiry, races)
          — tests/test_otp_confirm_concurrency.py and
          tests/test_meh1176_otp_confirm_rate_limit.py own those.
Related:  backend/app/routers/producer_me.py (_otp_test_mode_allowed,
          _otp_test_code_for, send_phone_otp); backend/app/config.py
          (otp_test_numbers / otp_test_code);
          backend/scripts/seed_demo_producers.py:646 (the refusal shape)
History:  MEH-2231 (creation, night session 04/09 — RED, ADR-032 §2).

DISCRIMINATION (testing.md). Run against origin/staging's producer_me.py
(no feature): `exploit` FAILS (confirm → 400, phone stays unverified);
`separation`, `production refusal` and `empty config` PASS there because
they assert today's behaviour — kept as guards on the plausible wrong
fixes (a global bypass; a gate that forgets production). Mutation on the
new code: delete the `app_env == "production"` line → `production refusal`
FAILS and the pure-function test FAILS; everything else passes.
"""

import logging

import pytest

from tests.conftest import auth_header, make_producer, make_user

from app import config
from app.models.models import PhoneOtpToken, Producer
from app.routers import producer_me

LOGGER_NAME = "app.routers.producer_me"
LISTED = "0501234599"
UNLISTED = "0501234598"
FIXED = "424242"


def _producer_user(db, phone):
    producer = make_producer(db, name="חוות בדיקה")
    producer.phone = phone
    db.commit()
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


class _Recorder:
    def __init__(self):
        self.calls: list[tuple[str, str]] = []

    def __call__(self, phone: str, code: str) -> bool:
        self.calls.append((phone, code))
        return True


def _arm(monkeypatch, numbers=LISTED, code=FIXED):
    monkeypatch.setattr(config.settings, "otp_test_numbers", numbers)
    monkeypatch.setattr(config.settings, "otp_test_code", code)
    rec = _Recorder()
    monkeypatch.setattr(producer_me, "_send_whatsapp_otp", rec)
    return rec


def _warnings(caplog) -> list[str]:
    return [
        r.getMessage()
        for r in caplog.records
        if r.name == LOGGER_NAME and r.levelno >= logging.WARNING
    ]


def _stored_code(db, producer_id) -> str:
    token = (
        db.query(PhoneOtpToken)
        .filter(PhoneOtpToken.producer_id == producer_id, PhoneOtpToken.used.is_(False))
        .one()
    )
    return token.code


# ── DoD row 1 — exploit: fails-before / passes-after ─────────────────────
def test_listed_number_gets_fixed_code_and_confirms(client, db, monkeypatch, caplog):
    rec = _arm(monkeypatch)
    user, producer = _producer_user(db, LISTED)

    with caplog.at_level(logging.WARNING, logger=LOGGER_NAME):
        r = client.post("/producers/me/verify-phone", headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert rec.calls == [], "a TEST number must never reach WhatsApp"
    assert _stored_code(db, producer.id) == FIXED
    # The bypass is an audit event: exactly one WARNING, naming the producer
    # and never the phone or the code.
    hits = [m for m in _warnings(caplog) if "OTP test mode" in m]
    assert len(hits) == 1, _warnings(caplog)
    assert str(producer.id) in hits[0]
    assert LISTED not in hits[0] and FIXED not in hits[0]

    r = client.post(
        "/producers/me/verify-phone/confirm",
        json={"code": FIXED},
        headers=auth_header(user),
    )
    assert r.status_code == 200, r.text
    db.expire_all()
    assert db.query(Producer).get(producer.id).phone_verified is True


# ── DoD row 2 — separation: the normal path did not move ─────────────────
def test_unlisted_number_still_gets_a_random_code_and_a_send(
    client, db, monkeypatch, caplog
):
    rec = _arm(monkeypatch)
    user, producer = _producer_user(db, UNLISTED)

    with caplog.at_level(logging.WARNING, logger=LOGGER_NAME):
        r = client.post("/producers/me/verify-phone", headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert len(rec.calls) == 1
    # The normal path leaves no bypass event behind.
    assert not [m for m in _warnings(caplog) if "OTP test mode" in m]
    phone, sent = rec.calls[0]
    assert phone == UNLISTED
    assert len(sent) == 6 and sent.isdigit()
    # No `sent != FIXED` here: a random 6-digit code equals FIXED once in
    # 10^6 runs (reviewer, PR #3393). The round-trip below is the invariant.
    assert _stored_code(db, producer.id) == sent


# ── DoD row 3 — production refusal: the ONE assertion that makes this RED ─
def test_production_refuses_even_a_listed_number(client, db, monkeypatch, caplog):
    rec = _arm(monkeypatch)
    monkeypatch.setattr(config.settings, "env", "production")
    user, producer = _producer_user(db, LISTED)

    with caplog.at_level(logging.WARNING, logger=LOGGER_NAME):
        r = client.post("/producers/me/verify-phone", headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert len(rec.calls) == 1, "production must take the normal path"
    # No `!= FIXED` on the random code (same 1-in-10^6 reasoning as the
    # separation test); the send itself is the discriminating fact.
    assert _stored_code(db, producer.id) == rec.calls[0][1]
    # And no bypass event was logged — the refusal is exhaustive, not
    # inferred from the send count alone (reviewer round 7, PR #3393).
    assert not [m for m in _warnings(caplog) if "OTP test mode" in m]


def test_environment_gate_is_the_seed_script_shape():
    allowed = producer_me._otp_test_mode_allowed
    # production refuses first, whatever the host or the Railway flag says
    assert allowed("localhost", "staging", "production") is False
    assert allowed("localhost", "", "production") is False
    # local host: always allowed outside production
    assert allowed("localhost", "", "development") is True
    assert allowed("127.0.0.1", "", "test") is True
    assert allowed("::1", "", "development") is True  # IPv6 loopback (reviewer, #3393)
    # no host at all (Unix-socket URL): OFF even on Railway staging — the
    # docstring's "stays OFF" promise, pinned (reviewer, PR #3393)
    assert allowed("", "staging", "development") is False
    assert allowed("   ", "staging", "development") is False
    # remote host: only Railway staging
    assert allowed("db.railway.internal", "staging", "development") is True
    assert allowed("db.railway.internal", "STAGING", "development") is True
    assert allowed("db.railway.internal", "", "development") is False
    assert allowed("db.railway.internal", "production", "development") is False


# ── DoD row 4 — empty / malformed config is OFF, never half-on ───────────
def test_empty_config_is_off(client, db, monkeypatch):
    rec = _arm(monkeypatch, numbers="", code="")
    user, producer = _producer_user(db, LISTED)

    r = client.post("/producers/me/verify-phone", headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert len(rec.calls) == 1
    assert _stored_code(db, producer.id) == rec.calls[0][1]


# One test per malformed value, not a loop: /verify-phone is limited to
# 3/10minute per client IP and conftest's autouse _reset_rate_limiter only
# runs between test FUNCTIONS, so a 3-call loop sat exactly on the cap and a
# tighter limit would have turned it into a 429 (reviewer round 7, PR #3393).
@pytest.mark.parametrize("bad", ["42424", "4242a2", " "])
def test_malformed_code_turns_the_feature_off(client, db, monkeypatch, bad):
    # 5 digits, letters — a code the confirm handler could never match is a
    # trap, so it disables the feature instead of half-enabling it.
    rec = _arm(monkeypatch, code=bad)
    user, producer = _producer_user(db, LISTED)
    r = client.post("/producers/me/verify-phone", headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert len(rec.calls) == 1, bad
    # Not `!= bad` — no 6-digit string can equal any of these three, so
    # that read as coverage and could not fail (reviewer, PR #3393).
    # A real OTP was stored instead: six digits, and the one that went out.
    stored = _stored_code(db, producer.id)
    assert len(stored) == 6 and stored.isdigit(), bad
    assert stored == rec.calls[0][1], bad
