"""MEH-3587 — every email goes out in the one branded frame.

49 of 73 send_email call sites sent text only (measured 21/11): no logo, no
card, raw UUID addresses. services/email.py::_deliver now builds the HTML part
from the text for any send without html. These tests run the real sender and
the real notification functions, and read what Resend would have received.
"""

import re
from unittest.mock import MagicMock, patch

import pytest

from app.config import settings
from app.services import email as email_service
from app.services import group_buy_notifications
from app.services.email_layout import (
    BARE_URL_LABEL,
    INLINE_URL_LABEL,
    heading_from_subject,
    text_to_html,
)

# The host is MEH-3583's (tests/test_email_logo.py); here: the logo is there.
LOGO = '/email-logo.png" width="120"'
TAG = re.compile(r"<[^>]+>")


def _visible_text(html: str) -> str:
    return TAG.sub(" ", html)


def _buttons(html: str) -> list[tuple[str, str]]:
    return re.findall(r'<a href="([^"]+)"[^>]*display:inline-block[^>]*>([^<]+)</a>', html)


@pytest.fixture
def resend(monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "re_test_dummy")
    monkeypatch.setattr(email_service, "_route_outside_production", lambda *a: a)
    client = MagicMock()
    with patch.object(email_service, "configure_resend", return_value=client):
        yield client


def _payload(client) -> dict:
    assert client.Emails.send.call_count == 1, client.Emails.send.call_args_list
    return client.Emails.send.call_args.args[0]


def test_a_text_only_send_goes_out_with_the_branded_html(resend):
    body = "שלום,\n\nלדף העסק: https://mehamakor.co.il/producer/abc\n\nבברכה,\nצוות מהמקור"
    email_service.send_email("person@gmail.com", "מהמקור — בדיקה", body)
    sent = _payload(resend)
    assert sent["text"] == body, "the text part must go out unchanged"
    html = sent["html"]
    assert LOGO in html
    assert '<html dir="rtl" lang="he">' in html and 'name="viewport"' in html
    assert _buttons(html) == [("https://mehamakor.co.il/producer/abc", "לדף העסק")]


def test_a_send_that_brings_its_own_html_keeps_it(resend):
    email_service.send_email("person@gmail.com", "s", "t", html="<p>mine</p>")
    assert _payload(resend)["html"] == "<p>mine</p>"


def test_group_buy_funded_email_her_screenshot(resend):
    """The email Sapir sent on 21/11: two raw UUID addresses, no design."""
    group_buy_notifications.notify_participant_funded(
        "person@gmail.com",
        "שק קמח כוסמין מלא",
        "מאפיית רוח השדה",
        group_buy_id="e4bf92d4-0c04-4f46-b1ec-ab609cc4e65a",
        producer_id="259149a1-3231-4534-8f84-3b391509e883",
    )
    html = _payload(resend)["html"]
    assert LOGO in html
    labels = [label for _, label in _buttons(html)]
    assert labels == ["לדף העסק", "לצפייה בקבוצה ובפרטי ההזמנה"], labels
    assert "http" not in _visible_text(html), "a raw address is still shown as text"
    assert _visible_text(html).count("צוות מהמקור") == 1, "sign-off printed twice"


def test_text_to_html_shapes():
    """Each line shape the 49 text bodies use, with the answer known."""
    html = text_to_html(
        "מהמקור - כותרת",
        "פסקה ראשונה\nשורה שנייה\n\n"
        "לחצו:\nhttps://x.example/a\n\n"
        "https://x.example/b\n\n"
        "לא רוצה עדכונים? https://x.example/c.\n",
    )
    assert _buttons(html) == [
        ("https://x.example/a", "לחצו"),
        ("https://x.example/b", BARE_URL_LABEL),
    ]
    assert f'<a href="https://x.example/c" style="color:#2e6853;font-weight:bold;">{INLINE_URL_LABEL}</a>.' in html
    assert "פסקה ראשונה<br>שורה שנייה" in html
    assert "http" not in _visible_text(html)
    assert ">כותרת</td>" in html


def test_text_is_escaped():
    html = text_to_html("s", '<script>alert(1)</script> & "x"')
    assert "<script>" not in html and "&lt;script&gt;" in html


@pytest.mark.parametrize(
    ("subject", "heading"),
    [
        ("מהמקור — הקבוצה הגיעה ליעד", "הקבוצה הגיעה ליעד"),
        ("מהמקור - דיווח חדש", "דיווח חדש"),
        ("ההרשמה נקלטה", "ההרשמה נקלטה"),
        ("", "מהמקור"),
    ],
)
def test_heading_drops_the_brand_prefix(subject, heading):
    assert heading_from_subject(subject) == heading
