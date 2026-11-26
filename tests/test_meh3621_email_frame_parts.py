"""MEH-3621 — the frame() parts the hand-built templates needed when they moved
onto email_layout.frame(): an empty body cell, a footer line, a note row.
"""
from __future__ import annotations

from app.services.email_layout import button, frame, note_row


def test_empty_rows_leave_no_empty_body_cell() -> None:
    with_rows = frame("כותרת", "גוף")
    without = frame("כותרת", "", "<tr><td>קוד</td></tr>")
    assert "padding:18px 22px 6px" in with_rows
    assert "padding:18px 22px 6px" not in without
    assert "<tr><td>קוד</td></tr>" in without


def test_footer_html_sits_above_the_signature() -> None:
    html = frame("כותרת", "גוף", footer_html='<a href="https://x.example/u">להפסקה</a>')
    # MEH-3594: the signature is email_signoff_html() (flower mark + name).
    assert html.index("להפסקה") < html.index("צוות מהמקור</span></td>")
    assert "להפסקה" not in frame("כותרת", "גוף")


def test_note_row_is_muted_and_empty_input_adds_nothing() -> None:
    assert note_row("   ") == ""
    row = note_row("הקישור תקף ל-24 שעות.")
    assert row.startswith("<tr><td") and "הקישור תקף ל-24 שעות." in row
    assert "font-size:13px" in row


def test_the_body_declares_rtl() -> None:
    """Gmail and Outlook inherit direction from <body>; MEH-2151 checks it on
    the approval email, and every email shares this body now."""
    html = frame("כותרת", "גוף", button("https://x.example", "לחצו"))
    body_tag = html[html.index("<body"): html.index(">", html.index("<body"))]
    assert "direction:rtl" in body_tag


def test_frame_asks_mail_apps_to_keep_it_light():
    """MEH-3916: Apple Mail and the Outlook apps honour color-scheme and leave
    a «light only» email in its own colours instead of darkening it. Gmail
    ignores the tag and recolours anyway; the logo badge covers that case."""
    html = frame("x", "y")
    head = html[: html.index("</head>")]
    assert '<meta name="color-scheme" content="light only">' in head
    assert '<meta name="supported-color-schemes" content="light only">' in head
