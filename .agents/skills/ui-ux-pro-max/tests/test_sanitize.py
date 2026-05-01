"""Unit tests for _sanitize_slug.

Imports only _sanitize (pure module, only `re`). Does not touch
design_system.py / core.py / DATA_DIR — keeps tests independent of the
search infrastructure.

Run from the skill root with:
    cd .claude/skills/ui-ux-pro-max
    python -m pytest tests/ -v
"""

import sys
from pathlib import Path

# Add scripts/ dir to import path so `_sanitize` resolves without
# requiring users to install the skill as a package.
SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from _sanitize import _sanitize_slug  # noqa: E402


# ---------- Required cases (MEH-398 acceptance criteria) ----------

def test_strips_traversal_dots_and_slashes():
    """`../../../foo` → `foo` — the original MEH-397 finding."""
    assert _sanitize_slug("../../../foo") == "foo"


def test_normal_name_with_space_becomes_hyphenated_slug():
    """`normal name` → `normal-name`."""
    assert _sanitize_slug("normal name") == "normal-name"


def test_pure_traversal_falls_back_to_default():
    """`../` strips to empty → `default`."""
    assert _sanitize_slug("../") == "default"


def test_strips_inner_slashes():
    """`name/with/slash` → `namewithslash`."""
    assert _sanitize_slug("name/with/slash") == "namewithslash"


def test_empty_string_falls_back_to_default():
    """Empty input → `default`."""
    assert _sanitize_slug("") == "default"


# ---------- Bonus cases (defensive + case-fold sanity) ----------

def test_none_falls_back_to_default():
    """`None` → `default` (defensive guard against design_system dict
    returning None for project_name)."""
    assert _sanitize_slug(None) == "default"


def test_uppercase_is_lowercased():
    """`FOO BAR` → `foo-bar` (case fold applied before regex strip)."""
    assert _sanitize_slug("FOO BAR") == "foo-bar"


# ---------- Adversarial probes (not required by spec; surface coverage) ----------

def test_strips_backslashes_too():
    """Windows-style backslash traversal — not in regex allowlist
    [a-z0-9-], so stripped."""
    assert _sanitize_slug("..\\..\\foo") == "foo"


def test_strips_special_chars():
    """Shell metacharacters, semicolons, parentheses all stripped."""
    result = _sanitize_slug("foo;rm$(bar)`baz`")
    assert result == "foormbarbaz"
    # Property assertion is redundant with the equality above today, but
    # guards against a future change where the exact slug shape shifts
    # while a metacharacter inadvertently survives the regex.
    for char in ";$`()":
        assert char not in result


def test_unicode_stripped():
    """Non-ASCII chars (Hebrew, emoji) are stripped — slug is
    ASCII-only by construction. We assert the property (no non-ASCII
    survives) rather than over-specifying trailing-hyphen behavior."""
    assert _sanitize_slug("שלום") == "default"
    result = _sanitize_slug("hello 🚀")
    assert "🚀" not in result
    result.encode("ascii")  # raises UnicodeEncodeError if non-ASCII present
    assert result.startswith("hello")


# ---------- MEH-404 hardening (F-3, F-4, F-7) ----------

def test_collapses_multi_hyphens():
    """F-3: `foo--bar` → `foo-bar`. Runs of hyphens collapse to one."""
    assert _sanitize_slug("foo--bar") == "foo-bar"


def test_strips_leading_trailing_hyphens():
    """F-4: `-foo-` → `foo`. Trim happens AFTER cap so a cap landing
    mid-hyphen-run can't leave a trailing dash."""
    assert _sanitize_slug("-foo-") == "foo"


def test_caps_at_64_chars():
    """F-7: very long input is clipped at 64 chars. Bypass-by-mkdir
    OsError protection."""
    assert len(_sanitize_slug("a" * 1000)) == 64


def test_double_hyphen_only_falls_back_to_default():
    """F-3 + F-4 + fallback: `--` collapses to `-`, trims to empty,
    falls back to `default`."""
    assert _sanitize_slug("--") == "default"


def test_long_input_clipped_at_boundary():
    """F-7 boundary: `'foo' * 100` (300 chars) clipped to 64."""
    assert len(_sanitize_slug("foo" * 100)) == 64


def test_cap_then_trim_no_trailing_hyphen():
    """F-4 + F-7 ordering: cap-then-trim must not leave a trailing
    hyphen. Constructing input where the 64-char cap lands on a
    hyphen, the trim step must remove it. Without cap-then-trim
    ordering, the slug would end in `-`."""
    # 31 chars of "a-" is 62 chars, then ending "abc-" pushes past 64
    # so the cap lands on a hyphen. Trim then removes it.
    s = ("a-" * 32) + "tail"  # length 68
    result = _sanitize_slug(s)
    assert len(result) <= 64
    assert not result.endswith("-")
