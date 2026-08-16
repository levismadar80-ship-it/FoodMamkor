"""MEH-2021 — the `U+0590-U+05FF` range in the slug helpers is load-bearing.

This file exists because the opposite was written into a docstring and believed.

MEH-1813 measured `_slugify("חוות")` with and without the explicit Hebrew range,
got the same answer, and recorded "the range is redundant". The input was letters
only — the single case where the two forms agree. A sample of one settled a
question about 81 characters, and the next reader was one "cleanup" away from
changing every slug belonging to a business whose name carries a geresh.

So this suite is deliberately **inverted** relative to the ticket that spawned it.
It does not assert equivalence. It asserts **divergence**: that removing the range
changes the output, on inputs drawn from real Hebrew business naming. If someone
deletes the range from any of the three call sites, `test_range_is_live_in_source`
goes red.

Three sites carry the same character class (grepped 2026-08-16, MEH-2021):
  * `backend/app/routers/admin.py::_slugify`            — escaped form
  * `backend/app/slug_utils.py::slugify`                — literal form
  * `backend/app/services/producer_import.py::_slugify` — escaped form
"""

from __future__ import annotations

import inspect
import re
import unicodedata
from pathlib import Path

import pytest

from app.routers.admin import _slugify as admin_slugify
from app.services.producer_import import _slugify as import_slugify
from app.slug_utils import slugify as utils_slugify

HEBREW_BLOCK = range(0x0590, 0x0600)

# The three production entry points. `admin_slugify` rejects non-str by design
# (documented in its docstring); the other two cast. Every case below passes a
# str, so all three are exercised identically.
IMPLEMENTATIONS = (
    ("admin._slugify", admin_slugify),
    ("slug_utils.slugify", utils_slugify),
    ("producer_import._slugify", import_slugify),
)


def _slugify_without_range(text: str) -> str:
    """The counterfactual: byte-identical to the real helpers, range removed.

    This is the exact edit MEH-2021 was originally opened to make. Keeping it
    here as an executable control is what turns "the range matters" from an
    assertion into a measurement.
    """
    if not text:
        return ""
    s = str(text).strip().lower()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^\w\-]", "", s)  # <- the only difference
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:100]


# (label, input, must the two forms diverge?)
# The `False` rows are not filler: they are what makes the `True` rows evidence
# rather than an artefact of a corpus stacked with exotic characters. They also
# reproduce MEH-1813's original measurement and show why it read as it did.
CORPUS: tuple[tuple[str, str, bool], ...] = (
    ("plain hebrew (MEH-1813's only sample)", "חוות הדגן", False),
    ("latin", "Green Farm", False),
    ("latin with diacritics", "Café Crème", False),
    ("digits", "farm 2024", False),
    ("collapsing hyphens", "a--b", False),
    ("empty", "", False),
    ("punctuation only", "!!!", False),
    ("niqqud", "מַאֲפִיָּה", True),
    ("gershayim U+05F4", "מאפיית ״שקד״", True),
    ("geresh U+05F3", "צ׳יפס", True),
    ("maqaf U+05BE", "לחם־כוסמין", True),
    ("sof pasuq U+05C3", "סוף׃פסוק", True),
    ("paseq U+05C0", "א׀ב", True),
    ("nun hafukha U+05C6", "א׆ב", True),
)


def test_corpus_covers_both_outcomes() -> None:
    """Guard the guard: a corpus that drifted to all-True would prove nothing.

    Counts are derived from the corpus, never written as literals — a stated
    count goes stale the moment a row is added (MEH-1976).
    """
    diverging = [row for row in CORPUS if row[2]]
    agreeing = [row for row in CORPUS if not row[2]]
    assert diverging, "corpus must contain inputs where the range changes the result"
    assert agreeing, "corpus must contain inputs where it does not, or divergence is meaningless"
    assert len(CORPUS) == len(diverging) + len(agreeing)


