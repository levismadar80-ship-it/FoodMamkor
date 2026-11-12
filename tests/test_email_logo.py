"""MEH-2834 PR 2 — every HTML email starts with the brand logo.

Two layers:
1. Render: all 12 HTML templates are built (the report_info one through its
   real route) and each must carry the <img> with alt «מהמקור» and an
   absolute https URL to /email-logo.png (frontend_url set to production),
   above its first heading or paragraph.
2. Scan: every module under backend/app that contains an HTML document
   (`<html`, any case, any attributes) must make one real email_logo_html()
   call per document — counted from the AST, so a comment that mentions the
   function does not count. This is what fails CI the day someone adds an
   HTML email without the logo. Known limit: an HTML *fragment* sent with no
   `<html>` element is not detected; every HTML email here is a full document.
"""

import ast
import re
from pathlib import Path
from unittest.mock import patch

import pytest

from app.config import settings
from app.services import auth_emails, email_branding, rescue_emails
from app.services.email_branding import EMAIL_LOGO_ALT, email_logo_html
from tests.conftest import make_producer

BACKEND_APP = Path(__file__).resolve().parents[1] / "backend" / "app"
LOGO_IMG = re.compile(
    r'<img src="(?P<src>[^"]+)" width="120" height="\d+" alt="(?P<alt>[^"]+)"'
)
HTML_DOC = re.compile(r"<html[\s>]", re.IGNORECASE)


@pytest.fixture
def prod_site(monkeypatch):
    monkeypatch.setattr(settings, "frontend_url", "https://mehamakor.co.il")
    monkeypatch.setattr(settings, "resend_api_key", "re_test_dummy")


def _capture(monkeypatch, module):
    sent = []
    monkeypatch.setattr(
        module,
        "send_email",
        lambda to, subject, body, html=None, **kw: sent.append(html),
    )
    return sent


def _assert_logo_first(html: str, label: str):
    m = LOGO_IMG.search(html or "")
    assert m, f"{label}: no logo <img>"
    assert m.group("alt") == EMAIL_LOGO_ALT, label
    assert m.group("src") == "https://mehamakor.co.il/email-logo.png", (
        f"{label}: {m.group('src')}"
    )
    first_text = min(
        (i for i in (html.find("<h1"), html.find("<p ")) if i >= 0), default=len(html)
    )
    assert m.start() < first_text, (
        f"{label}: logo is not above the first heading/paragraph"
    )
    assert len(LOGO_IMG.findall(html)) == 1, f"{label}: more than one logo"


def _render_all(monkeypatch, client, db):
    out = {}
    sent = _capture(monkeypatch, auth_emails)
    auth_emails.send_reset_email(
        "a@example.com", "דנה", "https://mehamakor.co.il/reset?t=x"
    )
    auth_emails.send_verify_email("a@example.com", "דנה", "tok")
    auth_emails.send_welcome_email("a@example.com", "דנה", role="consumer")
    auth_emails.send_welcome_email("a@example.com", "דנה", role="producer")
    out.update(
        zip(
            [
                "auth.reset",
                "auth.verify",
                "auth.welcome_consumer",
                "auth.welcome_producer",
            ],
            sent,
        )
    )

    rsent = _capture(monkeypatch, rescue_emails)
    rescue_emails.send_reservation_email(
        "a@example.com",
        rescue_emails.ReservationEmail(
            producer_name="משק ברק",
            producer_id="p1",
            pickup_code="AB12",
            total_agorot=4500,
            pickup_from="17:00",
            pickup_until="19:00",
            address="רחוב הדקל 1",
            cancel_until="16:00",
        ),
    )
    rescue_emails.send_cancel_email("a@example.com", "משק ברק")
    rescue_emails.send_business_cancel_email("a@example.com", "משק ברק")
    out.update(
        zip(["rescue.reservation", "rescue.cancel", "rescue.business_cancel"], rsent)
    )

    from app.services import registration_emails

    out["registration.shell"] = registration_emails._shell(
        "כותרת", "<tr><td>שורה</td></tr>"
    )

    from app.routers import admin, marketing

    out["admin.approved"] = admin._producer_approved_html("משק ברק", "meshek-barak")
    out["admin.rejected"] = admin._producer_rejected_html("משק ברק", "חסר מסמך")
    msent = _capture(monkeypatch, marketing)
    marketing._send_newsletter_welcome("a@example.com")
    out["marketing.newsletter_welcome"] = msent[0]

    producer = make_producer(db, name="חוות הבדיקה")
    with patch("app.routers.report_info.send_email") as mock_send:
        resp = client.post(
            "/reports/producer-info",
            json={
                "producer_slug": str(producer.id),
                "message": "הטלפון שגוי",
                "reporter_email": "r@example.com",
            },
        )
    assert resp.status_code == 204
    out["report_info"] = mock_send.call_args.kwargs.get("html")
    return out


def test_every_html_email_starts_with_the_logo(prod_site, monkeypatch, client, db):
    rendered = _render_all(monkeypatch, client, db)
    assert len(rendered) == 12, sorted(rendered)
    for label, html in rendered.items():
        _assert_logo_first(html, label)


