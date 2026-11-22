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
          registration_emails._shell, so there is one frame, not two);
          MEH-3621 (every hand-built template — auth, newsletter, rescue,
          weekly summary, admin approve/reject, reports, owner detach — now
          calls frame(); added footer_html, note_row and an optional body cell;
          tests/test_meh3621_email_frame_parts.py)
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
# «לדף העסק: https://…» at the end of a line, optionally after a sentence
# («…10:00–11:00. לאישור: https://…»): the words after the last sentence
# break and before the colon are the button label.
# A button label is a short call to action. Anything longer is a sentence
# (MEH-3587 review: «את כל השריונים… בלוח הבקרה:» became a 45-letter button);
# the sentence stays text and the address gets the generic label.
MAX_LABEL = 32
_TAIL_LABEL_URL = re.compile(
    r"(?:^|(?<=[.!?] ))(?P<label>[^.!?:：\n]{2,%d})\s*[:：]\s*(?P<url>https?://\S+)$"
    % MAX_LABEL
)
_SENTENCE_BREAK = re.compile(r"[.!?]\s")
_TRAILING_PUNCT = ".,;:!?…)]»\"'׳״"
# An opt-out is never the main action of an email, so it is never the filled
# button (the weekly summary's «להפסקת הסיכום השבועי»).
_OPT_OUT = re.compile(r"^(ל?הפסק|ל?הסר|ל?ביטול|לא רוצה)")

# Copy for an address that had no words of its own in the text body.
BARE_URL_LABEL = "לפתיחה"
INLINE_URL_LABEL = "לקישור"
# The frame's footer already signs «צוות מהמקור»; a text body that ends with
# the same sign-off would print it twice in the HTML part.
_SIGNOFF = "צוות מהמקור"


def frame(
    heading: str, rows_html: str, button_html: str = "", footer_html: str = ""
) -> str:
    """The branded document. Every argument is already HTML.

    `rows_html` is the body text cell; pass "" when the email brings its own
    `<tr>` rows in `button_html` (a code box, a table). `footer_html` sits above
    the «צוות מהמקור» line (an unsubscribe link). MEH-3621.
    """
    body_row = (
        f'<tr><td style="padding:18px 22px 6px;text-align:right;font-size:15px;color:{TEXT};line-height:1.8;">{rows_html}</td></tr>'
        if rows_html
        else ""
    )
    footer = f"{footer_html}<br>\n        " if footer_html else ""
    return f"""\
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:{PAGE_BG};direction:rtl;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:{PAGE_BG};padding:24px 12px;direction:rtl;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;margin:0 auto;">
      <tr><td style="text-align:right;padding:0 4px 14px;">{email_logo_html()}</td></tr>
      <tr><td style="background:#ffffff;border-radius:14px;border:1px solid {CARD_BORDER};overflow:hidden;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="background:{BRAND};color:#ffffff;padding:18px 22px;text-align:right;font-size:19px;font-weight:bold;line-height:1.4;">{heading}</td></tr>
          {body_row}
          {button_html}
        </table>
      </td></tr>
      <tr><td style="text-align:center;padding:14px 4px 0;font-size:12px;color:{MUTED};line-height:1.6;">{footer}צוות מהמקור</td></tr>
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


def note_row(html: str) -> str:
    """A small muted row under the button: validity, «ignore if…», the raw link.
    MEH-3620: what the hand-built templates printed below their button."""
    if not html.strip():
        return ""
    return (
        f'<tr><td style="padding:6px 22px 18px;text-align:right;font-size:13px;'
        f'color:{MUTED};line-height:1.7;">{html}</td></tr>'
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


def _short_label(text: str) -> str | None:
    label = text.rstrip(":：").strip()
    if 2 <= len(label) <= MAX_LABEL and not _SENTENCE_BREAK.search(label + " "):
        return label
    return None


def _actions(lines: list[str]) -> list[tuple[str, str | None, str]]:
    """Each line as ("text", None, line) or ("button", label, url), in order.

    Shapes: «label: URL» (alone or ending a sentence), «label:» then a URL
    line, and a bare URL line. A label that reads as a sentence stays text.
    """
    out: list[tuple[str, str | None, str]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        tail = _TAIL_LABEL_URL.search(line)
        if tail and not _URL.search(tail.group("label")):
            before = line[: tail.start()].strip()
            if before:
                out.append(("text", None, before))
            out.append(
                (
                    "button",
                    tail.group("label").strip(),
                    _split_url(tail.group("url"))[0],
                )
            )
        elif line.endswith((":", "：")) and _URL.fullmatch(_split_url(nxt)[0] or "-"):
            label = _short_label(line)
            if label is None:
                out.append(("text", None, line))
            out.append(("button", label or BARE_URL_LABEL, _split_url(nxt)[0]))
            i += 1
        elif _URL.fullmatch(_split_url(line)[0] or "-"):
            out.append(("button", BARE_URL_LABEL, _split_url(line)[0]))
        else:
            out.append(("text", None, line))
        i += 1
    return out


def _drop_signoff(paras: list[list[str]]) -> list[list[str]]:
    """Remove a closing «צוות מהמקור» (and a «בברכה,» right above it) only."""
    if not paras or paras[-1][-1] != _SIGNOFF:
        return paras
    last = paras[-1][:-1]
    if last and last[-1].rstrip(",") in ("בברכה", "תודה"):
        last = last[:-1]
    return paras[:-1] + ([last] if last else [])


def text_to_html(subject: str, body: str) -> str:
    """The branded HTML part for an email written as plain text.

    Paragraphs keep their order; a link line becomes a button where it stood,
    so a button sits next to the sentence that introduced it.
    """
    rows: list[str] = []
    text: list[str] = []
    buttons: list[str] = []
    primary_used = False

    def flush() -> None:
        if text:
            rows.append('<p style="margin:0 0 14px;">' + "<br>".join(text) + "</p>")
            text.clear()
        if buttons:
            rows.append(
                '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" '
                f'style="margin:0 0 14px;">{"".join(buttons)}</table>'
            )
            buttons.clear()

    for para in _drop_signoff(_paragraphs(body)):
        for kind, label, value in _actions(para):
            if kind == "text":
                if buttons:
                    flush()
                text.append(_inline(value))
                continue
            label = label or BARE_URL_LABEL
            primary = not primary_used and not _OPT_OUT.match(label)
            primary_used = primary_used or primary
            if text and not buttons:
                flush()
            buttons.append(button(value, label, primary=primary))
        flush()
    return frame(html_escape(heading_from_subject(subject)), "".join(rows))
