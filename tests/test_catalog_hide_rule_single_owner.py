"""MEH-1986 — the default-hide rule has exactly ONE owner in query code.

The bug this file guards against is not a wrong result; it is the *shape*
that produced the wrong result. Before MEH-1986 the rule
``availability_state != "on_vacation"`` lived inline in the catalog query
while four sibling endpoints answered the same question without it. Nothing
was broken about either half in isolation — the disagreement only existed
between them, which is why no test caught it and why the behavioural suite
in ``test_catalog_count_consistency.py`` is not sufficient on its own:
a future endpoint can re-introduce the exact defect and every behavioural
test in this repo will still pass, because none of them will know it exists.

So this is a structural assertion with a NUMERIC final state — "exactly one,
not one-plus-yours". A new reader that inlines the comparison instead of
composing ``catalog_default_availability_condition()`` reddens this file, and
the failure message says what to do instead.

The probe is validated against known answers before its output is trusted
(ORDERS §3.0): ``test_probe_detects_a_planted_violation`` feeds it a synthetic
inline comparison and requires a hit, and the real-corpus case below anchors
it to a committed file rather than to invented fixtures alone.
"""

import re
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1] / "backend" / "app"

# A query-level comparison against the vacation state. Matches the SQLAlchemy
# filter form (`Producer.availability_state != ON_VACATION`) and the raw-literal
# form it replaced. Deliberately does NOT match `self.availability_state ==
# "on_vacation"` in schemas.py — those are Python-object reads on a single
# instance (the auto-clear logic), not catalog query filters, and they are a
# different concern with a different owner.
_QUERY_COMPARISON = re.compile(
    r"Producer\.availability_state\s*(?:!=|==)\s*(?:ON_VACATION|\"on_vacation\"|'on_vacation')"
)

# The one legitimate owner.
_OWNER = APP_ROOT / "services" / "producer_listing.py"


def _scan(root: Path) -> list[tuple[Path, int, str]]:
    """Every query-level comparison against the vacation state under `root`.

    Accepts a file or a directory. The file case is not a convenience: the
    first version of this helper only did `root.rglob("*.py")`, which silently
    returns nothing for a file, so the real-corpus control below reported
    "no comparison found" against the very file that owns the rule. That is
    the §3.0 failure shape exactly — a probe returning a plausible, alarming
    answer instead of an error — and it was caught by running the control.
    """
    paths = [root] if root.is_file() else sorted(root.rglob("*.py"))
    hits: list[tuple[Path, int, str]] = []
    for path in paths:
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if _QUERY_COMPARISON.search(line):
                hits.append((path, lineno, line.strip()))
    return hits


def _call_sites(path: Path) -> int:
    """Real calls to the helper — not its `def`, not prose about it.

    A plain `src.count(...)` over-counted by 2 in producer_listing.py (the
    definition line and a comment naming the function read as call sites).
    Comments are stripped and the definition skipped so the expected numbers
    below mean what they say.
    """
    count = 0
    for line in path.read_text(encoding="utf-8").splitlines():
        code = line.split("#", 1)[0]
        if code.lstrip().startswith("def "):
            continue
        count += code.count("catalog_default_availability_condition()")
    return count


# ---------- probe validation, before any result from it is believed ----------


def test_probe_detects_a_planted_violation(tmp_path):
    """Known-answer control: a file containing exactly the banned shape must
    be found. Without this, a regex that matches nothing would make the real
    assertion below pass for the wrong reason — a green with two causes."""
    planted = tmp_path / "rogue_router.py"
    planted.write_text(
        "q = db.query(Producer).filter(Producer.availability_state != ON_VACATION)\n",
        encoding="utf-8",
    )

    hits = _scan(tmp_path)

    assert len(hits) == 1, "probe failed to flag a planted inline comparison"
    assert hits[0][1] == 1


def test_probe_ignores_the_instance_level_reads_it_must_not_flag(tmp_path):
    """The complement control. `self.availability_state == "on_vacation"`
    (schemas.py auto-clear) is a legitimate non-query read; a probe that
    flagged it would force a bogus refactor of unrelated code."""
    benign = tmp_path / "schema_like.py"
    benign.write_text(
        'if self.availability_state == "on_vacation":\n    pass\n',
        encoding="utf-8",
    )

    assert _scan(benign.parent) == []


def test_call_site_counter_ignores_the_definition_and_prose(tmp_path):
    """Known-answer control for the second probe. Two real calls, plus a
    `def` line and a comment that both name the function — the answer is 2.

    This is the case that was actually wrong: the first version counted 4.
    """
    sample = tmp_path / "sample.py"
    sample.write_text(
        "def catalog_default_availability_condition():\n"
        "    return True\n"
        "# moved to catalog_default_availability_condition() above\n"
        "q = q.filter(catalog_default_availability_condition())\n"
        "c = c.filter(catalog_default_availability_condition())\n",
        encoding="utf-8",
    )

    assert _call_sites(sample) == 2


def test_probe_finds_the_real_owner_in_the_committed_tree():
    """Anchored to a real repo file, not a fixture (rules/testing.md — a
    synthetic-only self-test proves the probe works on shapes you invented).
    If this returns nothing, the probe has drifted from what the codebase
    actually writes and every count below is meaningless."""
    hits = _scan(_OWNER)

    assert hits, (
        f"probe found no comparison in {_OWNER.name}, which is supposed to own "
        "the rule — the pattern has drifted from the source"
    )


# ---------- the assertion itself ----------


def test_exactly_one_query_level_owner_of_the_default_hide_rule():
    """Numeric final state: 1, not 1 + however many endpoints get added.

    Every other reader composes catalog_default_availability_condition().
    """
    hits = _scan(APP_ROOT)
    offenders = [(p, n, src) for p, n, src in hits if p != _OWNER]

    assert not offenders, (
        "The catalog default-hide rule must not be re-derived inline. "
        "Compose services.producer_listing.catalog_default_availability_condition() "
        "instead, so this reader cannot drift from the catalog the way "
        "/producers/count and /producers/cities did (MEH-1986).\n"
        + "\n".join(
            f"  {p.relative_to(APP_ROOT)}:{n}: {src}" for p, n, src in offenders
        )
    )
    assert len(hits) == 1, f"expected exactly 1 owner, found {len(hits)}: {hits}"


def test_every_converted_reader_composes_the_helper():
    """The positive half. The structural test above cannot tell "composes the
    helper" from "dropped the rule entirely" — deleting the filter from
    /producers/count would satisfy it. This names the five call sites.

    Behavioural proof that each one works lives in
    test_catalog_count_consistency.py; this only proves none was quietly
    dropped in a later refactor.
    """
    expected = {
        "services/producer_listing.py": 2,  # q + count_q
        "routers/producers.py": 3,  # /count, /cities, /random
        "routers/marketing.py": 1,  # /stats
    }

    for rel, want in expected.items():
        got = _call_sites(APP_ROOT / rel)
        assert got == want, f"{rel}: expected {want} call sites, found {got}"
