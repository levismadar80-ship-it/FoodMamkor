"""MEH-2834 PR 2 — every HTML email starts with the brand logo.

Two layers:
1. Render: each HTML template that can be built without a request or a DB
   row is rendered and must carry the <img> with alt «מהמקור» and an
   absolute https URL to /email-logo.png (frontend_url set to production).
2. Scan: every `<html` template under backend/app must sit next to an
   email_logo_html() call — one call per `<html`. This is what fails CI the
   day someone adds an HTML email without the logo, including the two
   route-built ones (marketing.py, report_info.py) that layer 1 cannot render.
"""

import re
from pathlib import Path

import pytest

from app.config import settings
from app.services import auth_emails, email_branding, rescue_emails
from app.services.email_branding import EMAIL_LOGO_ALT, email_logo_html

BACKEND_APP = Path(__file__).resolve().parents[1] / "backend" / "app"
LOGO_IMG = re.compile(r'<img src="(?P<src>[^"]+)" width="120" alt="(?P<alt>[^"]+)"')


@pytest.fixture
def prod_site(monkeypatch):
    monkeypatch.setattr(settings, "frontend_url", "https://mehamakor.co.il")
    monkeypatch.setattr(settings, "resend_api_key", "re_test_dummy")


def _capture(monkeypatch, module):
    sent = []
    monkeypatch.setattr(module, "send_email", lambda to, subject, body, html=None, **kw: sent.append(html))
    return sent


def _assert_logo_first(html: str, label: str):
    m = LOGO_IMG.search(html or "")
    assert m, f"{label}: no logo <img>"
    assert m.group("alt") == EMAIL_LOGO_ALT, label
    assert m.group("src") == "https://mehamakor.co.il/email-logo.png", f"{label}: {m.group('src')}"
    # The logo is the first thing in the content: before any heading or paragraph.
    first_text = min((i for i in (html.find("<h1"), html.find("<p ")) if i >= 0), default=len(html))
    assert m.start() < first_text, f"{label}: logo is not above the first heading/paragraph"


def _rendered_templates(monkeypatch):
    out = {}
    sent = _capture(monkeypatch, auth_emails)
    auth_emails.send_reset_email("a@example.com", "דנה", "https://mehamakor.co.il/reset?t=x")
    auth_emails.send_verify_email("a@example.com", "דנה", "tok")
    auth_emails.send_welcome_email("a@example.com", "דנה", role="consumer")
    auth_emails.send_welcome_email("a@example.com", "דנה", role="producer")
    for label, html in zip(["auth.reset", "auth.verify", "auth.welcome_consumer", "auth.welcome_producer"], sent):
        out[label] = html
    rsent = _capture(monkeypatch, rescue_emails)
    rescue_emails.send_cancel_email("a@example.com", "משק ברק")
    rescue_emails.send_business_cancel_email("a@example.com", "משק ברק")
    out["rescue.cancel"], out["rescue.business_cancel"] = rsent
    from app.services import registration_emails

    out["registration.shell"] = registration_emails._shell("כותרת", "<tr><td>שורה</td></tr>")
    from app.routers import admin

    out["admin.approved"] = admin._producer_approved_html("משק ברק", "meshek-barak")
    out["admin.rejected"] = admin._producer_rejected_html("משק ברק", "חסר מסמך")
    return out


def test_every_renderable_html_email_starts_with_the_logo(prod_site, monkeypatch):
    rendered = _rendered_templates(monkeypatch)
    assert len(rendered) == 9, sorted(rendered)
    for label, html in rendered.items():
        _assert_logo_first(html, label)


def test_logo_url_follows_frontend_url(monkeypatch):
    monkeypatch.setattr(settings, "frontend_url", "https://staging.mehamakor.online/")
    assert email_branding.email_logo_url() == "https://staging.mehamakor.online/email-logo.png"
    assert 'alt="מהמקור"' in email_logo_html()


def test_no_html_email_in_the_backend_without_the_logo():
    """One email_logo_html() call per `<html` template, per file."""
    checked = {}
    for path in sorted(BACKEND_APP.rglob("*.py")):
        src = path.read_text(encoding="utf-8")
        templates = len(re.findall(r"<html\s+dir=", src))
        if not templates:
            continue
        calls = len(re.findall(r"\{?email_logo_html\(\)", src)) - len(re.findall(r"def email_logo_html\(", src))
        checked[str(path.relative_to(BACKEND_APP))] = (templates, calls)
        assert calls >= templates, f"{path.relative_to(BACKEND_APP)}: {templates} HTML template(s), {calls} logo call(s)"
    # Control: the scan must have found the files it exists for, or it proves nothing.
    assert checked.get("services/auth_emails.py") == (4, 4), checked
    assert sum(t for t, _ in checked.values()) == 12, checked
