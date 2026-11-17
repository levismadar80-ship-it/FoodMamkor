"""MEH-2164: the newsletter welcome card must be fluid, not a fixed 560px.

Same defect as MEH-2151/PR #3072, in the second of six places the repo carries
this markup: an HTML `width="560"` ATTRIBUTE sitting beside a CSS
`max-width:560px`. They read as belt-and-braces and are not — the attribute
wins, so the card renders 560px wide inside a 375px viewport. Measured here
before the fix: `scrollWidth=560` against `innerWidth=375`; after: `375`
against `375`, with the 1440 rendering unchanged (card 560, centred).

The assertions below are anchored on `max-width:560px`, which is what
distinguishes the card from the outer wrapper. They are deliberately NOT
anchored on any width ATTRIBUTE value: a locator keyed on the string the fix
changes breaks itself, which is a mistake this file's predecessor made and had
corrected in review.

MEH-0000 moved that anchor. It was `cellpadding="40"` — true of the card,
false of the wrapper, and a perfectly good discriminator until the 40 itself
became the defect: on a `width="100%"` card it is 80px of side padding, about
280px of text on a 360px phone. The requirement did not change, only which
attribute carries it, and `test_card_table_extractor_discriminates` still
proves the anchor is false of the wrapper before using it.
"""

import re

from app.routers import marketing


def _render() -> str:
    """Return the real html_body, by intercepting the sender the function calls.

    `_send_newsletter_welcome` has no return value — it builds the markup and
    hands it to `send_email`. Replacing that module-level name captures exactly
    the string that would have gone on the wire, so these tests exercise the
    real implementation rather than a second copy of the markup free to drift
    from it.
    """
    captured = {}

    def fake_send_email(to, subject, body, html=None, **kwargs):
        captured["html"] = html

    original = marketing.send_email
    marketing.send_email = fake_send_email
    try:
        marketing._send_newsletter_welcome("qa@example.com")
    finally:
        marketing.send_email = original

    html = captured.get("html")
    assert html, (
        "CONTROL FAILED: no HTML captured. Every assertion in this module is "
        "void if this fires — an empty render passes an 'is not present' check "
        "for the same reason a correct one does."
    )
    return html


def _card_table_tag(html: str) -> str:
    """The card table — the one with the max-width cap; the wrapper has none."""
    tags = [
        t for t in re.findall(r"<table[^>]*>", html, re.S) if "max-width:560px" in t
    ]
    assert len(tags) == 1, f"expected exactly 1 card table, found {len(tags)}"
    return tags[0]


def test_card_table_extractor_discriminates():
    """Run first: an extractor that returns the WRONG table would make every
    assertion below pass for the wrong reason — the outer wrapper already
    carries `width="100%"`, so picking it would report a fluid card whatever
    the card actually says."""
    fake = (
        '<table width="100%" cellpadding="0"><tr><td>'
        '<table width="560" style="max-width:560px" id="card"></table>'
        "</td></tr></table>"
    )
    picked = _card_table_tag(fake)
    assert 'id="card"' in picked, f"picked the outer wrapper, not the card: {picked}"
    assert 'width="560"' in picked, "extractor lost the attribute under test"

    # And against the real document, not only the synthetic one (MEH-1909):
    # a probe validated on invented shapes proves nothing about the shape the
    # repo actually uses.
    # The anchor must be FALSE of the wrapper, or picking the wrapper would
    # satisfy every assertion below (it already carries width="100%").
    wrapper = '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:24px 12px;">'
    assert "max-width:560px" not in wrapper, (
        "the anchor is true of the outer wrapper too — it discriminates nothing"
    )
    real = _card_table_tag(_render())
    assert "max-width:560px" in real, f"extractor missed the real card: {real}"


def test_newsletter_card_is_fluid_and_capped():
    html = _render()
    card = _card_table_tag(html)

    assert 'width="100%"' in card, f"card table is not fluid: {card}"
    assert "max-width:560px" in card, f"card table lost its cap: {card}"
    assert "margin:0 auto" in card, (
        f"card table is fluid but no longer centred at desktop width: {card}"
    )
    assert 'width="560"' not in html, (
        'width="560" is present. The HTML width attribute overrides the CSS '
        "max-width beside it, so the card renders 560px wide on a 375px "
        "screen. This is the whole defect MEH-2164 fixed."
    )


def test_outer_wrapper_stays_full_width():
    """The fix is on the card; the wrapper was already correct and must remain
    so — a fluid card inside a fixed wrapper would overflow just the same."""
    tags = re.findall(r"<table[^>]*>", _render(), re.S)
    assert 'width="100%"' in tags[0], f"outer wrapper is not full-width: {tags[0]}"


def test_copy_and_palette_untouched():
    """MEH-2164 is a layout fix. Anything else changing is scope creep."""
    html = _render()
    for fragment in (
        "ברוכים הבאים למהמקור",
        # MEH-2611 replaced the weekly/Monday promise (nothing sends weekly)
        # with copy Sapir approved 30/10; this pins the new line instead.
        "נכתוב לך כשיש משהו ששווה לספר: בית עסק חדש, אירוע קרוב או מתכון של העונה.",
        "בלי ספאם, ואפשר לבטל בכל רגע.",
        "לבטל הרשמה",
        "#F5F0E8",
        "#2e6853",
        "#1C1A17",
    ):
        assert fragment in html, f"copy/palette drifted: {fragment!r} is gone"
