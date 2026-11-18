"""MEH-3260 — «דיווח על ביקורת»: POST /reports/review emails the admin.

Before: a visitor who saw a fake or abusive review had no way to tell us —
the only report on the business page was about wrong business details.

Covers: 204 + one email naming business, reason and who reported (guest /
registered user / the business owner); 404 for a review of another
business or a hidden one; "other" needs details; a repeat from the same IP
for the same review sends no second email; nothing changes on the review.
"""

from unittest.mock import patch

import pytest

from tests.conftest import auth_header, make_producer, make_user
from app.models.models import ProducerReview
from app.services import review_reports


@pytest.fixture(autouse=True)
def _fresh_repeat_memory():
    review_reports.reset_for_tests()
    yield
    review_reports.reset_for_tests()


def _setup(db, *, hidden=False):
    producer = make_producer(db, name="חוות הבדיקה")
    author = make_user(db, email="author3260@example.com", name="דנה")
    review = ProducerReview(
        producer_id=producer.id,
        user_id=author.id,
        stars=1,
        body="ביקורת מזויפת לגמרי",
        is_hidden=hidden,
    )
    db.add(review)
    db.commit()
    return producer, review


def _post(client, producer, review, headers=None, **extra):
    body = {
        "producer_slug": str(producer.id),
        "review_id": str(review.id),
        "reason": "fake",
        **extra,
    }
    return client.post("/reports/review", json=body, headers=headers or {})


def test_guest_report_emails_the_admin(client, db):
    producer, review = _setup(db)
    with patch("app.routers.report_info.send_email") as send:
        r = _post(client, producer, review, reporter_email="me@example.com")
    assert r.status_code == 204, r.text
    send.assert_called_once()
    subject, text = send.call_args.args[1], send.call_args.args[2]
    assert subject == "מהמקור - דיווח על ביקורת: חוות הבדיקה"
    assert "סיבה: נראית מזויפת או לא מבוססת על ניסיון אמיתי" in text
    assert "מי דיווחה: אורחת" in text
    assert "me@example.com" in text
    assert "ביקורת מזויפת לגמרי" in text
    assert "/admin/reviews" in text
    db.refresh(review)
    assert review.is_hidden is False  # no automatic action


def test_registered_user_and_owner_are_named(client, db):
    producer, review = _setup(db)
    user = make_user(db, email="u3260@example.com")
    owner = make_user(db, email="o3260@example.com", role="producer")
    owner.producer_id = producer.id
    db.commit()
    with patch("app.routers.report_info.send_email") as send:
        _post(client, producer, review, headers=auth_header(user))
        review_reports.reset_for_tests()  # same test-client IP
        _post(client, producer, review, headers=auth_header(owner))
    texts = [c.args[2] for c in send.call_args_list]
    assert "מי דיווחה: משתמשת רשומה" in texts[0]
    assert "מי דיווחה: בעלת העסק" in texts[1]


def test_review_of_another_business_is_404(client, db):
    _, review = _setup(db)
    other = make_producer(db, name="עסק אחר")
    with patch("app.routers.report_info.send_email") as send:
        r = _post(client, other, review)
    assert r.status_code == 404
    assert r.json()["detail"] == "ביקורת לא נמצאה"
    send.assert_not_called()


def test_hidden_review_is_404(client, db):
    producer, review = _setup(db, hidden=True)
    with patch("app.routers.report_info.send_email") as send:
        r = _post(client, producer, review)
    assert r.status_code == 404
    send.assert_not_called()


def test_other_reason_needs_details(client, db):
    producer, review = _setup(db)
    with patch("app.routers.report_info.send_email") as send:
        bad = _post(client, producer, review, reason="other")
        blank = _post(client, producer, review, reason="other", details="   ")
        ok = _post(client, producer, review, reason="other", details="זו לא לקוחה")
    assert bad.status_code == 422
    assert blank.status_code == 422
    assert ok.status_code == 204
    assert "פרטים: זו לא לקוחה" in send.call_args.args[2]


def test_unknown_reason_is_422(client, db):
    producer, review = _setup(db)
    assert _post(client, producer, review, reason="boring").status_code == 422


def test_repeat_from_same_ip_sends_one_email(client, db):
    producer, review = _setup(db)
    with patch("app.routers.report_info.send_email") as send:
        first = _post(client, producer, review)
        second = _post(client, producer, review, reason="abusive")
    assert first.status_code == 204
    assert second.status_code == 204
    send.assert_called_once()


def test_repeat_window_expires():
    assert review_reports.is_repeat("1.1.1.1", "r", now=0.0) is False
    assert review_reports.is_repeat("1.1.1.1", "r", now=10.0) is True
    later = review_reports.REPEAT_WINDOW_SECONDS + 1.0
    assert review_reports.is_repeat("1.1.1.1", "r", now=later) is False
    assert review_reports.is_repeat("2.2.2.2", "r", now=later) is False


def test_repeat_memory_is_bounded(monkeypatch):
    monkeypatch.setattr(review_reports, "_MAX_KEYS", 3)
    for i in range(10):
        review_reports.is_repeat(f"ip{i}", "r", now=float(i))
    assert len(review_reports._seen) == 3


def test_email_escapes_visitor_text():
    _, _, html = review_reports.build_email(
        review_reports.ReviewReportMail(
            business="<b>x</b>",
            slug="s",
            reason="other",
            reporter="guest",
            reporter_email=None,
            details="<script>alert(1)</script>",
            review_author="a",
            review_stars=1,
            review_body="<img src=x>",
            admin_url="https://example.com/admin/reviews",
        )
    )
    assert "<script>" not in html
    assert "<img src=x>" not in html
    assert "&lt;script&gt;" in html
    assert "<b>x</b>" not in html and "&lt;b&gt;x&lt;/b&gt;" in html


def test_unknown_business_is_404(client, db):
    _, review = _setup(db)
    with patch("app.routers.report_info.send_email") as send:
        r = client.post(
            "/reports/review",
            json={
                "producer_slug": "no-such-business",
                "review_id": str(review.id),
                "reason": "fake",
            },
        )
    assert r.status_code == 404
    assert r.json()["detail"] == "בית עסק לא נמצא"
    send.assert_not_called()


def test_email_names_the_review_id_and_keeps_the_subject_on_one_line():
    subject, text, html = review_reports.build_email(
        review_reports.ReviewReportMail(
            business="חוות\r\nBcc: x@example.com",
            slug="s",
            reason="fake",
            reporter="guest",
            reporter_email='a"><script>@example.com',
            details=None,
            review_author="a",
            review_stars=1,
            review_body="b",
            admin_url="https://example.com/admin/reviews",
            review_id="rev-123",
        )
    )
    assert "\n" not in subject and "\r" not in subject
    assert "מזהה ביקורת: rev-123" in text
    assert "rev-123" in html
    assert '"><script>' not in html
