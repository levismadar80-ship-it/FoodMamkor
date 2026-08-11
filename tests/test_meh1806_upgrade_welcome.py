"""MEH-1806 — the producer welcome email fires on the upgrade path too.

`POST /auth/register/producer` has two branches. The non-upgrade (password)
branch dispatched the producer welcome; the authenticated upgrade branch did
not. That second branch is the one **every OAuth business owner lands on** —
`register_producer_oauth` creates a consumer account, and Step 2 upgrades it —
so an OAuth owner received no email setting the "up to 3 business days for
admin approval" expectation and no dashboard link.

The omission was never argued. The comment at auth.py read "no verify/welcome
email on the upgrade path", but the commit that wrote it (`d521ea5e`) describes
its own purpose as correcting a claim about *verification*; nothing in it
reasons about the welcome. The verify decision stands and is pinned below.

DISCRIMINATION (rules/testing.md → MEH-1619): `test_upgrade_path_dispatches_
producer_welcome` was run against the pre-change tree and observed failing
(`welcome.assert_called_once_with` → "Called 0 times"). The three sibling
assertions in this file pass in both worlds by design — they are the
over-reach guards, and a change that reddened them would be wrong.
"""

from unittest.mock import Mock

from tests.conftest import (
    auth_header,
    make_user,
    valid_producer_register_payload,
)


def _upgrade_body(**overrides):
    """The upgrade payload: no email/name/password — identity comes from the JWT."""
    body = valid_producer_register_payload() | {
        "producer_name": "משק השדרוג",
        "phone": "0501112233",
        **overrides,
    }
    for field in ("email", "name", "password"):
        body.pop(field, None)
    return body


def _patch_mail(monkeypatch):
    """Silence the real senders; return the welcome mock."""
    welcome = Mock()
    monkeypatch.setattr("app.routers.auth._send_welcome_email", welcome)
    monkeypatch.setattr("app.routers.auth._send_verify_email", lambda *a, **kw: None)
    return welcome


def test_upgrade_path_dispatches_producer_welcome(client, db, monkeypatch):
    """The behaviour this ticket exists for.

    Asserts the ADDRESS and ROLE, not merely that something was sent: the
    upgrade path takes no email in its body, so it has to read the address off
    the JWT's user. A version that sent to the wrong address, or sent the
    "consumer" template to a new business owner, would satisfy a bare
    `called_once()` and is exactly the mistake the sibling password-path test
    was written to catch.

    Fails pre-change: "Expected 'mock' to be called once. Called 0 times."
    """
    user = make_user(db, email="oauth_owner@test.com", name="דנה", role="consumer")
    welcome = _patch_mail(monkeypatch)

    resp = client.post(
        "/auth/register/producer",
        json=_upgrade_body(),
        headers=auth_header(user),
    )

    assert resp.status_code == 200, resp.text
    welcome.assert_called_once_with("oauth_owner@test.com", "דנה", "producer")


def test_upgrade_path_still_sends_no_verify_email(client, db, monkeypatch):
    """The half of the original decision that STANDS.

    This is the guard that keeps the fix from over-reaching into the MEH-1553
    ruling. Verification is deliberately not enforced on this branch and is
    covered downstream by the verify banner and `require_verified_producer`;
    adding a verify mail here would silently reverse a decision this ticket
    has no authority over. Passes in both worlds — that is the point.
    """
    user = make_user(db, email="noverify@test.com", role="consumer")
    verify = Mock()
    monkeypatch.setattr("app.routers.auth._send_welcome_email", lambda *a, **kw: None)
    monkeypatch.setattr("app.routers.auth._send_verify_email", verify)

    resp = client.post(
        "/auth/register/producer",
        json=_upgrade_body(producer_name="משק ללא אימות", phone="0502223344"),
        headers=auth_header(user),
    )

    assert resp.status_code == 200, resp.text
    verify.assert_not_called()


def test_welcome_is_not_gated_on_whatsapp_being_configured(client, db, monkeypatch):
    """The WhatsApp welcome is not a substitute, and this pins that they are
    independent.

    `notify_producer_registered` only reaches the owner when a phone AND
    WhatsApp credentials are present — the `whatsapp_expected` bool computed in
    the same handler. Neither is configured in this test environment, which is
    precisely the condition under which the missing email left an owner with
    no welcome at all. A future refactor that made the email conditional on
    the same inputs would reintroduce the gap; this test reddens if it does.
    """
    user = make_user(db, email="nowhatsapp@test.com", name="רותי", role="consumer")
    welcome = _patch_mail(monkeypatch)

    resp = client.post(
        "/auth/register/producer",
        json=_upgrade_body(producer_name="משק בלי ווטסאפ", phone="0503334455"),
        headers=auth_header(user),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["whatsapp_sent"] is False
    welcome.assert_called_once_with("nowhatsapp@test.com", "רותי", "producer")


def test_non_upgrade_path_welcome_is_unchanged(client, monkeypatch):
    """Control — the branch that already worked must keep working.

    Without this, a change that moved the dispatch instead of adding one would
    pass the first test in this file while silently breaking password signups.
    Passes in both worlds by design.
    """
    welcome = _patch_mail(monkeypatch)

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
    welcome.assert_called_once_with("password_owner@test.com", "יעל", "producer")
