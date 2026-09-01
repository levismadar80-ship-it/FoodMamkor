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
deletes the range from the one remaining implementation,
`test_range_is_live_in_source` goes red.

Three sites used to carry three COPIES of the same character class (grepped
2026-08-16, MEH-2021). **MEH-2020 collapsed them into one owner** —
`slug_utils.slugify` — and the other two names are now aliases:

  * `backend/app/slug_utils.py::slugify`                — the implementation
  * `backend/app/routers/admin.py::_slugify`            — alias
  * `backend/app/services/producer_import.py::_slugify` — alias

The parametrisation below is therefore no longer three independent
measurements, and saying so matters: a suite that reads as 3x coverage while
exercising one function is the "artifact that asserts coverage" failure this
repo has a rule about. `test_the_three_names_are_one_object` is what carries
the real content now — it reds if someone re-forks a copy, which is the only
way the three could diverge again.
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

# The three production entry NAMES. Since MEH-2020 they resolve to one object,
# so the parametrisation re-runs one function three times rather than comparing
# three. Kept deliberately: the names are what the rest of the codebase imports,
# so a future re-fork shows up here as three differing results — and
# `test_the_three_names_are_one_object` catches it directly.
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

    # `assert len(CORPUS) == len(diverging) + len(agreeing)` stood here and was
    # removed: truthy/falsy partitions the corpus exhaustively, so the sum is
    # always len(CORPUS) and the line could never fail. Entailed by its own
    # setup — decoration, not a check (testing.md).
    #
    # This replaces it with something that CAN fail. The risk is not a row
    # landing in "neither bucket" — truthiness always places it somewhere — it
    # is a row landing in the WRONG one while reading correctly: a third element
    # of "no" is truthy and would be counted as diverging, "" or 0 as agreeing.
    # Requiring a real bool is what makes the two lists mean what their names say.
    assert all(isinstance(row[2], bool) for row in CORPUS), (
        "every corpus row's third element must be a real bool — a truthy string "
        "like 'no' would be silently counted as diverging"
    )


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


def test_the_three_names_are_one_object() -> None:
    """MEH-2020 — identity, not agreement.

    Agreement on a corpus was the best available check while these were three
    copies. It is the weaker check now and would stay green forever: comparing a
    function to itself cannot fail, so it would report full health against a
    repo that had re-forked a copy and drifted on an input nobody listed.

    Identity can fail, and fails on exactly the thing worth catching.
    """
    functions = {impl for _, impl in IMPLEMENTATIONS}
    assert len(functions) == 1, (
        "the slug helpers are no longer one function — a copy has been "
        f"re-introduced: {[(name, impl) for name, impl in IMPLEMENTATIONS]}. "
        "MEH-2020 made slug_utils.slugify the single owner of a public URL; "
        "three generators is three chances to drift."
    )


def test_81_codepoints_survive_only_because_of_the_range() -> None:
    """The number quoted in all three docstrings, derived rather than asserted.

    If a future Python/Unicode release reclassifies part of the block, this
    fails and the docstrings get corrected — instead of quietly becoming wrong,
    which is the failure this whole file is a response to.
    """
    non_word = [cp for cp in HEBREW_BLOCK if not re.match(r"\w", chr(cp))]

    assert len(non_word) == 81, (
        f"expected 81 non-\\w codepoints in U+0590-U+05FF, measured {len(non_word)}. "
        "The docstring in slug_utils.py quotes this number — update it."
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
