"""MEH-1664 — unit tests for the shared Hebrew search tokeniser.

Pure-function coverage of app/utils/hebrew_search.py: the token cap, the
three variant rules, dedupe, the variant cap, and the escaping contract.
Behavioural coverage of the two endpoints lives in tests/test_search.py.

NOTE on file location: the ticket specified backend/tests/, but this repo
keeps the whole pytest suite at the repo root (tests/CLAUDE.md) and CI runs
`pytest tests/` — a file under backend/tests/ would never be collected.
"""

from app.utils.hebrew_search import (
    MAX_TOKENS,
    MAX_VARIANTS,
    stem,
    strip_hebrew_prefix,
    token_patterns,
    token_variants,
    tokenize,
)


class TestTokenize:
    def test_splits_on_whitespace(self):
        assert tokenize("גבינת עיזים טרייה") == ["גבינת", "עיזים", "טרייה"]

    def test_collapses_runs_of_whitespace(self):
        assert tokenize("  גבינה   עיזים \t") == ["גבינה", "עיזים"]

    def test_empty_and_none_yield_no_tokens(self):
        assert tokenize("") == []
        assert tokenize("   ") == []
        assert tokenize(None) == []

    def test_caps_at_max_tokens(self):
        many = " ".join(f"מילה{i}" for i in range(12))
        assert len(tokenize(many)) == MAX_TOKENS


class TestPrefixRule:
    """Rule (b) — verbatim the MEH-252 behaviour, now applied per token."""

    def test_strips_definite_article(self):
        assert strip_hebrew_prefix("הגבינה") == "גבינה"

    def test_strips_be_prefix(self):
        assert strip_hebrew_prefix("בחיפה") == "חיפה"

    def test_keeps_short_words_intact(self):
        # MEH-252: "הוא" must not become "וא" — 3 chars is under the floor.
        assert strip_hebrew_prefix("הוא") == "הוא"

    def test_leaves_non_prefix_letters_alone(self):
        assert strip_hebrew_prefix("גבינה") == "גבינה"


class TestStemRule:
    """Rule (c) — the smichut / feminine-ending bridge."""

    def test_drops_final_tav(self):
        assert stem("גבינת") == "גבינ"

    def test_drops_final_he(self):
        assert stem("גבינה") == "גבינ"

    def test_keeps_short_words_intact(self):
        assert stem("זאת") == "זאת"

    def test_leaves_other_endings_alone(self):
        assert stem("עיזים") == "עיזים"


class TestTokenVariants:
    def test_smichut_form_reaches_the_bare_stem(self):
        assert token_variants("גבינת") == ["גבינת", "גבינ"]

    def test_feminine_singular_reaches_the_bare_stem(self):
        assert token_variants("גבינה") == ["גבינה", "גבינ"]

    def test_prefix_plus_stem_yields_all_four_rules(self):
        # (a) as-is, (b) prefix-stripped, (c) stem, (d) stem of (b).
        assert token_variants("הגבינה") == ["הגבינה", "גבינה", "הגבינ", "גבינ"]

    def test_dedupes_collapsing_rules(self):
        # No prefix letter and no ה/ת ending — all four rules collapse to one.
        assert token_variants("עיזים") == ["עיזים"]

    def test_short_token_is_left_whole(self):
        assert token_variants("הוא") == ["הוא"]

    def test_never_exceeds_the_variant_cap(self):
        for token in ("הגבינה", "בגבינות", "שמחלבה", "עיזים", "א"):
            assert len(token_variants(token)) <= MAX_VARIANTS

    def test_plural_to_singular_is_not_covered(self):
        """Documents a deliberate gap, so a future change is a decision.

        The ה/ת rule takes "גבינות" to "גבינו", which does NOT reach
        "גבינה". ות/ים plural stripping was excluded by the MEH-1664
        over-engineering guard. The opposite direction ("גבינה" finding
        "גבינות") already works through plain substring ILIKE.
        """
        assert token_variants("גבינות") == ["גבינות", "גבינו"]
        assert "גבינה" not in token_variants("גבינות")


class TestTokenPatterns:
    def test_wraps_every_variant_in_wildcards(self):
        assert token_patterns("גבינת") == ["%גבינת%", "%גבינ%"]

    def test_escapes_like_metacharacters(self):
        # MEH-1176: a bare "%" must match literally, not as match-anything.
        assert token_patterns("50%") == ["%50\\%%"]
        assert token_patterns("a_b") == ["%a\\_b%"]
        assert token_patterns("a\\b") == ["%a\\\\b%"]

    def test_escaping_survives_the_variant_transforms(self):
        # "ה_בינה" strips to "_בינה"; both variants must stay escaped.
        assert token_patterns("ה_בינה") == ["%ה\\_בינה%", "%\\_בינה%", "%ה\\_בינ%", "%\\_בינ%"]
