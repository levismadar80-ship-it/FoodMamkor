"""
Module:   test_meh2122_otp_send_failure
Purpose:  MEH-2122 B — when WhatsApp is set up but the code did not go out,
          the owner hears it (503 + Hebrew) instead of a false «קוד נשלח»
          and a wait for a message that never comes.
Touches:  The test DB via `client` + `db`. `send_template` and the
          "is it configured" check are replaced at the router's module
          attributes — no network. The real `_send_whatsapp_otp` runs.
Does NOT: test the confirm handler (tests/test_otp_confirm_*.py) or the
          send layer itself (tests/test_meh2952_send_layer.py).
History:  MEH-2122 chunk B (creation, 14/11).
"""

from tests.conftest import auth_header, make_producer, make_user

from app.routers import producer_me

PHONE = "0501234577"


def _owner(db, *, is_test=False):
    producer = make_producer(db, name="חוות בדיקה")
    producer.phone = PHONE
    producer.is_test = is_test
    db.commit()
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user


def _send(client, monkeypatch, user, *, sent, configured=True):
    monkeypatch.setattr(producer_me, "send_template", lambda *a, **k: sent)
    monkeypatch.setattr(producer_me, "whatsapp_is_configured", lambda: configured)
    return client.post("/producers/me/verify-phone", headers=auth_header(user))


def test_a_failed_send_says_so(client, db, monkeypatch):
    r = _send(client, monkeypatch, _owner(db), sent=False)
    assert r.status_code == 503, r.text
    assert "לא הצלחנו לשלוח" in r.json()["detail"]


def test_a_good_send_still_says_sent(client, db, monkeypatch):
    r = _send(client, monkeypatch, _owner(db), sent=True)
    assert r.status_code == 200, r.text
    assert r.json()["detail"] == "קוד נשלח"


def test_unconfigured_environment_stays_fail_open(client, db, monkeypatch):
    # Dev / CI / an environment without WHATSAPP_*: nothing could be sent and
    # nothing is promised beyond today's behaviour.
    r = _send(client, monkeypatch, _owner(db), sent=False, configured=False)
    assert r.status_code == 200, r.text


def test_a_test_business_is_not_an_error(client, db, monkeypatch):
    # MEH-2952: a test row's send is dropped on purpose — not a failure.
    r = _send(client, monkeypatch, _owner(db, is_test=True), sent=False)
    assert r.status_code == 200, r.text
