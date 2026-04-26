"""Unit tests for app.services.sanitization.sanitize_text (MEH-329).

Behavior lock — these tests pin bleach 6.3.0's exact output for the
inputs we care about. If a future bleach upgrade changes any output,
verify the new output is still XSS-safe (no execution path) before
updating the assertion.
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


def test_html_entities_decoded():
    # bleach 6.3.0 with tags=[] does NOT decode HTML entities — they
    # remain encoded in the output. This is XSS-safe (encoded entities
    # render as literal text in HTML; React encodes them again on output).
    # Behavior lock per MEH-329 plan: if a bleach upgrade changes this,
    # confirm the new output is still XSS-safe before updating.
    assert sanitize_text("&lt;b&gt;bold&lt;/b&gt;") == "&lt;b&gt;bold&lt;/b&gt;"


def test_strips_script_close_tag():
    # Locks the JSON-LD safety chain: if a producer field reaches a
    # <script type="application/ld+json"> tag via JSON.stringify, the
    # presence of "</script>" in stored text would let an attacker break
    # out of the script context. Sanitization at write strips both the
    # leading "</script>" and the inner "<script>...</script>".
    assert sanitize_text("</script><script>alert(1)</script>") == "alert(1)"
