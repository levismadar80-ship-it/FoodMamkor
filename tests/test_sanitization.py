"""Unit tests for app.services.sanitization.sanitize_text (MEH-329).

Behavior lock. Since MEH-3317 the output is plain text (entities decoded,
tags stripped until stable). If a bleach upgrade changes any output, verify
no stored value can open a tag before updating an assertion.
"""
from app.services.sanitization import sanitize_text


def test_strips_script_tags():
    # bleach 6.3.0 with tags=[] strips the tag wrappers but preserves
    # inner text content. The result is a literal string, not executable
    # code — XSS-safe. Behavior lock per MEH-329 plan.
    assert sanitize_text("<script>alert(1)</script>hello") == "alert(1)hello"


def test_strips_img_onerror():
    assert sanitize_text('<img src=x onerror=alert(1)>') is None


def test_preserves_hebrew():
    assert sanitize_text("שלום עולם") == "שלום עולם"


def test_preserves_emoji():
    assert sanitize_text("מצוין 🌿") == "מצוין 🌿"


def test_preserves_punctuation():
    assert sanitize_text("מחיר: ₪50, איכות!") == "מחיר: ₪50, איכות!"


def test_max_length():
    long = "א" * 2000
    out = sanitize_text(long, max_length=1000)
    assert out is not None
    assert len(out) == 1000


def test_none_passes():
    assert sanitize_text(None) is None


def test_empty_string():
    assert sanitize_text("") is None


def test_only_html_returns_none():
    assert sanitize_text("<script></script>") is None


def test_entity_smuggled_tags_are_stripped_not_revived():
    # MEH-3317: output is plain text now, so entities are decoded — and a tag
    # written as entities must not come back to life after decoding. The loop
    # strips it on the next pass.
    assert sanitize_text("&lt;b&gt;bold&lt;/b&gt;") == "bold"
    assert sanitize_text("&lt;img src=x onerror=alert(1)&gt;") is None
    assert "<" not in (sanitize_text("&amp;lt;script&amp;gt;x") or "")


def test_ampersand_and_angle_brackets_are_stored_as_typed():
    # MEH-3317: «&» was stored as «&amp;» and shown that way on the site.
    assert sanitize_text("קפה & מאפה") == "קפה & מאפה"
    assert sanitize_text("Crust & Crumb") == "Crust & Crumb"
    assert sanitize_text("5 < 6 > 4") == "5 < 6 > 4"


def test_tags_still_stripped_with_text_around_them():
    assert sanitize_text("<b>x</b> & co") == "x & co"


def test_an_unclosed_tag_is_never_stored_as_a_raw_tag_opener():
    # Reviewer finding on #4711: bleach leaves "<img …" with no ">" as text,
    # so after decoding it would be a raw tag opener. It stays encoded.
    out = sanitize_text("<img src=x onerror=alert(1)")
    assert out is None or "<img" not in out


def test_max_length_counts_plain_characters():
    # 500 bare "<" used to become 2000 chars of "&lt;"; now each is one char.
    out = sanitize_text("<" * 500 + " a", max_length=500)
    assert out is not None and len(out) <= 500


def test_strips_script_close_tag():
    # Locks the JSON-LD safety chain: if a producer field reaches a
    # <script type="application/ld+json"> tag via JSON.stringify, the
    # presence of "</script>" in stored text would let an attacker break
    # out of the script context. Sanitization at write strips both the
    # leading "</script>" and the inner "<script>...</script>".
    assert sanitize_text("</script><script>alert(1)</script>") == "alert(1)"
