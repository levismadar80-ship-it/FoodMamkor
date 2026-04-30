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
    """Symbols, semicolons, null-byte-like sequences all stripped."""
    assert _sanitize_slug("foo;rm$(bar)`baz`") == "foorm-bar-baz" or \
           _sanitize_slug("foo;rm$(bar)`baz`") == "foormbarbaz"
    # Either is acceptable — the goal is "no shell metacharacters survive"
    result = _sanitize_slug("foo;rm$(bar)`baz`")
    assert ";" not in result and "$" not in result and "`" not in result
    assert "(" not in result and ")" not in result


def test_unicode_stripped():
    """Non-ASCII chars (Hebrew, emoji) are stripped — slug is
    ASCII-only by construction. We assert the property (no non-ASCII
    survives) rather than over-specifying trailing-hyphen behavior."""
    assert _sanitize_slug("שלום") == "default"
    result = _sanitize_slug("hello 🚀")
    assert "🚀" not in result
    result.encode("ascii")  # raises UnicodeEncodeError if non-ASCII present
    assert result.startswith("hello")
