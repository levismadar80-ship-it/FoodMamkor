"""
Module:   test_meh2151_approval_email_cta
Purpose:  Lock the MEH-2151 restructure of the producer-approval email — a
          view-page CTA and a dashboard link in BOTH parts, an HTML part that
          declares RTL, and a view-page block that vanishes whole when the
          producer has no slug.
Touches:  Nothing. The builders are pure; the one endpoint test monkeypatches
          `_send_notification_email` and never reaches Resend.
Does NOT: re-assert what MEH-2134 owns — the community paragraph's text, the
          founder signature, and the invite-absent degradation all live in
          `tests/test_meh2134_approval_email_community.py`, which holds the
          byte-exact body. This file asserts the properties MEH-2151 adds, plus
          the ONE overlap it cannot delegate: that the community block sits
          BELOW both links (ordering is this ticket's, the text is that one's).
          It also does not police the four copy-contract axes — absolute links,
          no masculine address, RTL markup, real text fallback — which
          `tests/test_meh1965_email_copy_contract.py` applies to both parts via
          its corpus.
Related:  backend/app/routers/admin.py (_producer_approved_body,
          _producer_approved_html, _approval_links, _send_notification_email),
          backend/app/services/email.py (send_email's `html` argument).
History:  MEH-2151 (creation, 2026-08-21).

WHY AN ENDPOINT TEST SITS IN A FILE OF PURE-RENDERING TESTS
-----------------------------------------------------------
Every other assertion here calls a builder directly. Those alone would pass in
a world where `admin.py`'s approval handler never passes `html=` at all — both
builders would be perfect and every producer would still receive the
text-only mail this ticket exists to replace. That is the "census that never
called the endpoint it censused" failure named in `.claude/rules/testing.md`:
a test counted as coverage while being green with the whole fix deleted.
`test_the_approval_endpoint_sends_both_parts_with_the_real_slug` is the one
assertion that goes red if the call site regresses, and it is why the file's
count of covering tests is honest.
"""

import inspect
import re

import pytest

import app.routers.admin as admin_module
from app.config import settings
from app.routers.admin import (
    _APPROVED_COMMUNITY_BLOCK,
    _APPROVED_DASHBOARD_LABEL,
    _APPROVED_HTML_BUTTON_LABEL,
    _APPROVED_HTML_DASHBOARD_LABEL,
    _APPROVED_VIEW_PAGE_LABEL,
    _producer_approved_body,
    _producer_approved_html,
)
from conftest import auth_header, make_producer, make_user

NAME = "משק הר הפרחים"
SLUG = "meshek-har-haprachim"
PAGE_URL = f"{settings.frontend_url}/p/{SLUG}"
DASHBOARD_URL = f"{settings.frontend_url}/producer/dashboard"

TEST_IMAGE = "https://res.cloudinary.com/demo/image/upload/v1/test.jpg"
FAKE_INVITE_URL = "https://example.invalid/meh2151-fake-invite-not-a-real-link"

# Every falsy-or-blank slug the column can hand the builders. `"   "` is the
# one that matters: it is TRUTHY, so a guard written without `.strip()` emits
# a label above a URL ending in "/p/   " — a dangling label reached by the one
# input nobody sets deliberately (same reasoning as MEH-2134's whitespace case
# for the invite URL).
NO_SLUG_VALUES = [None, "", "   "]


def _admin(db):
    return make_user(db, role="admin")


# --- control ----------------------------------------------------------------
#
# `.claude/rules/testing.md`: a probe whose null output is also its reassuring
# output is not evidence. Several assertions below are of the form "X is NOT in
# the rendered part". Every one of them is green against an empty string, so
# they are worth nothing unless the builders actually produce a body first.


def test_control_both_builders_render_non_trivial_parts():
    """Run FIRST. If this fails, every absence assertion below is void.

    Not a duplicate of the ordering test: that one asserts what the parts
    contain, this one asserts that there ARE parts. A builder returning "" would
    satisfy every `not in` assertion in this file and fail only here.
    """
    text = _producer_approved_body(NAME, SLUG)
    html = _producer_approved_html(NAME, SLUG)
    assert len(text) > 100, f"text part is trivial ({len(text)} chars)"
    assert len(html) > 500, f"html part is trivial ({len(html)} chars)"
    assert re.search("[֐-׿]", text), "text part carries no Hebrew"
    assert re.search("[֐-׿]", html), "html part carries no Hebrew"


