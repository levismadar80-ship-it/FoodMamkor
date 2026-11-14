"""
Module:   test_meh2642_suggester_signed_in
Purpose:  MEH-2642 (Sapir 14/11, option 2): the suggester address on
          POST /business-suggestions comes ONLY from a signed-in account.
          A typed `suggester_email` is never stored, so nobody can attach a
          stranger's address to a lead and have the thank-you mail sent there.
Touches:  Postgres test DB via TestClient; admin ping mocked.
Related:  backend/app/routers/business_suggestions.py submit_business_suggestion;
          tests/test_business_suggestions.py (the wider endpoint suite).
History:  MEH-2642 (creation).
"""

from app.models.models import OutreachLead
from conftest import auth_header, make_user
from test_business_suggestions import ENDPOINT, _payload, _silence_notify

STRANGER = "stranger@example-victim.co.il"
MEMBER = "member@example-suggester.co.il"


def test_anonymous_typed_email_is_not_stored(client, db, monkeypatch):
    _silence_notify(monkeypatch)
    r = client.post(ENDPOINT, json=_payload(suggester_email=STRANGER))
    assert r.status_code == 201
    lead = db.query(OutreachLead).one()
    assert lead.suggested_by_email is None
    assert lead.suggester_wants_update is False, "no address, so no update owed"


def test_anonymous_suggestion_is_still_accepted(client, db, monkeypatch):
    """Control: the anonymous path keeps working, only without an address."""
    _silence_notify(monkeypatch)
    r = client.post(ENDPOINT, json=_payload(suggester_email=None, wants_update=False))
    assert r.status_code == 201
    assert db.query(OutreachLead).count() == 1


def test_signed_in_typed_email_is_replaced_by_the_account_email(
    client, db, monkeypatch
):
    _silence_notify(monkeypatch)
    user = make_user(db, email=MEMBER)
    r = client.post(
        ENDPOINT, json=_payload(suggester_email=STRANGER), headers=auth_header(user)
    )
    assert r.status_code == 201
    lead = db.query(OutreachLead).one()
    assert lead.suggested_by_email == MEMBER
    assert lead.suggester_wants_update is True


def test_signed_in_without_opt_in_stores_no_email(client, db, monkeypatch):
    _silence_notify(monkeypatch)
    user = make_user(db, email=MEMBER)
    r = client.post(
        ENDPOINT,
        json=_payload(suggester_email=STRANGER, wants_update=False),
        headers=auth_header(user),
    )
    assert r.status_code == 201
    lead = db.query(OutreachLead).one()
    assert lead.suggested_by_email is None
    assert lead.suggester_wants_update is False


def test_anonymous_repeat_cannot_fill_an_empty_community_slot(
    client, db, monkeypatch
):
    """The duplicate branch: a community lead with no address must not be
    claimable by an anonymous caller who types an address."""
    _silence_notify(monkeypatch)
    client.post(ENDPOINT, json=_payload(suggester_email=None, wants_update=False))
    r = client.post(ENDPOINT, json=_payload(suggester_email=STRANGER))
    assert r.status_code == 201
    db.expire_all()
    lead = db.query(OutreachLead).one()
    assert lead.suggested_by_email is None
    assert lead.suggester_wants_update is False
