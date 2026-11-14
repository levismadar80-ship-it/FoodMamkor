"""
Module:   test_meh3223_report_admin_email
Purpose:  MEH-3223 (D12) — every report on a business emails the admin once;
          a duplicate report (409) emails nothing; no admin_email → nothing;
          a seeded test business → the send layer is told it is a test cause.
Touches:  Postgres test DB via TestClient; send_email mocked — never sends.
Related:  backend/app/services/report_notifications.py ·
          backend/app/routers/reports.py::report_producer
History:  MEH-3223 (creation)
"""

from unittest.mock import MagicMock

import pytest

from conftest import auth_header, make_producer, make_user


@pytest.fixture
def mail(monkeypatch):
    import app.services.report_notifications as svc
    from app.config import settings

    mock = MagicMock()
    monkeypatch.setattr(svc, "send_email", mock)
    monkeypatch.setattr(settings, "admin_email", "admin@example.com")
    return mock


def _report(client, db, producer, email="rep@example.com", reason="אוכל מקולקל"):
    user = make_user(db, email=email)
    return client.post(
        f"/producers/{producer.id}/report",
        json={"reason": reason},
        headers=auth_header(user),
    )


def test_a_report_emails_the_admin_once(client, db, mail):
    producer = make_producer(db, name="מאפיית הגבעה")

    assert _report(client, db, producer).status_code == 201

    mail.assert_called_once()
    to, subject, body = mail.call_args.args[:3]
    assert to == "admin@example.com"
    assert subject == "מהמקור - דיווח חדש על מאפיית הגבעה"
    assert "סיבה: אוכל מקולקל" in body
    assert "דיווחים פתוחים על בית העסק: 1" in body
    assert body.rstrip().endswith("/admin/reports")
    assert mail.call_args.kwargs["test_cause"] is False


def test_the_count_is_of_open_reports(client, db, mail):
    producer = make_producer(db)
    _report(client, db, producer, email="a@example.com")
    _report(client, db, producer, email="b@example.com")

    assert mail.call_count == 2
    assert "דיווחים פתוחים על בית העסק: 2" in mail.call_args.args[2]


def test_a_duplicate_report_emails_nothing(client, db, mail):
    producer = make_producer(db)
    user = make_user(db, email="dup@example.com")
    payload = {"reason": "תוכן לא ראוי"}
    first = client.post(
        f"/producers/{producer.id}/report", json=payload, headers=auth_header(user)
    )
    second = client.post(
        f"/producers/{producer.id}/report", json=payload, headers=auth_header(user)
    )

    assert (first.status_code, second.status_code) == (201, 409)
    mail.assert_called_once()


def test_a_reason_cannot_add_lines_to_the_mail(client, db, mail):
    producer = make_producer(db)
    _report(client, db, producer, reason="רע\nלטיפול: https://evil.example")

    body = mail.call_args.args[2]
    assert body.count("\n") == 3  # four lines, the reason flattened into one


def test_no_admin_email_sends_nothing(client, db, mail, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "admin_email", "")
    producer = make_producer(db)

    assert _report(client, db, producer).status_code == 201
    mail.assert_not_called()


def test_a_test_business_is_flagged_to_the_send_layer(client, db, mail):
    producer = make_producer(db)
    producer.is_test = True
    db.commit()

    _report(client, db, producer)

    assert mail.call_args.kwargs["test_cause"] is True