# --- the text part: order ---------------------------------------------------


def test_text_part_orders_the_blocks_greeting_to_signature():
    """The order IS the ticket: the mail announced "הפרופיל שלך כעת גלוי" and
    then offered no way to look at it, so the proof-link has to arrive
    immediately after the claim, and the community invite — the secondary
    action — has to fall below both links.

    Asserted as a strictly increasing sequence of positions rather than as
    separate presence checks. Presence cannot see an ordering regression, which
    is the only thing this ticket changed about blocks that already existed.
    """
    body = _producer_approved_body(NAME, SLUG)

    markers = [
        ("greeting", "היי,"),
        ("approval line", "אושר במהמקור!"),
        ("view-page label", _APPROVED_VIEW_PAGE_LABEL),
        ("page url", PAGE_URL),
        ("dashboard label", _APPROVED_DASHBOARD_LABEL),
        ("dashboard url", DASHBOARD_URL),
        ("signature", "ספיר שנפ"),
    ]

    positions = []
    for label, needle in markers:
        idx = body.find(needle)
        assert idx != -1, f"{label} ({needle!r}) missing from the text part"
        positions.append((label, idx))

    for (prev_label, prev), (label, cur) in zip(positions, positions[1:]):
        assert prev < cur, (
            f"{label} appears before {prev_label} in the text part "
            f"({cur} < {prev}) — the block order is part of the approved copy."
        )


def test_community_block_sits_below_both_links(monkeypatch):
    """The one MEH-2134 overlap this file cannot delegate.

    MEH-2134 owns the community paragraph's TEXT and asserts it byte-exactly.
    Where it sits relative to the two new links is MEH-2151's decision, and no
    assertion in that file constrains it — reorder the blocks and its
    full-string equality would go red for the right reason but the wrong
    description. Stated here in the terms this ticket used.
    """
    monkeypatch.setattr(
        settings, "whatsapp_community_invite_url", FAKE_INVITE_URL, raising=False
    )
    body = _producer_approved_body(NAME, SLUG)

    community_at = body.find(_APPROVED_COMMUNITY_BLOCK)
    assert community_at != -1, "community block missing while the invite is set"
    assert body.find(PAGE_URL) < community_at
    assert body.find(DASHBOARD_URL) < community_at
    assert community_at < body.find("ספיר שנפ")


# --- the slug guard ---------------------------------------------------------


@pytest.mark.parametrize("slug", NO_SLUG_VALUES, ids=["none", "empty", "whitespace"])
def test_falsy_slug_omits_the_view_page_block_from_the_text_part(slug):
    """No label, no URL, no blank-line artifact — the block vanishes whole.

    Named after the INPUT rather than the class ("falsy"), so the ids above say
    which of the three states a failure came from. `"   "` and `""` are not the
    same bug: only the first survives a guard written without `.strip()`.
    """
    body = _producer_approved_body(NAME, slug)

    assert _APPROVED_VIEW_PAGE_LABEL not in body, "dangling view-page label"
    assert "/p/" not in body, "a page URL was built from a slug-less producer"
    assert "\n\n\n" not in body, "omitted block left a blank-line artifact"

    # The mail must still be complete, not merely free of the omitted block.
    assert _APPROVED_DASHBOARD_LABEL in body
    assert DASHBOARD_URL in body
    assert "ספיר שנפ" in body


@pytest.mark.parametrize("slug", NO_SLUG_VALUES, ids=["none", "empty", "whitespace"])
def test_falsy_slug_omits_the_primary_button_from_the_html_part(slug):
    """The HTML twin degrades the same way: the button goes, the part stays.

    The part itself must NOT disappear — a slug-less producer still needs the
    RTL fix and the dashboard link. `_EXPECT_HTML` in the copy contract carries
    the same claim from the other side.
    """
    html = _producer_approved_html(NAME, slug)

    assert _APPROVED_HTML_BUTTON_LABEL not in html, "dangling primary button"
    assert "/p/" not in html
    assert '<a href="' in html, "the whole HTML part vanished, not just the button"
    assert DASHBOARD_URL in html
    assert _APPROVED_HTML_DASHBOARD_LABEL in html


