"""MEH-1806 — exactly ONE producer welcome per signup, on every journey.

Decision ב (Sapir, 11/08). The OAuth journey used to send the WRONG welcome and
the fix could easily have sent two:

    Step 0  POST /auth/register/producer/oauth   → CONSUMER welcome  ("browse, save favourites")
    Step 2  POST /auth/register/producer         → nothing

Step 0's send was wrong-audience on its own — that endpoint is the producer
signup entry point, so everyone arriving is registering a business — and simply
adding a producer welcome at Step 2 would have produced TWO mails seconds apart,
both opening `ברוכה הבאה למהמקור! 🌿` and then contradicting each other
(auth_emails.py:147 vs :158).

So ב removes the Step 0 send and keeps the Step 2 one. Every test below asserts
a COUNT, not presence: presence-only assertions cannot detect the defect this
ticket is about, because the broken state also has a welcome in it.

THE ACCEPTED COST, asserted rather than left implicit: a user who completes
Step 0 and abandons before Step 2 now gets no welcome at all
(`test_abandoning_after_step_0_sends_no_welcome`). That is a decision, and a
test that pins it is the difference between a decision and an oversight.
"""

from unittest.mock import Mock

import pytest

from app.config import settings
from app.models import User
from app.routers import auth as auth_router
from tests.conftest import (
    auth_header,
    make_user,
    valid_producer_register_payload,
)

GOOGLE_SUB = "google-sub-1806"
PATCH_TARGET = "app.routers.auth._send_welcome_email"


@pytest.fixture
def google_verified(monkeypatch):
    """Stub the Google verifier — mirrors tests/test_email_verified_creation_paths.py."""
    monkeypatch.setattr(settings, "google_client_id", "dummy-google-id")
    monkeypatch.setattr(
        auth_router,
        "_verify_google_token",
        lambda token: {
            "sub": GOOGLE_SUB,
            "email": "oauth_owner@example.com",
            "name": "דנה",
            "picture": None,
        },
    )


@pytest.fixture
def welcome(monkeypatch):
    """Count welcome dispatches; silence the verify sender."""
    mock = Mock()
    monkeypatch.setattr(PATCH_TARGET, mock)
    monkeypatch.setattr("app.routers.auth._send_verify_email", lambda *a, **kw: None)
    return mock


def _step_0(client):
    """OAuth Step 0 — creates the account and returns the JWT for Step 2."""
    return client.post(
        "/auth/register/producer/oauth",
        json={"provider": "google", "id_token": "stub"},
    )


def _upgrade_body(**overrides):
    """Step 2 payload: no email/name/password — identity comes from the JWT."""
    body = valid_producer_register_payload() | {
        "producer_name": "משק השדרוג",
        "phone": "0501112233",
        **overrides,
    }
    for field in ("email", "name", "password"):
        body.pop(field, None)
    return body


def _kinds(mock):
    """The `role` argument of every welcome dispatched — the audience of each mail."""
    return [call.args[2] for call in mock.call_args_list]


# ---------- the OAuth journey, end to end ----------


def test_new_oauth_producer_gets_exactly_one_welcome(
    client, db, google_verified, welcome
):
    """Step 0 → Step 2, one account, ONE mail, producer kind.

    Fails on the pre-ב code in BOTH directions, which is what makes it the
    load-bearing test: against staging it sees 1 welcome of the wrong kind
    ("consumer"), and against PR #2781's first form it sees 2.
    """
    step0 = _step_0(client)
    assert step0.status_code == 200, step0.text

    # Step 2 authenticates as the account Step 0 just created, but via
    # `auth_header` rather than Step 0's own access token. Not a shortcut
    # around the flow — a TestClient limitation: the access token carries a
    # fingerprint claim that `get_current_user` checks against the
    # `__Secure-Fgp` cookie (MEH-327), and that cookie is `secure=True`, so
    # TestClient over http:// never returns it and Step 2 answers 401
    # "אסימון לא תקין". Verified, not guessed — that is the exact failure the
    # first version of this test produced.
    #
    # The substitution is safe for what is being asserted: the welcome
    # dispatch depends on the branch taken and the user identity, never on how
    # the JWT was minted. Same account, same upgrade branch, same count.
    user = db.query(User).filter(User.email == "oauth_owner@example.com").one()
    assert user.producer_id is None, "Step 0 must not have made her a producer yet"

    step2 = client.post(
        "/auth/register/producer",
        json=_upgrade_body(),
        headers=auth_header(user),
    )
    assert step2.status_code == 200, step2.text

    assert welcome.call_count == 1, f"expected exactly 1 welcome, got {_kinds(welcome)}"
    assert _kinds(welcome) == ["producer"]
    assert welcome.call_args.args[0] == "oauth_owner@example.com"