def test_logo_url_follows_frontend_url(monkeypatch):
    monkeypatch.setattr(settings, "frontend_url", "https://staging.mehamakor.online/")
    assert (
        email_branding.email_logo_url()
        == "https://staging.mehamakor.online/email-logo.png"
    )
    assert 'alt="מהמקור"' in email_logo_html()


FRONTEND_PUBLIC = Path(__file__).resolve().parents[1] / "frontend" / "public"
EMAIL_LOGO_SVG = FRONTEND_PUBLIC / "logo-horizontal-he-no-tagline.svg"
EMAIL_LOGO_PNG = FRONTEND_PUBLIC / "email-logo.png"
TAGLINE = "אוכל טוב לא שומרים לעצמנו"


def _png_size(path: Path) -> tuple[int, int]:
    """(width, height) from the IHDR chunk — no imaging dependency."""
    head = path.read_bytes()[:24]
    assert head[:8] == b"\x89PNG\r\n\x1a\n" and head[12:16] == b"IHDR", path
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


def _viewbox(svg: str) -> tuple[float, float]:
    m = re.search(r'<svg\b[^>]*\bviewBox="([^"]+)"', svg)
    assert m, "no viewBox on the <svg> root"
    _, _, w, h = (float(v) for v in m.group(1).split())
    return w, h


def test_email_logo_has_no_tagline():
    """MEH-2875 (Sapir, option ב): the email header is mark + «מהמקור», no tagline.

    The PNG is rendered from logo-horizontal-he-no-tagline.svg at its viewBox, so
    (1) that SVG must not carry the tagline anywhere (a <text>, the aria-label),
    and (2) the PNG must have the SVG's aspect ratio. The lockup WITH the tagline
    is ~3.4:1 (240×70); without it ~4:1 (240×60) — restoring the old PNG fails (2).
    """
    svg = EMAIL_LOGO_SVG.read_text(encoding="utf-8")
    assert TAGLINE not in svg, f"{EMAIL_LOGO_SVG.name} still carries the tagline"
    assert svg.count("<text") == 1 and ">מהמקור</text>" in svg, (
        "expected exactly one <text>, the wordmark"
    )
    vb_w, vb_h = _viewbox(svg)
    png_w, png_h = _png_size(EMAIL_LOGO_PNG)
    assert png_w == 240, f"email-logo.png is {png_w}px wide, want 240 (@2x of 120)"
    assert abs(png_h / png_w - vb_h / vb_w) < 0.01, (
        f"email-logo.png {png_w}×{png_h} (h/w {png_h / png_w:.3f}) does not match "
        f"{EMAIL_LOGO_SVG.name} viewBox {vb_w}×{vb_h} (h/w {vb_h / vb_w:.3f})"
    )
    # The <img> box must keep the PNG's proportions (Outlook sizes from the attribute).
    assert email_branding.EMAIL_LOGO_HEIGHT == round(120 * png_h / png_w), (
        email_branding.EMAIL_LOGO_HEIGHT
    )


def _logo_calls(src: str) -> int:
    """Real calls only — a comment or a string that names the function is not a call."""
    return sum(
        1
        for node in ast.walk(ast.parse(src))
        if isinstance(node, ast.Call)
        and getattr(node.func, "id", getattr(node.func, "attr", None))
        == "email_logo_html"
    )


def test_scan_counts_documents_and_calls_the_way_it_claims():
    """The scan's two counters, on inputs whose answers are known."""
    assert len(HTML_DOC.findall('x = "<HTML lang=he dir=rtl>"')) == 1
    assert len(HTML_DOC.findall('x = "<html>"')) == 1
    assert len(HTML_DOC.findall("docs: the `<html` template")) == 0
    assert _logo_calls("# email_logo_html() in a comment\nx = 1") == 0
    assert _logo_calls("x = f'{email_logo_html()}'") == 1
    assert _logo_calls("logo = email_logo_html()") == 1


def test_no_html_email_in_the_backend_without_the_logo():
    """One real email_logo_html() call per HTML document, per file."""
    checked = {}
    for path in sorted(BACKEND_APP.rglob("*.py")):
        src = path.read_text(encoding="utf-8")
        docs = len(HTML_DOC.findall(src))
        if not docs:
            continue
        calls = _logo_calls(src)
        checked[str(path.relative_to(BACKEND_APP))] = (docs, calls)
        assert calls >= docs, (
            f"{path.relative_to(BACKEND_APP)}: {docs} HTML document(s), {calls} logo call(s)"
        )
    # Control: the scan must have found the files it exists for, or it proves nothing.
    # MEH-2974 moved both numbers by exactly one: `send_owner_invite_email` is a
    # fifth HTML document in auth_emails.py, and it carries `email_logo_html()`
    # like the other four. The pin is the control — it is what makes "every HTML
    # email has the logo" a measurement rather than a scan that found nothing.
    assert checked.get("services/auth_emails.py") == (5, 5), checked
    assert sum(d for d, _ in checked.values()) == 13, checked