# --- both links, both parts -------------------------------------------------


@pytest.mark.parametrize("part", ["text", "html"], ids=["text", "html"])
def test_both_parts_carry_both_absolute_links(part):
    """MEH-2151's DoD, stated once and applied to each part.

    Parametrised over the part rather than written twice: a copy-pasted pair is
    free to drift, and "the button and the text line point at different places"
    is a failure that renders, sends, and reviews clean.
    """
    rendered = {
        "text": _producer_approved_body(NAME, SLUG),
        "html": _producer_approved_html(NAME, SLUG),
    }[part]

    assert PAGE_URL in rendered, f"{part} part is missing the view-page link"
    assert DASHBOARD_URL in rendered, f"{part} part is missing the dashboard link"


def test_the_two_links_are_distinct_destinations():
    """Guards the copy-paste failure the parametrisation above cannot see.

    Both assertions there would pass if `_approval_links` returned the dashboard
    URL twice. This is the assertion that is falsifiable by that specific
    regression.
    """
    # `assert PAGE_URL != DASHBOARD_URL` stood here and was DELETED, not
    # reformulated: both are module constants built from literals that cannot
    # coincide for any value of `frontend_url`, so it was entailed by its own
    # surroundings — decoration that reads as coverage
    # (`.claude/rules/testing.md`). The two counts below are the falsifiable
    # part: were `_approval_links` to return the dashboard URL twice, the first
    # would read 0 and the second 2.
    text = _producer_approved_body(NAME, SLUG)
    assert text.count(DASHBOARD_URL) == 1
    assert text.count(PAGE_URL) == 1


# --- the HTML part ----------------------------------------------------------


def test_html_part_declares_rtl_on_the_document_and_in_css():
    """Gmail does not infer direction from content — this is the whole reason
    the HTML part exists (observed 21/08: ".גלוי", the period rendered at the
    START of the line). Both cues are required and asserted separately, never
    OR-ed: `dir` alone leaves an inline BiDi run (a Latin business name
    mid-sentence) to the client's guess, and an `||` between two cues lets
    either one carry the assertion so losing the other is undetectable.
    """
    html = _producer_approved_html(NAME, SLUG)

    assert '<html dir="rtl" lang="he">' in html, "the document element is not RTL"

    # ANCHORED to <body>, not a bare `"direction:rtl" in html`. The weaker form
    # was written first and is green for two reasons: the document is correctly
    # RTL, OR some decorative descendant still carries the declaration while the
    # ancestor everything inherits from has lost it. Measured — the string
    # occurs 11 times in this template, so deleting it from <body> left the
    # substring check passing and the mail broken. The copy contract's axis
    # (`test_meh1965_email_copy_contract.py`) uses the general form on purpose;
    # this file is where the specific element is pinned.
    body_tag = re.search(r"<body style=\"([^\"]*)\">", html)
    assert body_tag, "no <body> with an inline style attribute"
    assert "direction:rtl" in body_tag.group(1), (
        "<body> does not declare direction:rtl — every descendant inherits "
        "direction from it, so this is the declaration that matters."
    )


def test_html_part_carries_the_button_and_the_brand_background():
    """The button is a background colour on a container plus a white label —
    Gmail strips <style>, so both live inline or neither works."""
    html = _producer_approved_html(NAME, SLUG)
    assert _APPROVED_HTML_BUTTON_LABEL in html
    assert "background:#2e6853" in html
    assert "color:#ffffff" in html
    assert "background:#F5F0E8" in html


def test_html_part_carries_no_emoji():
    """The text twin has none, and the two parts must read alike. The newsletter
    precedent this markup is modelled on DOES carry one, so this is the place
    the copy deliberately departs from it."""
    html = _producer_approved_html(NAME, SLUG)
    emoji = re.findall(r"[\U0001F300-\U0001FAFF☀-➿]", html)
    assert not emoji, f"emoji in the approval HTML part: {emoji}"


