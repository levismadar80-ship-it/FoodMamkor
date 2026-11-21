"""
Module:   email_layout
Purpose:  The ONE branded frame every email is sent in (MEH-3587). Logo on the
          public origin, white card on the site's warm background, RTL,
          viewport, the green heading bar, the «צוות מהמקור» footer.
          `frame()` is used by the hand-built HTML templates; `text_to_html()`
          turns a plain-text body into the same frame, so an email that only
          has text still arrives designed, and a «label: URL» line becomes a
          button instead of a raw address.
Touches:  nothing (pure string building).
Does NOT: send (services/email.py does, and calls text_to_html() for every
          send that has no html), decide copy, or change the text part — the
          plain-text body still goes out exactly as written.
Related:  services/email.py::_deliver (the single place text_to_html runs),
          services/email_branding.py (the logo), services/registration_emails.py
          (_shell is this frame), tests/test_meh3587_email_layout.py
History:  MEH-3587 (creation; moved the frame here from
          registration_emails._shell, so there is one frame, not two)
"""

from __future__ import annotations

import re
from html import escape as html_escape

from app.services.email_branding import email_logo_html

# The site palette (frontend/tailwind.tokens.json), same values the
# hand-built templates use since the 17/11 frame audit.
BRAND = "#2e6853"
PAGE_BG = "#F5F0E8"
TEXT = "#1c1a17"
MUTED = "#5C584F"
CARD_BORDER = "#e5dfd3"

# A subject reads «מהמקור — X» or «מהמקור - X» in the inbox; inside the email
# the logo already says «מהמקור», so the heading drops that prefix.
_BRAND_PREFIX = re.compile(r"^\s*מהמקור\s*[—–-]\s*")
_URL = re.compile(r"https?://[^\s<>\"']+")
# «לדף העסק: https://…» — a label, a colon, a URL and nothing else.
_LABEL_URL = re.compile(r"^(?P<label>[^:：]{2,60}?)\s*[:：]\s*(?P<url>https?://\S+)$")
_TRAILING_PUNCT = ".,;)»\"'"

# Copy for an address that had no words of its own in the text body.
BARE_URL_LABEL = "לפתיחה"
INLINE_URL_LABEL = "לקישור"
# The frame's footer already signs «צוות מהמקור»; a text body that ends with
# the same sign-off would print it twice in the HTML part.
_SIGNOFF = "צוות מהמקור"


def frame(heading: str, rows_html: str, button_html: str = "") -> str:
    """The branded document. `heading` and `rows_html` are already HTML."""
    return f"""\
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:{PAGE_BG};">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:{PAGE_BG};padding:24px 12px;direction:rtl;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;margin:0 auto;">
      <tr><td style="text-align:right;padding:0 4px 14px;">{email_logo_html()}</td></tr>
      <tr><td style="background:#ffffff;border-radius:14px;border:1px solid {CARD_BORDER};overflow:hidden;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="background:{BRAND};color:#ffffff;padding:18px 22px;text-align:right;font-size:19px;font-weight:bold;line-height:1.4;">{heading}</td></tr>
          <tr><td style="padding:18px 22px 6px;text-align:right;font-size:15px;color:{TEXT};line-height:1.8;">{rows_html}</td></tr>
          {button_html}
        </table>
      </td></tr>
      <tr><td style="text-align:center;padding:14px 4px 0;font-size:12px;color:{MUTED};">צוות מהמקור</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""


def button(url: str, label: str, primary: bool = True) -> str:
    """A table-row button that renders in Outlook too (no CSS-only button)."""
    e = html_escape
    look = (
        f"background:{BRAND};color:#ffffff;border:2px solid {BRAND};"
        if primary
        else f"background:#ffffff;color:{BRAND};border:2px solid {BRAND};"
    )
    return (
        '<tr><td style="padding:8px 22px 8px;text-align:center;">'
        f'<a href="{e(url)}" style="display:inline-block;{look}text-decoration:none;'
        "font-size:15px;font-weight:bold;padding:11px 28px;border-radius:10px;"
        f'">{e(label)}</a></td></tr>'
    )


def heading_from_subject(subject: str) -> str:
    return _BRAND_PREFIX.sub("", " ".join((subject or "").split())) or "מהמקור"


def _split_url(token: str) -> tuple[str, str]:
    """A URL glued to sentence punctuation: «…/x.» → («…/x», «.»)."""
    stripped = token.rstrip(_TRAILING_PUNCT)
    return stripped, token[len(stripped) :]


def _inline(line: str) -> str:
    """Escape a line; any URL inside a sentence becomes a short link."""
    out, last = [], 0
    for m in _URL.finditer(line):
        url, tail = _split_url(m.group(0))
        out.append(html_escape(line[last : m.start()]))
        out.append(
            f'<a href="{html_escape(url)}" style="color:{BRAND};font-weight:bold;">'
            f"{INLINE_URL_LABEL}</a>{html_escape(tail)}"
        )
        last = m.end()
    out.append(html_escape(line[last:]))
    return "".join(out)


def _paragraphs(body: str) -> list[list[str]]:
    paras: list[list[str]] = [[]]
    for raw in (body or "").replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if not line:
            if paras[-1]:
                paras.append([])
            continue
        paras[-1].append(line)
    return [p for p in paras if p]


def _actions(lines: list[str]) -> tuple[list[str], list[tuple[str, str]]]:
    """Pull the «label: URL», «label:» + URL and bare-URL lines out as buttons."""
    text: list[str] = []
    actions: list[tuple[str, str]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        m = _LABEL_URL.match(line)
        if m and not _URL.search(m.group("label")):
            actions.append((m.group("label").strip(), _split_url(m.group("url"))[0]))
        elif line.endswith((":", "：")) and _URL.fullmatch(nxt):
            actions.append((line[:-1].strip(), _split_url(nxt)[0]))
            i += 1
        elif _URL.fullmatch(line):
            actions.append((BARE_URL_LABEL, _split_url(line)[0]))
        else:
            text.append(line)
        i += 1
    return text, actions


def text_to_html(subject: str, body: str) -> str:
    """The branded HTML part for an email written as plain text.

    Paragraphs keep their order; a link line becomes a button where it stood,
    so a button sits next to the sentence that introduced it.
    """
    rows: list[str] = []
    paras = _paragraphs(body)
    if paras and paras[-1][-1] == _SIGNOFF:
        paras = paras[:-1]
    for para in paras:
        text, actions = _actions(para)
        if text:
            rows.append(
                '<p style="margin:0 0 14px;">'
                + "<br>".join(_inline(t) for t in text)
                + "</p>"
            )
        if actions:
            buttons = "".join(
                button(url, label, primary=(n == 0))
                for n, (label, url) in enumerate(actions)
            )
            rows.append(
                '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" '
                f'style="margin:0 0 14px;">{buttons}</table>'
            )
    return frame(html_escape(heading_from_subject(subject)), "".join(rows))