@pytest.mark.parametrize("label,text,must_diverge", CORPUS, ids=[c[0] for c in CORPUS])
@pytest.mark.parametrize("impl_name,impl", IMPLEMENTATIONS, ids=[i[0] for i in IMPLEMENTATIONS])
def test_range_removal_changes_output(
    impl_name: str, impl, label: str, text: str, must_diverge: bool
) -> None:
    """The measurement, per input × per implementation.

    `must_diverge=True` is the load-bearing half: it fails if the range stops
    mattering, which is exactly what happens if someone removes it.
    """
    with_range = impl(text)
    without_range = _slugify_without_range(text)

    if must_diverge:
        assert with_range != without_range, (
            f"{impl_name}({text!r}) is no longer protected by the Hebrew range: "
            f"both forms return {with_range!r}. If the range was just removed from "
            f"the source, restore it — this is a public-URL behaviour change."
        )
    else:
        assert with_range == without_range, (
            f"{impl_name}({text!r}) unexpectedly depends on the Hebrew range: "
            f"{with_range!r} vs {without_range!r}"
        )


def test_the_three_implementations_agree() -> None:
    """They are three copies of one function; drift between them is a bug."""
    for label, text, _ in CORPUS:
        results = {name: impl(text) for name, impl in IMPLEMENTATIONS}
        assert len(set(results.values())) == 1, f"slug helpers disagree on {label}: {results}"


def test_81_codepoints_survive_only_because_of_the_range() -> None:
    """The number quoted in all three docstrings, derived rather than asserted.

    If a future Python/Unicode release reclassifies part of the block, this
    fails and the docstrings get corrected — instead of quietly becoming wrong,
    which is the failure this whole file is a response to.
    """
    non_word = [cp for cp in HEBREW_BLOCK if not re.match(r"\w", chr(cp))]

    assert len(non_word) == 81, (
        f"expected 81 non-\\w codepoints in U+0590-U+05FF, measured {len(non_word)}. "
        "The docstrings in admin.py, slug_utils.py and producer_import.py quote "
        "this number — update all three."
    )

    categories = {unicodedata.category(chr(cp)) for cp in non_word}
    assert "Mn" in categories, "combining marks (ניקוד) must be in the protected set"
    assert "Po" in categories, "punctuation (geresh/gershayim) must be in the protected set"

    # Named characters the docstrings call out by name.
    for cp, name in ((0x05BE, "maqaf"), (0x05F3, "geresh"), (0x05F4, "gershayim")):
        assert cp in non_word, f"{name} U+{cp:04X} should not be \\w"


def test_range_is_live_in_source() -> None:
    """Read the actual source of all three helpers and require the range.

    The behavioural tests above compare against a local counterfactual, so they
    would still pass if someone deleted the range from *one* site and that site
    happened to keep agreeing on this corpus. This one cannot: it greps the
    shipped functions. It accepts either spelling — escaped or literal — since
    both are in use and both are correct.
    """
    # Two spellings of the same range are in use and both are correct:
    #   admin.py / producer_import.py -> the six-character escape sequence
    #   slug_utils.py                 -> the literal characters
    # `"\\u0590-\\u05FF"` here is the *source text* `֐-׿`, not the
    # characters it denotes — inside an r-string those are different things,
    # and conflating them is why the first draft of this test passed on one
    # site and failed on the other two.
    escaped = "\\u0590-\\u05FF"
    literal = "֐-׿"

    for name, impl in IMPLEMENTATIONS:
        src = inspect.getsource(impl)
        body = src.split('"""')[-1]  # ignore the docstring; the code must carry it
        assert (escaped in body) or (literal in body), (
            f"{name} no longer restricts on the Hebrew range. Removing it rewrites "
            f"slugs for any business name containing ניקוד, geresh, gershayim or "
            f"maqaf — see MEH-2021 and the docstring in admin.py::_slugify."
        )


def test_docstrings_do_not_claim_the_range_is_redundant() -> None:
    """The specific regression MEH-2021 exists to prevent, in the specific words.

    MEH-1813 shipped a docstring asserting redundancy. That sentence is what a
    later reader would have acted on, so the sentence itself is what gets pinned.
    """
    root = Path(__file__).resolve().parents[1]
    sources = (
        root / "backend" / "app" / "routers" / "admin.py",
        root / "backend" / "app" / "slug_utils.py",
        root / "backend" / "app" / "services" / "producer_import.py",
    )

    checked = 0
    for path in sources:
        assert path.exists(), f"expected slug helper at {path}"
        text = path.read_text(encoding="utf-8")
        checked += 1
        assert "range is therefore redundant" not in text, (
            f"{path.name} has re-acquired the MEH-1813 claim that the Hebrew "
            f"range is redundant. It is not — see MEH-2021."
        )

    assert checked == len(sources)
