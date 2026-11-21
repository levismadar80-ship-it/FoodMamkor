"""MEH-3026 (F11): a business that signs up through an outreach lead's prefill
link moves that lead to «registered». Before this, the token only prefilled the
form and was never sent back, so the lead stayed «contacted» forever."""

from datetime import timedelta

from app.models.admin_ops import OutreachLead
from app.utils.clock import utc_now
from conftest import valid_producer_register_payload

TOKEN = "t" * 43  # the shape secrets.token_urlsafe(32) produces


def _lead(db, *, token=TOKEN, expires_in=timedelta(days=5), status="contacted"):
    lead = OutreachLead(
        name="משק הליד",
        status=status,
        prefill_token=token,
        prefill_token_expires_at=utc_now() + expires_in,
    )
    db.add(lead)
    db.commit()
    return lead.id


def _payload(**extra):
    payload = valid_producer_register_payload()
    payload["phone"] = "0521234567"  # required for the whatsapp contact method
    payload["terms_accepted"] = True
    return {**payload, **extra}


def _status(db, lead_id):
    db.expire_all()
    return db.get(OutreachLead, lead_id).status


def test_signup_with_the_lead_token_marks_it_registered(client, db):
    lead_id = _lead(db)
    payload = _payload(prefill_token=TOKEN)
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 200, resp.text
    assert _status(db, lead_id) == "registered"


def test_signup_without_a_token_leaves_the_lead_alone(client, db):
    lead_id = _lead(db)
    resp = client.post("/auth/register/producer", json=_payload())
    assert resp.status_code == 200, resp.text
    assert _status(db, lead_id) == "contacted"


def test_an_expired_token_changes_nothing_and_signup_still_succeeds(client, db):
    lead_id = _lead(db, expires_in=timedelta(days=-1))
    payload = _payload(prefill_token=TOKEN)
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 200, resp.text
    assert _status(db, lead_id) == "contacted"


def test_an_unknown_token_does_not_fail_the_signup(client, db):
    lead_id = _lead(db)
    payload = _payload(prefill_token="x" * 43)
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 200, resp.text
    assert _status(db, lead_id) == "contacted"