def test_abandoning_after_step_0_sends_no_welcome(client, db, google_verified, welcome):
    """The accepted cost of ב, pinned so it reads as a decision.

    Someone who authenticates and never completes the business step now
    receives nothing. She holds an account but finished no signup, and the
    alternative — the consumer "browse and save favourites" copy — is the
    wrong audience for someone who was mid-way through registering a business.
    """
    assert _step_0(client).status_code == 200

    assert welcome.call_count == 0, f"expected no welcome, got {_kinds(welcome)}"


def test_step_0_no_longer_advertises_an_email_it_does_not_send(
    client, db, google_verified, welcome
):
    """`email_sent` follows the send.

    The field is vestigial — no frontend reader, no other test — which is
    precisely why a stale `True` could have sat in the response indefinitely
    once the send was removed.
    """
    resp = _step_0(client)

    assert resp.status_code == 200
    assert resp.json()["email_sent"] is False
    assert welcome.call_count == 0


# ---------- the other two journeys, unchanged ----------


def test_existing_consumer_upgrading_gets_exactly_one_welcome(client, db, welcome):
    """A long-standing consumer adding a business.

    She keeps whatever welcome she got at her own signup — that one was correct
    when it was sent — and this upgrade is a second, different event. Exactly
    one mail fires from THIS request, and it is the producer one.
    """
    user = make_user(
        db, email="consumer_upgrade@test.com", name="רותי", role="consumer"
    )

    resp = client.post(
        "/auth/register/producer",
        json=_upgrade_body(producer_name="משק הצרכנית", phone="0502223344"),
        headers=auth_header(user),
    )

    assert resp.status_code == 200, resp.text
    assert welcome.call_count == 1, f"expected exactly 1 welcome, got {_kinds(welcome)}"
    assert _kinds(welcome) == ["producer"]
    assert welcome.call_args.args[0] == "consumer_upgrade@test.com"


def test_password_path_is_unchanged(client, welcome):
    """Control — the journey ב does not touch must keep its single producer
    welcome. Without this, a change that MOVED the send rather than adding one
    would satisfy every test above while silently breaking password signups."""
    resp = client.post(
        "/auth/register/producer",
        json=valid_producer_register_payload()
        | {
            "email": "password_owner@test.com",
            "name": "יעל",
            "producer_name": "משק הסיסמה",
            "phone": "0504445566",
        },
    )

    assert resp.status_code == 200, resp.text
    assert welcome.call_count == 1, f"expected exactly 1 welcome, got {_kinds(welcome)}"
    assert _kinds(welcome) == ["producer"]


def test_upgrade_path_still_sends_no_verify_email(client, db, welcome):
    """The half of the original decision that STANDS.

    Verification is deliberately not enforced on the upgrade branch and is
    covered downstream by the verify banner and `require_verified_producer`.
    Adding a verify mail here would reverse a ruling this ticket has no
    authority over. Passes in both worlds — that is the point.
    """
    user = make_user(db, email="noverify@test.com", role="consumer")
    verify = Mock()
    import app.routers.auth as auth_mod

    original = auth_mod._send_verify_email
    auth_mod._send_verify_email = verify
    try:
        resp = client.post(
            "/auth/register/producer",
            json=_upgrade_body(producer_name="משק ללא אימות", phone="0503334455"),
            headers=auth_header(user),
        )
    finally:
        auth_mod._send_verify_email = original

    assert resp.status_code == 200, resp.text
    verify.assert_not_called()