def test_html_part_escapes_the_business_name():
    """`name` is owner-supplied free text and reaches the builder unfiltered.

    Harmless in the text part; in the HTML part an unescaped `<` or `"` breaks
    out of the element it lands in. Asserted with a name that would close the
    surrounding paragraph and open a script tag if it were interpolated raw.
    """
    hostile = '<script>alert("x")</script>'
    html = _producer_approved_html(hostile, SLUG)

    assert "<script>" not in html, "business name was interpolated as raw markup"
    assert "&lt;script&gt;" in html, "escaped form of the name is missing"


# --- the sender wrapper -----------------------------------------------------


def test_send_notification_email_defaults_html_to_none(monkeypatch):
    """The three pre-existing callers must stay byte-identical on the wire.

    `send_email` only adds `params["html"]` when the argument is truthy, so an
    omitted argument has to arrive as None — not as "" and not as a missing
    keyword some future signature change could make positional.
    """
    captured = {}

    def _capture(to, subject, body, html=None, reply_to=None):
        captured.update(to=to, subject=subject, body=body, html=html)

    monkeypatch.setattr(admin_module, "send_email", _capture)
    admin_module._send_notification_email("her@example.com", "נושא", "גוף")

    assert captured["html"] is None
    assert captured["body"] == "גוף"


def test_send_notification_email_forwards_an_html_part_when_given_one(monkeypatch):
    """The other half: a caller that DOES pass html must reach `send_email`.

    Without this, the default-None assertion above is satisfied by a wrapper
    that drops the argument on the floor.
    """
    captured = {}

    def _capture(to, subject, body, html=None, reply_to=None):
        captured.update(html=html)

    monkeypatch.setattr(admin_module, "send_email", _capture)
    admin_module._send_notification_email(
        "her@example.com", "נושא", "גוף", html="<html dir=\"rtl\"></html>"
    )

    assert captured["html"] == '<html dir="rtl"></html>'


# --- the call site ----------------------------------------------------------


def test_the_approval_endpoint_sends_both_parts_with_the_real_slug(
    client, db, monkeypatch
):
    """The only assertion in this file that a deleted `html=` at the call site
    would turn red. See the module docstring for why it is not optional.

    It also proves the slug the handler passes is the one MEH-1817 minted during
    this very approval — a builder fed `None` here would render a correct mail
    with no CTA, which no builder-level test can distinguish from a correct one.
    """
    sent = {}

    def _capture(to_email, subject, body, html=None):
        sent.update(to=to_email, subject=subject, body=body, html=html)

    monkeypatch.setattr(admin_module, "_send_notification_email", _capture)
    # The WhatsApp hook is a separate side effect with its own suite; silence it
    # so a Meta-template failure cannot red this test for an unrelated reason.
    monkeypatch.setattr(admin_module, "notify_producer_approved", lambda *a, **k: None)

    producer = make_producer(
        db, status="pending", images=[TEST_IMAGE], phone_verified=True
    )
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()

    resp = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.slug, "MEH-1817 mints a slug on approval — precondition failed"
    expected_page = f"{settings.frontend_url}/p/{producer.slug}"

    assert sent["to"] == owner.email
    assert sent["html"], "the approval send carried no HTML part"
    for part_name in ("body", "html"):
        assert expected_page in sent[part_name], (
            f"{part_name} does not link to /p/{producer.slug} — the handler did "
            f"not pass the minted slug through."
        )
        assert DASHBOARD_URL in sent[part_name]
    assert 'dir="rtl"' in sent["html"]


# --- the escaping invariant, checked rather than claimed ---------------------
#
# Added on the MEH-2151 follow-up. The CI reviewer on PR #3054 found that
# `_producer_approved_html`'s docstring guaranteed "EVERY interpolated value
# goes through escape()" while three constants were interpolated raw. The
# sentence was the only thing asserting the property, and a docstring is the
# artifact least likely to be re-read — `.claude/rules/testing.md`, "the
# artifact that asserts coverage is the one least likely to be checked".
#
# So the property is parsed out of the real function's source instead. Escaping
# the three sites fixes today; this fixes the class.


