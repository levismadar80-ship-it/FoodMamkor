"""
Module:   test_meh0000_email_frame
Purpose:  Every HTML email shares one frame: RTL, a viewport meta, only palette
          colours, and no non-production host in any link. Each of the four was
          already true of SOME templates and silently false of others, and
          nothing checked any of them.
Does NOT: render the templates or assert their words. tests/test_email_logo.py
          owns "every HTML mail starts with the logo";
          test_meh1965_email_copy_contract.py and test_meh2151_* own the copy.
          This file owns the FRAME, and reads source rather than rendering,
          which is the shape test_email_logo.py:221 already established here.
Related:  backend/app/services/{auth_emails,registration_emails,rescue_emails,
          rescue_no_show,admin_producer_emails,weekly_owner_summary}.py,
          backend/app/routers/{marketing,report_info}.py,
          frontend/tailwind.tokens.json (the palette).
History:  MEH-0000 (creation. Measured before the fix: 7 templates with no
          viewport meta, 55 off-palette colour literals, one mail with no frame
          at all, and FRONTEND_URL defaulting to http://localhost:3000 with
          nothing in production to stop it.)
"""

from __future__ import annotations

import json
import pathlib
import re

import pytest

REPO = pathlib.Path(__file__).resolve().parents[1]
BACKEND_APP = REPO / "backend" / "app"
TOKENS = REPO / "frontend" / "tailwind.tokens.json"

HTML_DOC = re.compile(r"<html[\s>]", re.IGNORECASE)
COMMENT_LINE = re.compile(r"^\s*#")
HEAD_TAG = re.compile(r"<head>.*?</head>", re.IGNORECASE | re.DOTALL)
VIEWPORT = re.compile(r'<meta\s+name="viewport"', re.IGNORECASE)
# A colour literal, only on a line that is doing styling. A bare "#3054" in
# prose is a PR reference, and backend/app has several.
STYLED_LINE = re.compile(r"style=|background|color:|border")
HEX = re.compile(r"#([0-9a-fA-F]{3,8})\b")
NON_PRODUCTION_HOST = re.compile(r"https?://[^\"'\s]*(localhost|127\.0\.0\.1|staging|vercel\.app)")


def _palette() -> set[str]:
    """Every colour the design tokens define, lowercased."""
    found: set[str] = set()

    def walk(node: object) -> None:
        if isinstance(node, dict):
            for value in node.values():
                walk(value)
        elif isinstance(node, str) and node.startswith("#"):
            found.add(node.lower())

    walk(json.loads(TOKENS.read_text(encoding="utf-8")))
    return found


def _code(path: pathlib.Path) -> str:
    """The file with `#` comment lines blanked, keeping line numbers.

    Prose about markup is not markup. The first run of this guard reported
    rescue_no_show.py as an HTML document with no <head> — the only match was
    a comment in that file saying the mail used to have "no <html>". The
    sibling scan in test_email_logo.py has the same blind spot and works
    around it by never writing the tag in prose; blanking comments is the
    version that does not depend on everyone remembering that.

    Blind spot left on purpose: a DOCSTRING describing markup still counts.
    Narrowing further would need a parser, and the failure mode is a loud
    false positive, not a silent miss.
    """
    return "\n".join(
        "" if COMMENT_LINE.match(line) else line
        for line in path.read_text(encoding="utf-8").splitlines()
    )


def _html_files() -> list[pathlib.Path]:
    return [
        path
        for path in sorted(BACKEND_APP.rglob("*.py"))
        if HTML_DOC.search(_code(path))
    ]


FILES = _html_files()


def test_the_scan_found_the_templates_at_all() -> None:
    """The control, and it runs first.

    Every assertion below is parametrised over FILES or loops over matches. An
    empty FILES, or a regex that matches nothing, satisfies "no template is
    missing a viewport" and "no colour is off-palette" at the same time — a
    broken scan would read as a clean bill of health. It is also the exact
    failure mode `.claude/rules/testing.md` names: a probe whose null output is
    also its reassuring output.
    """
    assert len(FILES) >= 6, f"only {len(FILES)} file(s) with an HTML document: {FILES}"
    names = {path.name for path in FILES}
    for expected in ("auth_emails.py", "registration_emails.py", "rescue_emails.py"):
        assert expected in names, f"{expected} not found by the scan; names={sorted(names)}"
    assert len(_palette()) > 20, "the palette parsed to almost nothing"


def test_prose_about_markup_is_not_markup() -> None:
    """The regression in the guard itself, pinned.

    Its first run flagged rescue_no_show.py — whose only match was a COMMENT
    saying the mail used to have no <html>. A guard that reports its own
    documentation is a guard people learn to ignore.
    """
    import tempfile

    with tempfile.TemporaryDirectory() as directory:
        path = pathlib.Path(directory) / "x.py"
        path.write_text("# the old mail had no <html> and no <head>\nX = 1\n", encoding="utf-8")
        assert not HTML_DOC.search(_code(path))
        path.write_text('X = "<html dir=\'rtl\'>"\n', encoding="utf-8")
        assert HTML_DOC.search(_code(path)), "blanking comments must not blank code"


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_every_html_document_is_rtl(path: pathlib.Path) -> None:
    src = _code(path)
    opens = re.findall(r"<html[^>]*>", src, re.IGNORECASE)
    assert opens, f"{path.name}: HTML_DOC matched but no <html ...> tag was captured"
    for tag in opens:
        assert 'dir="rtl"' in tag, f"{path.name}: {tag} has no dir=\"rtl\" — Hebrew needs it"


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_every_html_document_sets_a_viewport(path: pathlib.Path) -> None:
    """Without it a phone renders the mail at desktop width and scales it down.

    Seven templates shipped without one (the six in auth_emails.py and
    report_info.py) while the five newer ones had it — the drift this catches.
    """
    src = _code(path)
    heads = HEAD_TAG.findall(src)
    assert heads, f"{path.name}: an HTML document with no <head> at all"
    for head in heads:
        assert VIEWPORT.search(head), (
            f"{path.name}: <head> with no viewport meta. Add "
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
        )


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_every_colour_is_a_palette_colour(path: pathlib.Path) -> None:
    palette = _palette()
    offenders: list[tuple[int, str]] = []
    for number, line in enumerate(_code(path).splitlines(), 1):
        if not STYLED_LINE.search(line):
            continue
        for match in HEX.finditer(line):
            value = match.group(0).lower()
            if len(match.group(1)) not in (3, 4, 6, 8):
                continue  # not a colour: "#3054" is a PR reference
            if value not in palette:
                offenders.append((number, value))
    assert not offenders, (
        f"{path.name}: colour(s) outside frontend/tailwind.tokens.json: {offenders}. "
        "Nearest tokens: text #1C1A17 · fg-muted #5C584F · muted #6B6860 · border #E5DFD3."
    )


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_no_template_hardcodes_a_non_production_host(path: pathlib.Path) -> None:
    """Links are built from settings.frontend_url; none may be baked in.

    This is the half a test CAN see. The other half — that frontend_url itself
    is the production site — is a boot-time concern; see the MEH-0000 note in
    docs/audits/2026-11-email-frame.md.
    """
    hits = [
        (number, line.strip())
        for number, line in enumerate(_code(path).splitlines(), 1)
        if NON_PRODUCTION_HOST.search(line)
    ]
    assert not hits, f"{path.name}: non-production host in a template: {hits}"
