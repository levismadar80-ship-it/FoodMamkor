"""
The brand header shared by every HTML email (MEH-2834 PR 2).

One function, one image: the horizontal Hebrew lockup served from the
frontend's public folder (frontend/public/email-logo.png, 240px wide for a
120px display). Every HTML template calls email_logo_html() at the top of its
content; tests/test_email_logo.py renders each template and also scans
backend/app for any `<html` template that does not call it, so a new HTML
email without the logo fails CI.

Uses settings.frontend_url — the same base the templates already use for
their links — so no new setting or env var.
"""

from html import escape as html_escape

from app.config import settings

EMAIL_LOGO_PATH = "/email-logo.png"
EMAIL_LOGO_ALT = "מהמקור"
# frontend/public/email-logo.png is 240×70 → 120×35 on screen.
EMAIL_LOGO_HEIGHT = 35


def email_logo_url() -> str:
    return f"{settings.frontend_url.rstrip('/')}{EMAIL_LOGO_PATH}"


def email_logo_html() -> str:
    """The <img> row content. RTL: `margin-left:auto` aligns it to the start (right)."""
    # height: Outlook desktop sizes images from the attribute, not CSS.
    # color/font on the img style the alt text when images are blocked, so the
    # fallback reads like the text wordmark it replaced in some templates.
    return (
        f'<img src="{html_escape(email_logo_url())}" width="120" height="{EMAIL_LOGO_HEIGHT}" '
        f'alt="{EMAIL_LOGO_ALT}" style="display:block;border:0;margin:0 0 24px auto;'
        'color:#2e6853;font-size:18px;font-weight:bold;font-family:Arial,Helvetica,sans-serif">'
    )
