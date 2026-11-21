"""MEH-3591 — two emails the site never sent.

1. «הסיסמה בחשבון שונתה» after a change from the profile and after a reset
   link was used. Without it a takeover is silent.
2. A group-buy join confirmation, for a join that left the group below its
   goal (a join that funds it gets the funded email instead, never both).

Each test drives the real route and reads what reached the sender.
"""

import secrets
from datetime import datetime, timedelta

import pytest

from _test_group_buys_api__common import _contact_details_in, _make_group_buy, _producer_user
from app.utils.clock import utc_now
from conftest import auth_header, make_user

OLD = "Mehamakor-Old-Passphrase-71!"
NEW = "Mehamakor-New-Passphrase-93!"


@pytest.fixture
def sends(monkeypatch):
    captured: list[dict] = []

    def capture(to, subject, body, html=None, test_cause=False, **_kw):
        captured.append({"to": to, "subject": subject, "body": body, "test_cause": test_cause})

    monkeypatch.setattr("app.services.auth_emails.send_email", capture)
    monkeypatch.setattr("app.services.group_buy_notifications.send_email", capture)
    return captured


def _password_notices(sends):
    return [s for s in sends if s["subject"] == "מהמקור - הסיסמה בחשבון שונתה"]


# ---------- password changed ----------


def test_changing_the_password_tells_the_account_address(client, db, sends):
    user = make_user(db, email="owner3591@example.com", password=OLD)
    resp = client.patch(
        "/users/me/password",
        headers=auth_header(user),
        json={"current_password": OLD, "new_password": NEW},
    )
    assert resp.status_code == 204, resp.text
    notices = _password_notices(sends)
    assert [n["to"] for n in notices] == ["owner3591@example.com"]
    body = notices[0]["body"]
    assert "/forgot-password" in body and "/contact" in body
    assert NEW not in body and OLD not in body


def test_using_a_reset_link_tells_the_account_address(client, db, sends):
    user = make_user(db, email="reset3591@example.com", password=OLD)
    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expires_at = utc_now() + timedelta(minutes=30)
    db.commit()
    resp = client.post("/auth/reset-password", json={"token": token, "new_password": NEW})
    assert resp.status_code == 200, resp.text
    notices = _password_notices(sends)
    assert [n["to"] for n in notices] == ["reset3591@example.com"]
    assert token not in notices[0]["body"] and NEW not in notices[0]["body"]


def test_a_refused_change_sends_nothing(client, db, sends):
    user = make_user(db, email="wrong3591@example.com", password=OLD)
    resp = client.patch(
        "/users/me/password",
        headers=auth_header(user),
        json={"current_password": "not-the-password", "new_password": NEW},
    )
    assert resp.status_code == 403
    assert _password_notices(sends) == []


def test_a_test_account_change_is_marked_test(client, db, sends):
    user = make_user(db, email="qa3591@example.com", password=OLD)
    user.is_test = True
    db.commit()
    client.patch(
        "/users/me/password",
        headers=auth_header(user),
        json={"current_password": OLD, "new_password": NEW},
    )
    assert [n["test_cause"] for n in _password_notices(sends)] == [True]


# ---------- group-buy join ----------


def _joined(sends):
    return [s for s in sends if s["subject"].startswith("מהמקור — הצטרפת לקבוצה")]


def test_a_join_below_the_goal_is_confirmed(client, db, sends):
    producer, _ = _producer_user(db, email="gbowner3591@test.com")
    gb = _make_group_buy(db, producer, min_participants=3)
    buyer = make_user(db, email="joiner3591@test.com")
    resp = client.post(
        f"/group-buys/{gb.id}/commit", json={"quantity": 2}, headers=auth_header(buyer)
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "open"
    mails = _joined(sends)
    assert [m["to"] for m in mails] == ["joiner3591@test.com"]
    body = mails[0]["body"]
    assert "הכמות שביקשת: 2." in body
    assert "הצטרפו 1 מתוך 3" in body
    assert f"/group-buys/{gb.id}" in body
    assert _contact_details_in(body) == [], "PRIVACY CONTRACT (MEH-1651)"


def test_a_join_that_funds_the_group_gets_only_the_funded_email(client, db, sends):
    producer, _ = _producer_user(db, email="gbowner3591b@test.com")
    gb = _make_group_buy(db, producer, min_participants=1)
    buyer = make_user(db, email="funder3591@test.com")
    resp = client.post(
        f"/group-buys/{gb.id}/commit", json={"quantity": 1}, headers=auth_header(buyer)
    )
    assert resp.json()["status"] == "funded"
    assert _joined(sends) == []
    assert any(s["to"] == "funder3591@test.com" for s in sends), "the funded email is the one"


def test_a_join_to_a_funded_group_gets_only_the_funded_email(client, db, sends):
    producer, _ = _producer_user(db, email="gbowner3591c@test.com")
    gb = _make_group_buy(db, producer, status="funded", min_participants=1)
    late = make_user(db, email="late3591@test.com")
    client.post(f"/group-buys/{gb.id}/commit", json={"quantity": 1}, headers=auth_header(late))
    assert _joined(sends) == []


def test_the_deadline_is_the_israel_date():
    """22:30 UTC on 30/11 is already 01.12 in Israel."""
    captured = []

    import app.services.group_buy_notifications as gbn
    from app.services.group_buy_notifications import notify_participant_joined

    orig = gbn.send_email
    gbn.send_email = lambda to, subject, body, **kw: captured.append(body)
    try:
        notify_participant_joined(
            "a@gmail.com", "x", 1, 1, 2, datetime(2026, 11, 30, 22, 30), "id"
        )
    finally:
        gbn.send_email = orig
    assert "01.12.2026" in captured[0]
