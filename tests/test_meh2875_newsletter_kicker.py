"""MEH-2875 (Sapir 10/11): the newsletter welcome no longer repeats the name.

Since #4247 the logo (alt «מהמקור») sits at the top of every HTML email. In
the newsletter welcome it was followed by the old kicker line «מהמקור 🌿», so
the name appeared twice. The line is gone; the subject («ברוכים הבאים למהמקור
🌿») and the plain-text body are unchanged.
"""

import re

from app.routers import marketing


def _send():
    captured = {}

    def fake_send_email(to, subject, body, html=None, **kwargs):
        captured.update(subject=subject, body=body, html=html)

    original = marketing.send_email
    marketing.send_email = fake_send_email
    try:
        marketing._send_newsletter_welcome("qa@example.com")
    finally:
        marketing.send_email = original
    assert captured.get("html"), "CONTROL FAILED: no HTML captured — every check below is void"
    return captured


def test_no_kicker_line_under_the_logo():
    html = _send()["html"]
    # The rendered paragraph, not the string anywhere: the subject keeps 🌿.
    assert not re.search(r"<p[^>]*>\s*מהמקור 🌿\s*</p>", html), "the «מהמקור 🌿» line is back"


def test_logo_then_heading_and_subject_unchanged():
    sent = _send()
    html = sent["html"]
    # Control that the template still renders its head: the logo, then the h1.
    logo_at = html.find('alt="מהמקור"')
    h1_at = html.find("<h1")
    assert 0 <= logo_at < h1_at, "the logo no longer precedes the heading"
    assert sent["subject"] == "ברוכים הבאים למהמקור 🌿"
