"""MEH-1443: email-only "report wrong info" endpoint (POST /reports/producer-info).

v1 has no persistence — coverage is: 204 happy path (admin email sent),
404 unknown producer, 422 blank message, 429 after 5/day. send_email is
patched so we assert the notification fires without hitting Resend.
"""

from unittest.mock import patch

from tests.conftest import make_producer


def _post(client, **body):
    return client.post("/reports/producer-info", json=body)


def test_report_producer_info_happy_path_204_and_email(client, db):
    producer = make_producer(db, name="חוות הבדיקה")
    with patch("app.routers.report_info.send_email") as mock_send:
        resp = _post(
            client,
            producer_slug=str(producer.id),
            message="הטלפון בעמוד שגוי, המספר הנכון אחר",
            reporter_email="reporter@example.com",
        )
    assert resp.status_code == 204
    assert resp.content == b""
    mock_send.assert_called_once()
    # subject carries the business name; body carries the (escaped) message.
    args = mock_send.call_args.args
    subject, text_body = args[1], args[2]
    assert "חוות הבדיקה" in subject
    assert "הטלפון בעמוד שגוי" in text_body


def test_report_producer_info_resolves_by_slug(client, db):
    producer = make_producer(db, name="חוות הסלאג")
    producer.slug = "chavat-haslug"
    db.commit()
    with patch("app.routers.report_info.send_email") as mock_send:
        resp = _post(
            client,
            producer_slug="chavat-haslug",
            message="הכתובת השתנתה",
        )
    assert resp.status_code == 204
    mock_send.assert_called_once()


def test_report_producer_info_unknown_producer_404(client, db):
    with patch("app.routers.report_info.send_email") as mock_send:
        resp = _post(
            client,
            producer_slug="does-not-exist",
            message="דיווח כלשהו",
        )
    assert resp.status_code == 404
    mock_send.assert_not_called()


def test_report_producer_info_blank_message_422(client, db):
    producer = make_producer(db)
    # whitespace-only must 422 (validator strips then re-checks).
    resp = _post(client, producer_slug=str(producer.id), message="   ")
    assert resp.status_code == 422


def test_report_producer_info_rate_limited_after_5(client, db):
    producer = make_producer(db)
    with patch("app.routers.report_info.send_email"):
        for _ in range(5):
            ok = _post(
                client,
                producer_slug=str(producer.id),
                message="דיווח תקין",
            )
            assert ok.status_code == 204
        blocked = _post(
            client,
            producer_slug=str(producer.id),
            message="הדיווח השישי",
        )
    assert blocked.status_code == 429
