"""
Module:   test_meh2150_whitelist_source_messages
Purpose:  Pin the FAILURE MESSAGES of the `_PRODUCER_WRITABLE_FIELDS` parser,
          so a future reader of a red build is pointed at the edit that would
          actually fix it.
Does NOT: assert which fields are writable — that is
          tests/test_data_ownership.py and its per-field siblings. This file
          only exercises the parser's own error paths.
Related:  tests/whitelist_source.py:63-80 (the two failure branches) ·
          backend/app/routers/producer_me.py:526 (the real declaration).
History:  MEH-2150 (creation — CI-reviewer Minor on PR #3043: an AnnAssign
          with no value reported "no longer a set literal", which names the
          wrong problem).

WHY MESSAGE WORDING IS WORTH A TEST
    The parser is only ever read when it is red. A message that misdescribes
    the source sends the next session to change the declaration FORM when the
    real defect is a missing `= {...}` — the cost is a wrong edit to a
    security-relevant whitelist, not a lost minute.
"""

import re

import pytest

import app.routers.producer_me as producer_me_module
from tests.whitelist_source import WHITELIST_NAME, read_producer_writable_fields


def _parse_against(monkeypatch, tmp_path, source: str) -> set[str]:
    """Point the parser at `source` instead of the shipped producer_me.py.

    The parser reads `producer_me_module.__file__` at call time, so swapping
    that attribute is enough — no seam added to the module under test.
    """
    fake = tmp_path / "producer_me_fixture.py"
    fake.write_text(source, encoding="utf-8")
    monkeypatch.setattr(producer_me_module, "__file__", str(fake))
    return read_producer_writable_fields()


# --- the case the reviewer found -------------------------------------------


def test_annotation_without_assignment_says_so(monkeypatch, tmp_path):
    """`NAME: set[str]` with no `= {...}` names the missing assignment."""
    with pytest.raises(AssertionError) as exc:
        _parse_against(monkeypatch, tmp_path, f"{WHITELIST_NAME}: set[str]\n")

    message = str(exc.value)
    assert re.search(r"annotat\w+ without an assignment", message), message
    # The discriminating half: it must NOT be the generic set-literal message,
    # which is what this path produced before MEH-2150 and which points the
    # reader at the declaration form rather than the missing value.
    assert "no longer a set literal" not in message, message


# --- controls: the other two paths must be UNCHANGED ------------------------


def test_annotated_declaration_with_a_set_still_parses(monkeypatch, tmp_path):
    """The supported annotated form is not swept up by the new branch.

    whitelist_source.py exists partly to accept this form; a guard that made
    every AnnAssign fail would pass the test above and still be wrong.
    """
    fields = _parse_against(
        monkeypatch, tmp_path, f'{WHITELIST_NAME}: set[str] = {{"name", "city"}}\n'
    )
    assert fields == {"name", "city"}


def test_a_non_set_value_still_reports_the_set_literal_message(monkeypatch, tmp_path):
    """An assigned-but-wrong-type declaration keeps the original message."""
    with pytest.raises(AssertionError, match="no longer a set literal"):
        _parse_against(monkeypatch, tmp_path, f'{WHITELIST_NAME} = ["name"]\n')


# --- real-corpus anchor (testing.md / MEH-1909) -----------------------------


def test_the_real_producer_me_still_parses_to_a_non_empty_set():
    """Anchor the probe to the shape the repo ACTUALLY uses.

    Every case above is synthetic. A parser can pass all of them and return
    nothing against the real file — exactly the MEH-1909 failure, where four
    synthetic cases passed while all 14 real revisions read as None.
    """
    fields = read_producer_writable_fields()
    assert fields, f"{WHITELIST_NAME} parsed as empty against the shipped source"
    # Shape only, deliberately not membership: WHICH fields are writable is
    # tests/test_data_ownership.py's subject, and duplicating it here would
    # give that invariant a second owner. (An earlier draft asserted
    # `"name" in fields` and went red — correctly: the business name is NOT
    # owner-writable. The parser was right and the assertion was a guess.)
    assert all(isinstance(f, str) for f in fields), sorted(fields)
