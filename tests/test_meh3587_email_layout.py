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
    return re.findall(
        r'<a href="([^"]+)"[^>]*display:inline-block[^>]*>([^<]+)</a>', html
    )


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
    body = (
        "שלום,\n\nלדף העסק: https://mehamakor.co.il/producer/abc\n\nבברכה,\nצוות מהמקור"
    )
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
    assert (
        f'<a href="https://x.example/c" style="color:#2e6853;font-weight:bold;">{INLINE_URL_LABEL}</a>.'
        in html
    )
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


# --- fresh-review round 1 (21/11): the shapes the real bodies use ---------


def test_a_sentence_before_a_link_line_stays_text():
    """rescue_business_emails: «…בלוח הבקרה:» + URL became a 45-letter button."""
    sentence = "את כל השריונים של היום אפשר לראות בלוח הבקרה:"
    html = text_to_html("s", f"{sentence}\nhttps://x.example/rescue\n\nצוות מהמקור")
    assert _buttons(html) == [("https://x.example/rescue", BARE_URL_LABEL)]
    assert sentence in _visible_text(html)


def test_a_paragraph_ending_in_a_colon_keeps_its_words():
    """delivery_waitlist: the whole paragraph became the button label."""
    line = "ביקשת שנודיע לך כשהם יגיעו לחיפה — וזה קרה. עכשיו אפשר להזמין:"
    html = text_to_html("s", f"היי,\n\n{line}\nhttps://x.example/p\n")
    assert line in _visible_text(html)
    assert all(len(label) <= 32 for _, label in _buttons(html))


def test_a_label_ending_a_sentence_becomes_a_button():
    """product_order_outbox: «…10:00–11:00. לאישור: URL» lost its wording."""
    html = text_to_html(
        "s",
        "הזמנה חדשה ממהמקור: דנה, 2 פריטים, 80 ₪, איסוף בשני 10:00–11:00. לאישור: https://x.example/o#t=abc",
    )
    assert _buttons(html) == [("https://x.example/o#t=abc", "לאישור")]
    assert "10:00–11:00." in _visible_text(html)


def test_only_the_signoff_line_is_dropped():
    html = text_to_html("s", "תוכן\nעוד תוכן\nצוות מהמקור")
    assert "עוד תוכן" in _visible_text(html)
    assert _visible_text(html).count("צוות מהמקור") == 1


def test_trailing_punctuation_stays_out_of_the_link():
    html = text_to_html("s", "הנה: https://x.example/a!\n\nhttps://x.example/b?")
    assert [u for u, _ in _buttons(html)] == [
        "https://x.example/a",
        "https://x.example/b",
    ]


def test_an_opt_out_is_never_the_filled_button():
    html = text_to_html(
        "s",
        "להפסקת הסיכום השבועי: https://x.example/stop\n\nלכל הנתונים: https://x.example/all",
    )
    stop, all_ = re.findall(
        r'<a href="[^"]+" style="display:inline-block;([^;]+);', html
    )
    assert stop == "background:#ffffff" and all_ == "background:#2e6853"


def test_a_converter_bug_still_sends_the_text(resend, monkeypatch):
    def boom(*_a):
        raise ValueError("converter bug")

    monkeypatch.setattr(email_service, "text_to_html", boom)
    email_service.send_email("person@gmail.com", "s", "the text")
    sent = _payload(resend)
    assert sent["text"] == "the text" and "html" not in sent