def _raw_interpolation_sites(source: str) -> list[str]:
    """Every `{...}` in an f-string that is NOT wrapped in `_html_escape(...)`.

    Extracted so the self-test below can run it against inputs whose answers are
    known, without mutating the shipped function. The self-test and the real
    check call THIS function, never a copy — a second copy is free to drift from
    the one that matters.

    Locals holding already-escaped fragments (`button`, `community`) and the
    pre-escaped `safe_name` are allowed by name: they are built above the return
    from values this same rule already covers, so requiring a second escape
    would double-encode them.
    """
    allowed_locals = {"button", "community", "safe_name"}
    return [
        site
        for site in re.findall(r"\{([^{}]+)\}", source)
        if not site.startswith("_html_escape(") and site not in allowed_locals
    ]


def test_escape_probe_discriminates():
    """Run the classifier FIRST, on three inputs whose answers are known.

    If it cannot tell a wrapped interpolation from a raw one, nothing it reports
    about the real function afterwards is worth reading — and its reassuring
    output (an empty list) is exactly what a dead probe returns.
    """
    wrapped = 'f"{_html_escape(SITE_DOMAIN)}</p>"'
    raw = 'f"{SITE_DOMAIN}</p>"'
    allowed = 'f"{button}\\n{community}"'

    assert _raw_interpolation_sites(wrapped) == []
    assert _raw_interpolation_sites(raw) == ["SITE_DOMAIN"]
    assert _raw_interpolation_sites(allowed) == []
    # Anchored to a real file from this repo, not only to synthetic strings
    # (MEH-1909): a probe proven on shapes I invented has not been shown to
    # recognise the shape this repo actually uses.
    real = inspect.getsource(_producer_approved_html)
    assert re.search(r"\{[^{}]+\}", real), (
        "the real function carries no interpolation at all — the check below "
        "would be vacuously green"
    )


def test_every_interpolation_in_the_html_builder_is_escaped():
    """The docstring's "EVERY interpolated value" claim, made falsifiable.

    Un-wrap any one site and this goes red naming it. Proven by construction on
    the follow-up: against the pre-fix source it reported exactly the three the
    CI reviewer found — `_APPROVED_HTML_BUTTON_LABEL`,
    `_APPROVED_HTML_DASHBOARD_LABEL`, `SITE_DOMAIN`.
    """
    raw = _raw_interpolation_sites(inspect.getsource(_producer_approved_html))
    assert raw == [], (
        f"unescaped interpolation(s) in _producer_approved_html: {raw}. Every "
        f"value reaching the markup goes through _html_escape() — the "
        f"docstring says so, and this is what makes that true."
    )


# --- the mobile-width contract (MEH-2151 fix round, 22/08) -------------------
#
# The Visual QA on staging 88e9717f measured `scrollWidth=560` against
# `innerWidth=375` and a button label clipped to «עסק». Cause: the HTML `width`
# ATTRIBUTE beats the CSS `max-width` sitting beside it, so `width="560"` won,
# and a shrink-to-fit client scaled the 46px button to ~31px physical — under
# the 44px minimum.
#
# Anchored to the specific tag, exactly like the `<body>` direction:rtl
# assertion above and for the same reason: a bare `'width="100%"' in html`
# would be satisfied by the OUTER table, which already carried it before this
# fix and would keep the check green with the card still at 560.


def _card_table_tag(html: str) -> str:
    """The card's own <table …> tag — the second one in the document.

    Extracted so the self-test below can run it against inputs whose answer is
    known. The real check calls THIS function, never a copy.
    """
    tags = re.findall(r"<table[^>]*>", html)
    assert len(tags) >= 2, f"expected at least 2 <table> tags, found {len(tags)}"
    return tags[1]


def test_card_table_tag_probe_discriminates():
    """Self-test first: if the extractor cannot pick the card out of the
    document, everything it reports about widths afterwards is void — and its
    reassuring output (a tag that happens to contain width="100%") is exactly
    what a wrong pick would produce, because the OUTER table contains it too.
    """
    fake = '<table width="100%"><tr><td><table width="560" id="card"></table>'
    assert 'id="card"' in _card_table_tag(fake), "picked the outer table, not the card"
    assert 'width="560"' in _card_table_tag(fake)
    # Anchored to the real repo artifact, not only to a synthetic string
    # (MEH-1909): a probe proven on shapes I invented has not been shown to
    # recognise the shape this builder actually emits.
    # `.startswith("<table")` stood here and was too weak to be evidence: it is
    # true of the OUTER table too, so it could not show the extractor picked the
    # card. Caught by the CI reviewer on #3072. Anchored instead to the card's
    # distinguishing attribute — the outer table is cellpadding="0".
    real = _card_table_tag(_producer_approved_html(NAME, SLUG))
    assert 'cellpadding="40"' in real, (
        f"extractor did not return the card table (outer is cellpadding=0): {real}"
    )


