"""MEH-2153 — custom_questions guard at the API boundary.

The editor renders five inputs capped at 80 chars each, so the UI path was
never the exposure. The API path is: `PUT /producers/me` with a hand-rolled
body reaches `ProducerUpdate`, and whatever survives that schema is rendered
verbatim as WhatsApp question chips on the public producer page.

What this module pins, and why each half exists:

  * The caps MEH-210 Phase 2 already enforced (count 5, length 80, trim,
    drop-empties). They were correct and are NOT re-litigated here — they are
    pinned so the MEH-2153 refactor that moved them into a shared function
    cannot have dropped one silently. A refactor's test suite has to cover the
    behaviour it inherited, not only the behaviour it added.
  * DEDUPE, which is the only rule MEH-2153 actually adds. Two identical
    questions rendered as two identical chips and burned one of the owner's
    five slots.

Pure-Pydantic: no HTTP, no DB, no auth fixtures (mirrors
test_meh1537_contact_validation.py's first layer, and
test_schemas_validation.py).

⚠️ The cap VALUES are pinned literally in `test_caps_are_the_documented_values`
and referenced symbolically everywhere else. That split is deliberate. A suite
that only says `"x" * _CUSTOM_QUESTION_MAX_LEN` is accepted and
`"x" * (_CUSTOM_QUESTION_MAX_LEN + 1)` is rejected stays green for ANY value of
the constant — it is entailed by its own inputs and measures nothing about the
cap. The literal pin is what makes a change to either ceiling show up as a red
test instead of a silent loosening.
"""

import pytest
from pydantic import ValidationError

from app.schemas.schemas import (
    _CUSTOM_QUESTION_MAX_LEN,
    _MAX_CUSTOM_QUESTIONS,
    ProducerUpdate,
)


def _questions(payload):
    """Round-trip a custom_questions payload through the write schema."""
    return ProducerUpdate(custom_questions=payload).custom_questions


# ---------- the caps themselves ----------


def test_caps_are_the_documented_values():
    """Literal pin — the one assertion a cap change cannot slip past.

    80 chars and 5 items are the server half of a two-layer cap; the other half
    is `maxLength={80}` on the five editor inputs
    (frontend/app/[locale]/producer/dashboard/edit/page.js:1272). Both landed
    together in MEH-210 Phase 2 (86eefcfd). Raising this constant alone makes
    the server accept a value the editor cannot produce.
    """
    assert _CUSTOM_QUESTION_MAX_LEN == 80
    assert _MAX_CUSTOM_QUESTIONS == 5


# ---------- count cap ----------


def test_five_max_length_questions_accepted():
    """The largest legal payload — 5 items at exactly the length ceiling."""
    payload = [f"{'ש' * (_CUSTOM_QUESTION_MAX_LEN - 1)}{i}" for i in range(5)]
    assert all(len(q) == _CUSTOM_QUESTION_MAX_LEN for q in payload)
    assert _questions(payload) == payload


def test_six_questions_rejected_in_hebrew():
    with pytest.raises(ValidationError) as exc:
        _questions([f"שאלה {i}" for i in range(6)])
    assert "אפשר עד 5 שאלות מותאמות" in str(exc.value)


def test_count_cap_applies_after_cleanup_not_before():
    """Seven raw items that clean down to five are ACCEPTED.

    The cap counts what will be stored, not what was posted — otherwise a
    payload with blank slots (exactly what the five-input editor sends when
    some are untouched) would 422 while storing nothing over the limit.
    """
    raw = ["א", "  ", "ב", "א", "ג", "", "ד", "ה"]
    assert _questions(raw) == ["א", "ב", "ג", "ד", "ה"]


# ---------- length cap ----------


def test_over_length_question_rejected_in_hebrew():
    with pytest.raises(ValidationError) as exc:
        _questions(["ש" * (_CUSTOM_QUESTION_MAX_LEN + 1)])
    assert "שאלה יכולה להכיל עד 80 תווים" in str(exc.value)


def test_length_is_measured_after_strip():
    """Padding must not push a legal question over the ceiling."""
    q = "ש" * _CUSTOM_QUESTION_MAX_LEN
    assert _questions([f"   {q}   "]) == [q]


# ---------- trim / empties ----------


def test_whitespace_only_items_dropped():
    assert _questions(["  ", "\t", "\n", "יש משלוח?"]) == ["יש משלוח?"]


def test_all_whitespace_payload_becomes_empty_list_not_none():
    """`[]`, not None — see the None/[] note below."""
    assert _questions(["  ", ""]) == []


# ---------- dedupe (the rule MEH-2153 adds) ----------


def test_exact_duplicates_deduped_order_preserving():
    """First occurrence wins and keeps its position.

    Order is load-bearing: the editor's five inputs are positional, so a
    normalisation that reordered them would silently rearrange the owner's
    public page.
    """
    assert _questions(["ב", "א", "ב", "ג", "א"]) == ["ב", "א", "ג"]


def test_dedupe_runs_after_strip():
    """ "  שאלה  " and "שאלה" are the same chip once rendered."""
    assert _questions(["שאלה", "  שאלה  ", "שאלה\t"]) == ["שאלה"]


def test_dedupe_is_exact_not_fuzzy():
    """Near-duplicates are the owner's call, not the validator's.

    The over-engineering guard on this ticket rules out content policing;
    case/punctuation folding would be exactly that.
    """
    assert _questions(["יש משלוח?", "יש משלוח"]) == ["יש משלוח?", "יש משלוח"]


def test_dedupe_can_rescue_an_over_count_payload():
    """Six items where two are identical clean down to five → accepted.

    This is the discriminating case for dedupe-before-count ordering: it fails
    against an implementation that counts first and dedupes after.
    """
    assert _questions(["א", "ב", "ג", "ד", "ה", "א"]) == ["א", "ב", "ג", "ד", "ה"]


# ---------- None vs [] ----------


def test_none_stays_none():
    assert _questions(None) is None


def test_empty_list_stays_empty_list():
    """NOT collapsed to None.

    The two are indistinguishable to every reader measured — the frontend goes
    through `getProducerQuestions` (frontend/lib/categoryQuestions.js:88),
    whose `producer.custom_questions?.length > 0` test sends both to the
    category defaults — but collapsing them would still change what the column
    stores, on a path this ticket has no reason to touch.
    """
    result = _questions([])
    assert result == []
    assert result is not None


def test_field_omitted_entirely_is_unset():
    """The dashboard PATCHes a subset; an absent field must not be written.

    `exclude_unset` at producer_me.py is what makes a partial payload partial,
    so the field has to stay genuinely unset rather than defaulting to None.
    """
    obj = ProducerUpdate(name="חוות השקמה")
    assert "custom_questions" not in obj.model_dump(exclude_unset=True)
    assert obj.custom_questions is None


# ---------- round-trip: the editor's own payload shape ----------


def test_editor_payload_round_trips_unchanged():
    """What CustomQuestionsCard actually sends (edit/page.js:1240-1242): the
    five inputs filtered to the non-blank ones, in order. A clean payload must
    come back byte-identical — the guard normalises, it does not rewrite.
    """
    payload = [
        "מה יש במלאי השבוע?",
        "יש משלוח לחיפה?",
        "אפשר להזמין לאירוע?",
    ]
    assert _questions(payload) == payload


def test_clearing_all_questions_does_not_422():
    """The editor clears by sending `[]` (every input blank → filter → []).

    A cleared field that 422s is the failure mode _normalize_contact_email was
    written to avoid; the same property has to hold here.
    """
    assert _questions([]) == []