def test_card_table_is_fluid_and_capped_not_fixed_width():
    """`width="100%"` + `max-width:560px` on the CARD, and no `width="560"`
    anywhere — the attribute would silently win over the cap.
    """
    html = _producer_approved_html(NAME, SLUG)
    card = _card_table_tag(html)

    assert 'width="100%"' in card, f"card table is not fluid: {card}"
    assert "max-width:560px" in card, f"card table has no width cap: {card}"
    assert 'width="560"' not in html, (
        'width="560" is present — the HTML attribute overrides the CSS '
        "max-width beside it, which is the whole defect this guards."
    )


def test_primary_button_is_centered_by_an_html_attribute():
    """`align="center"` on the button's own table.

    Not `margin:auto`: Outlook's Word engine ignores auto margins on a table
    box, and the button sits in a `text-align:right` cell that does not move a
    block-level table on its own.
    """
    html = _producer_approved_html(NAME, SLUG)
    # Anchored to the button's IDENTITY — the table immediately wrapping its
    # green cell — not to any style value. The first version of this finder
    # keyed on "margin:0 0 24px", which is precisely the declaration the fix
    # had to change, so the test broke itself: a locator must not depend on the
    # thing under test.
    m = re.search(r'(<table[^>]*>)<tr><td style="background:#2e6853', html)
    assert m, "button table not found — the assertion below would be vacuous"
    button_tag = m.group(1)
    # TWO cues, asserted separately and never OR-ed. `align="center"` alone is
    # green for two different reasons — genuinely centred, OR present-but-
    # defeated — because the UA sheet implements the attribute as auto side
    # margins and an inline `margin:0 0 24px` shorthand re-zeroes them and
    # wins. That second world is not hypothetical: it is what this fix round
    # measured on the first attempt (gapL=309.7, gapR=40, with the attribute
    # already in place).
    assert 'align="center"' in button_tag, (
        f"button table lacks align=\"center\" — Outlook needs the attribute: "
        f"{button_tag}"
    )
    assert "margin:0 auto" in button_tag, (
        f"button table zeroes its horizontal margins, which overrides the auto "
        f"margins align=\"center\" maps to — the attribute is then inert: "
        f"{button_tag}"
    )


def test_invite_url_can_break_so_the_card_cannot_be_forced_wide(monkeypatch):
    """The card being fluid is not enough on its own.

    With `width="100%"`, a table still cannot render narrower than its
    min-content width, and the community invite URL is one unbreakable token.
    Measured after the width fix alone: the URL is 349px, plus 2x40px cell
    padding = 429px — exactly the `scrollWidth=429` the 375px viewport then
    reported. `word-break` is what lets the token yield, and without it the
    no-overflow property this ticket exists to deliver silently comes back.

    The cost, recorded because it is a real trade and not a free win: at 375px
    the URL now occupies two line boxes instead of one. It stays a single <a>,
    so it stays one clickable link — and no-overflow was the axis with the user
    -visible failure (a clipped button and a sub-44px tap target).
    """
    settings_url = "https://chat.whatsapp.com/BqR7xKm2ZvN4pLcT9wYdE1"
    monkeypatch.setattr(settings, "whatsapp_community_invite_url", settings_url)
    html = _producer_approved_html(NAME, SLUG)

    anchor = next(
        (t for t in re.findall(r"<a [^>]*>", html) if settings_url in t), None
    )
    assert anchor, "invite anchor not rendered — the assertion below would be vacuous"
    assert "word-break:break-all" in anchor, (
        f"invite URL cannot break, so its min-content width sets the card floor "
        f"and 375px overflows again: {anchor}"
    )
