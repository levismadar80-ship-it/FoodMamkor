"""
MEH-1818 — day-1 pending-nudge email.

Tests the public entry point app.services.pending_nudge.send_pending_nudges:
  1. Missing-items matrix: which items appear for which (status × images) cell.
  2. Status eligibility: one case per Producer.status value — draft and
     pending are candidates, the other three never are.
  3. Once-only: a stamped producer is not re-sent, including the
     complete-but-unapproved producer that was stamped WITHOUT an email.
  4. The 24h floor.

send_email is monkeypatched at the pending_nudge module surface to a
list-append spy, so no Resend HTTP calls are attempted from the test process.
Same shape as tests/test_onboarding_followup.py (MEH-539/MEH-1587).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.models import Category, Producer, ProducerCategory, Product, User
from app.services import pending_nudge


# Producer.status is a free String(20) with no enum and no DB CHECK
# constraint. The authoritative enumeration is the admin filter pattern in
# backend/app/routers/admin.py's list_producers —
#     ^(draft|pending|approved|rejected|inactive|all)$
# ("all" is a query-filter sentinel, never a stored value). Every one of the
# five real values is asserted below, so a status added to that pattern
# without a decision here shows up as an uncovered value in review.
# (The old comment cited admin.py:112; that line number had drifted — the
# pattern sits around :418. Cited by section now, MEH-2100. A sixth value,
# `pending_whatsapp`, was removed in MEH-2124.)
#
# MEH-2100: `draft` is where every new registration lands, so it is the
# status the nudge most needs to reach. Deliberately re-declared here rather
# than imported from pending_nudge: this list is an INDEPENDENT statement of
# what should be nudgeable, and importing the module's own tuple would make
# the test agree with the code by construction.
_ALL_PRODUCER_STATUSES = [
    "draft",
    "pending",
    "approved",
    "rejected",
    "inactive",
]
_NUDGEABLE_STATUSES = {"draft", "pending"}


@pytest.fixture
def sent_log(monkeypatch):
    """Replace pending_nudge.send_email with a list-append spy.
    Each call appends (to, subject, body)."""
    captured: list[tuple[str, str, str]] = []

    def fake_send_email(to, subject, body, html=None):
        captured.append((to, subject, body))

    monkeypatch.setattr(pending_nudge, "send_email", fake_send_email)
    return captured


def _make_producer_user(
    db,
    *,
    status: str = "pending",
    images: list[str] | None = None,
    hours_old: int = 25,
    name: str = "ספיר ניסוי",
    email_local: str | None = None,
    phone_verified: bool = False,
    with_product: bool = False,
    with_category: bool = False,
) -> tuple[Producer, User]:
    """Create a Producer + linked User pair, backdated `hours_old` hours.
    `images=None` means the no-photo state (the MEH-799 default).

    MEH-2100: three axes were added because the nudge now reads the SHARED
    submit gate (`submission_gate.submission_missing_items`) instead of its own
    two-item rule. Under the old rule "phone verified" was INFERRED from a
    status value (`pending_whatsapp`, removed in MEH-2124); the gate reads the
    `phone_verified` column directly, so a fixture that means "her number is
    verified" now has to say so. Same for products and categories, which the
    old rule never looked at.

    Defaults stay at the empty/unverified end so the no-photo cases below are
    unchanged and every "complete" case has to state its completeness
    explicitly — the fail-closed direction for a fixture.
    """
    backdated = datetime.now(timezone.utc) - timedelta(hours=hours_old)
    producer = Producer(
        name="חוות הניסוי",
        description="Test producer",
        city="תל אביב",
        lat=32.0853,
        lng=34.7818,
        status=status,
        images=images if images is not None else [],
        created_at=backdated,
        phone_verified=phone_verified,
    )
    db.add(producer)
    db.flush()

    if with_category:
        category = Category(name=f"קטגוריה {uuid.uuid4().hex[:6]}", emoji="🥬")
        db.add(category)
        db.flush()
        db.add(ProducerCategory(producer_id=producer.id, category_id=category.id))
    if with_product:
        db.add(Product(producer_id=producer.id, name="מוצר ניסוי"))
    db.flush()

    user = User(
        email=f"{email_local or uuid.uuid4().hex[:8]}@example.com",
        name=name,
        password_hash="$2b$12$placeholder",
        role="producer",
        producer_id=producer.id,
        is_producer=True,
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(producer)
    db.refresh(user)
    return producer, user


# --- 1. the missing-items matrix ---------------------------------------------
#
# (status × has-photo) is a MATRIX, not two lists — all four cells are
# asserted. Counting the two axes separately is what leaves an orphan cell
# with no spec and no test (CLAUDE.md, state × count).


def test_pending_without_photo_gets_photo_item_only(db, sent_log):
    """pending + no images → the photo item, and NOT the phone item.

    `pending` means the WhatsApp number is already verified, so naming phone
    verification here would be false.

    MEH-2100: that verification is now STATED (`phone_verified=True`) rather
    than inferred from the status value, and the product/category axes are
    filled so the photo really is the only thing missing — otherwise this
    would pass while the body also carried the product line, asserting less
    than it appears to.
    """
    producer, user = _make_producer_user(
        db,
        status="pending",
        images=None,
        phone_verified=True,
        with_product=True,
        with_category=True,
    )

    counts = pending_nudge.send_pending_nudges(db)

    assert counts == {"sent": 1, "stamped_nothing_missing": 0}
    assert len(sent_log) == 1
    to, subject, body = sent_log[0]
    assert to == user.email
    assert subject == pending_nudge._SUBJECT
    assert body.startswith("היי ספיר,")
    assert pending_nudge._MISSING_ITEM_PHOTO in body
    assert pending_nudge._MISSING_ITEM_PHONE not in body

    db.refresh(producer)
    assert producer.email_pending_nudge_sent_at is not None


def test_unverified_phone_with_photo_gets_phone_item_only(db, sent_log):
    """Unverified phone + images present → the phone item, and NOT the photo
    item.

    MEH-2124: this cell used to be expressed as `status="pending_whatsapp"`,
    which MEANT an unverified phone (MEH-745). That status was removed, so the
    cell is now stated the way the gate has read it since MEH-2100 — on the
    `phone_verified` column — which is strictly more direct.
    """
    _producer, _user = _make_producer_user(
        db,
        status="pending",
        images=["https://res.cloudinary.com/demo/image/upload/x.jpg"],
        # phone_verified stays False (the fixture default) — the whole point
        # of this cell.
        with_product=True,
        with_category=True,
    )

    counts = pending_nudge.send_pending_nudges(db)

    assert counts == {"sent": 1, "stamped_nothing_missing": 0}
    _to, _subject, body = sent_log[0]
    assert pending_nudge._MISSING_ITEM_PHONE in body
    assert pending_nudge._MISSING_ITEM_PHOTO not in body


def test_unverified_phone_without_photo_gets_both_items(db, sent_log):
    """Unverified phone + no images → BOTH items in one email (not two
    emails). Same MEH-2124 restatement as the case above."""
    _producer, _user = _make_producer_user(
        db,
        status="pending",
        images=None,
        with_product=True,
        with_category=True,
    )

    counts = pending_nudge.send_pending_nudges(db)

    assert counts == {"sent": 1, "stamped_nothing_missing": 0}
    assert len(sent_log) == 1, "both-missing must be ONE email, not two"
    _to, _subject, body = sent_log[0]
    assert pending_nudge._MISSING_ITEM_PHOTO in body
    assert pending_nudge._MISSING_ITEM_PHONE in body


def test_complete_but_unapproved_is_stamped_without_email(db, sent_log):
    """pending + images present → nothing is missing.

    The business is waiting on Sapir, not on itself, so "נשאר להשלים" with an
    empty list would be false. It is stamped anyway, which is what keeps it
    out of the candidate set on every later run.
    """
    producer, _user = _make_producer_user(
        db,
        status="pending",
        images=["https://res.cloudinary.com/demo/image/upload/x.jpg"],
        # MEH-2100: "complete" is now the SUBMIT GATE's definition, not the old
        # two-item one. A photo alone no longer means nothing is missing.
        phone_verified=True,
        with_product=True,
        with_category=True,
    )

    counts = pending_nudge.send_pending_nudges(db)

    assert counts == {"sent": 0, "stamped_nothing_missing": 1}
    assert sent_log == [], "a producer with nothing missing must not be emailed"

    db.refresh(producer)
    assert producer.email_pending_nudge_sent_at is not None, (
        "stamping is what prevents a later run from re-evaluating and "
        "emailing this producer"
    )


# --- 2. status eligibility ----------------------------------------------------


@pytest.mark.parametrize("status", _ALL_PRODUCER_STATUSES)
def test_only_pending_statuses_are_candidates(db, sent_log, status):
    """One case per Producer.status value.

    Every producer here has no photo, so the ONLY thing deciding the outcome
    is the status gate. approved / rejected / inactive must receive nothing:
    "we are waiting for you to finish" is false for all three and actively
    insulting to a rejected business — the MEH-1587 failure, in a new module.
    """
    _make_producer_user(db, status=status, images=None, email_local=f"st_{status}")

    counts = pending_nudge.send_pending_nudges(db)

    if status in _NUDGEABLE_STATUSES:
        assert counts == {"sent": 1, "stamped_nothing_missing": 0}
        assert len(sent_log) == 1
    else:
        assert counts == {"sent": 0, "stamped_nothing_missing": 0}, (
            f"status={status!r} must NOT be a nudge candidate"
        )
        assert sent_log == [], f"status={status!r} received {len(sent_log)} email(s)"


@pytest.mark.parametrize("status", _ALL_PRODUCER_STATUSES)
def test_ineligible_status_leaves_column_null(db, sent_log, status):
    """A filtered-out producer must not be stamped.

    Guards the resume path: a business that moves INTO pending later must
    still be nudgeable, so it cannot carry a stamp it never earned.
    """
    producer, _user = _make_producer_user(
        db, status=status, images=None, email_local=f"null_{status}"
    )

    pending_nudge.send_pending_nudges(db)
    db.refresh(producer)

    if status in _NUDGEABLE_STATUSES:
        assert producer.email_pending_nudge_sent_at is not None
    else:
        assert producer.email_pending_nudge_sent_at is None, (
            f"status={status!r} was filtered out but still got stamped"
        )


# --- 3. once-only -------------------------------------------------------------


def test_second_run_does_not_resend(db, sent_log):
    """The headline guarantee: ONE email, once.

    The second run's WHERE clause excludes the producer because
    email_pending_nudge_sent_at is no longer NULL.
    """
    _producer, _user = _make_producer_user(db, status="pending", images=None)

    first = pending_nudge.send_pending_nudges(db)
    second = pending_nudge.send_pending_nudges(db)

    assert first == {"sent": 1, "stamped_nothing_missing": 0}
    assert second == {"sent": 0, "stamped_nothing_missing": 0}
    assert len(sent_log) == 1, "the nudge must never be sent twice"


def test_stamped_without_email_is_not_revisited_after_losing_photo(db, sent_log):
    """The stamp-without-email branch is durable.

    A complete pending producer is stamped and not emailed. If it later loses
    its photo it becomes "missing an item" again — but it must still not be
    mailed, because the stamp took it out of the candidate set permanently.
    This is the case a naive `IS NULL`-only design would re-send.
    """
    producer, _user = _make_producer_user(
        db,
        status="pending",
        images=["https://res.cloudinary.com/demo/image/upload/x.jpg"],
        # MEH-2100: complete by the submit gate's definition — see the sibling
        # test above.
        phone_verified=True,
        with_product=True,
        with_category=True,
    )

    assert pending_nudge.send_pending_nudges(db) == {
        "sent": 0,
        "stamped_nothing_missing": 1,
    }

    producer.images = []
    db.commit()

    assert pending_nudge.send_pending_nudges(db) == {
        "sent": 0,
        "stamped_nothing_missing": 0,
    }
    assert sent_log == []


def test_producer_without_a_user_row_is_skipped_and_left_unstamped(db, sent_log):
    """A producer with no linked User has no address to send to.

    Both halves matter. Nothing is sent — there is nowhere to send it. And
    the row is deliberately left UNSTAMPED: the column means "has been
    nudged", and this producer has not been, so if a User row appears later
    the nudge still fires. Stamping here would silently consume the single
    nudge this business is entitled to.
    """
    producer = Producer(
        name="חוות ללא משתמשת",
        description="Test producer with no linked user",
        city="תל אביב",
        lat=32.0853,
        lng=34.7818,
        status="pending",
        images=[],
        created_at=datetime.now(timezone.utc) - timedelta(hours=25),
    )
    db.add(producer)
    db.commit()
    db.refresh(producer)

    counts = pending_nudge.send_pending_nudges(db)

    assert counts == {"sent": 0, "stamped_nothing_missing": 0}
    assert sent_log == []
    db.refresh(producer)
    assert producer.email_pending_nudge_sent_at is None, (
        "an unaddressable producer must stay nudgeable"
    )


# --- 4. the 24h floor ---------------------------------------------------------


def test_producer_younger_than_24h_is_not_yet_due(db, sent_log):
    """Registered 2 hours ago → not a candidate. The nudge is day-1, not
    instant; a business still filling in its profile must not be chased."""
    producer, _user = _make_producer_user(
        db, status="pending", images=None, hours_old=2
    )

    counts = pending_nudge.send_pending_nudges(db)

    assert counts == {"sent": 0, "stamped_nothing_missing": 0}
    assert sent_log == []
    db.refresh(producer)
    assert producer.email_pending_nudge_sent_at is None


def test_producer_older_than_24h_is_due(db, sent_log):
    """The other side of the same boundary — 25 hours old and it fires.

    Paired with the test above deliberately: a cutoff assertion that only
    ever tests the excluded side passes just as well when the filter is
    inverted or dropped.
    """
    _producer, _user = _make_producer_user(
        db, status="pending", images=None, hours_old=25
    )

    counts = pending_nudge.send_pending_nudges(db)

    assert counts == {"sent": 1, "stamped_nothing_missing": 0}
    assert len(sent_log) == 1


# --- 5. MEH-2111: the day-3 / day-7 sequence ---------------------------------
#
# The subjects are re-declared here rather than imported from the module, for
# the same reason `_ALL_PRODUCER_STATUSES` is: importing the module's own
# constant would make the assertion agree with the code by construction, and
# these strings are Sapir-approved copy whose whole point is that they are what
# they are. `[מספר]` is her placeholder token; a sent subject must never still
# contain it.
_SUBJECT_DAY_1 = "עוד צעד קטן — והעסק שלך עובר לבדיקה"
_SUBJECT_DAY_3_TEMPLATE = "נשארו [מספר] צעדים — והעסק שלכם עולה לאתר"
_SUBJECT_DAY_7_TEMPLATE = "המקום שלכם שמור — נשארו [מספר] צעדים"
_COUNT_TOKEN = "[מספר]"


def _backdate(db, producer, *, days_old: float, sent_days_after: float | None):
    """Place a producer at `days_old` days of age, with its nudge stamp set
    `sent_days_after` days after creation (None = never nudged).

    The stamp is expressed RELATIVE TO created_at on purpose: that is the
    comparison the implementation makes, so a fixture written in absolute time
    would drift away from the thing under test the moment the window moves.
    """
    created = datetime.now(timezone.utc) - timedelta(days=days_old)
    producer.created_at = created
    producer.email_pending_nudge_sent_at = (
        created + timedelta(days=sent_days_after)
        if sent_days_after is not None
        else None
    )
    db.commit()
    db.refresh(producer)
    return producer


def _advance(db, producer, days: float):
    """Simulate `days` of real time passing, by shifting the row's timestamps
    BACKWARDS together.

    Both columns move, and that is the whole point. Rewinding `created_at`
    alone leaves the nudge stamp at wall-clock now — a state that cannot occur,
    because the stamp is written at the moment a mark is reached, i.e. always
    close to `created_at + mark`. A fixture that leaves it ahead of that puts
    the producer in a world where it was nudged for a mark it had not reached,
    and the sequence correctly declines to fire. (Written the wrong way first;
    the test failed and the code was right.)
    """
    delta = timedelta(days=days)
    producer.created_at = producer.created_at - delta
    if producer.email_pending_nudge_sent_at is not None:
        producer.email_pending_nudge_sent_at = (
            producer.email_pending_nudge_sent_at - delta
        )
    db.commit()
    db.refresh(producer)


def _incomplete_draft(db, **kw):
    """A draft missing exactly ONE thing (the photo), so the subject's count is
    a known 1 and any change to it is visible."""
    return _make_producer_user(
        db,
        status="draft",
        images=None,
        phone_verified=True,
        with_product=True,
        with_category=True,
        **kw,
    )


def test_draft_stamped_at_day_1_is_due_again_at_day_3(db, sent_log):
    """The headline of this ticket: the sequence continues past day 1.

    Fails against the pre-MEH-2111 module for the right reason — there the
    candidate query is `sent_at IS NULL`, so an already-stamped draft is never
    reconsidered and `sent_log` stays empty.
    """
    producer, user = _incomplete_draft(db)
    _backdate(db, producer, days_old=3.1, sent_days_after=1)

    counts = pending_nudge.send_pending_nudges(db)

    assert counts == {"sent": 1, "stamped_nothing_missing": 0}
    assert len(sent_log) == 1
    to, subject, _body = sent_log[0]
    assert to == user.email
    assert subject == _SUBJECT_DAY_3_TEMPLATE.replace(_COUNT_TOKEN, "1")


def test_draft_is_not_due_before_the_day_3_boundary(db, sent_log):
    """The excluded side of the same boundary.

    Paired with the test above deliberately: a window assertion that only ever
    tests the firing side passes just as well when the window is dropped.
    """
    producer, _user = _incomplete_draft(db)
    _backdate(db, producer, days_old=2.9, sent_days_after=1)

    assert pending_nudge.send_pending_nudges(db) == {
        "sent": 0,
        "stamped_nothing_missing": 0,
    }
    assert sent_log == []


def test_draft_stamped_at_day_3_is_due_again_at_day_7(db, sent_log):
    producer, _user = _incomplete_draft(db)
    _backdate(db, producer, days_old=7.2, sent_days_after=3)

    counts = pending_nudge.send_pending_nudges(db)

    assert counts == {"sent": 1, "stamped_nothing_missing": 0}
    assert sent_log[0][1] == _SUBJECT_DAY_7_TEMPLATE.replace(_COUNT_TOKEN, "1")


def test_the_sequence_ends_after_day_7(db, sent_log):
    """There is no day-14. A draft that ignored all three is left alone."""
    producer, _user = _incomplete_draft(db)
    _backdate(db, producer, days_old=40, sent_days_after=7)

    assert pending_nudge.send_pending_nudges(db) == {
        "sent": 0,
        "stamped_nothing_missing": 0,
    }
    assert sent_log == []


def test_each_mark_fires_exactly_once(db, sent_log):
    """Two runs inside the same day-mark window send one email, not two.

    This is the property a `sent_at IS NULL`-free query could easily lose: the
    second run still finds the row, and only the mark comparison stops it.
    """
    producer, _user = _incomplete_draft(db)
    _backdate(db, producer, days_old=3.1, sent_days_after=1)

    first = pending_nudge.send_pending_nudges(db)
    second = pending_nudge.send_pending_nudges(db)

    assert first == {"sent": 1, "stamped_nothing_missing": 0}
    assert second == {"sent": 0, "stamped_nothing_missing": 0}
    assert len(sent_log) == 1


def test_a_draft_first_seen_late_gets_one_email_not_a_backlog(db, sent_log):
    """Age 5 days, never nudged: marks 1 and 3 are both "reached", and only the
    highest may fire. Sending both would open the sequence with two emails in
    one minute — the exact spam the behavioural framing is meant to avoid."""
    producer, _user = _incomplete_draft(db)
    _backdate(db, producer, days_old=5, sent_days_after=None)

    counts = pending_nudge.send_pending_nudges(db)

    assert counts == {"sent": 1, "stamped_nothing_missing": 0}
    assert len(sent_log) == 1
    assert sent_log[0][1] == _SUBJECT_DAY_3_TEMPLATE.replace(_COUNT_TOKEN, "1")


def test_full_sequence_is_three_emails_in_order(db, sent_log):
    """End to end over the whole lifetime of an ignored draft: day 1, 3, 7 —
    three emails, three distinct subjects, in that order, and nothing after.

    Asserts the COUNT of sends (3) rather than a sum of literals, so adding a
    fourth mark moves this number instead of quietly passing.
    """
    producer, _user = _incomplete_draft(db)

    # Starts at 25h old (the fixture default), then time passes. Every run uses
    # the stamp the PREVIOUS run actually wrote — no hand-placed bookkeeping.
    for elapsed_days in (0, 2, 4, 13):
        _advance(db, producer, elapsed_days)
        pending_nudge.send_pending_nudges(db)

    assert len(sent_log) == 3
    assert [s for _to, s, _b in sent_log] == [
        _SUBJECT_DAY_1,
        _SUBJECT_DAY_3_TEMPLATE.replace(_COUNT_TOKEN, "1"),
        _SUBJECT_DAY_7_TEMPLATE.replace(_COUNT_TOKEN, "1"),
    ]


def test_a_draft_that_submitted_gets_no_further_nudge(db, sent_log):
    """Submitting flips draft -> pending. The sequence is a draft-only device,
    so the day-3 mark must not fire for a business that already acted."""
    producer, _user = _incomplete_draft(db)
    _backdate(db, producer, days_old=3.1, sent_days_after=1)
    producer.status = "pending"
    db.commit()

    assert pending_nudge.send_pending_nudges(db) == {
        "sent": 0,
        "stamped_nothing_missing": 0,
    }
    assert sent_log == []


def test_a_complete_draft_is_stamped_at_the_later_mark_but_not_emailed(db, sent_log):
    """Skip-on-empty holds at every mark, not just at day 1.

    The stamp still moves — that is what carries the producer past this mark —
    but the owner hears nothing, because "נשאר להשלים" above an empty list
    would be a false statement.
    """
    producer, _user = _make_producer_user(
        db,
        status="draft",
        images=["https://res.cloudinary.com/demo/image/upload/x.jpg"],
        phone_verified=True,
        with_product=True,
        with_category=True,
    )
    _backdate(db, producer, days_old=3.1, sent_days_after=1)

    assert pending_nudge.send_pending_nudges(db) == {
        "sent": 0,
        "stamped_nothing_missing": 1,
    }
    assert sent_log == []


def test_legacy_pending_still_gets_exactly_one_email_ever(db, sent_log):
    """The unchanged-behaviour guarantee, asserted at the age where the DRAFT
    sequence would have fired twice more.

    `pending` means the business is waiting on Sapir; chasing it on day 3 and
    day 7 would be chasing someone for work she has already done.
    """
    producer, _user = _make_producer_user(
        db,
        status="pending",
        images=None,
        phone_verified=True,
        with_product=True,
        with_category=True,
    )
    _backdate(db, producer, days_old=30, sent_days_after=1)

    assert pending_nudge.send_pending_nudges(db) == {
        "sent": 0,
        "stamped_nothing_missing": 0,
    }
    assert sent_log == []


def test_the_count_is_live_and_tracks_what_the_body_lists(db, sent_log):
    """`[מספר]` is resolved at SEND time, not at day-1 time — the whole reason
    the ticket calls it live. Here the owner fixes one of two items between the
    day-3 and day-7 sends, and the day-7 subject must say 1, not 2.

    It also pins the count to the number of lines the body prints. A subject
    promising N steps above a body listing fewer is a contradiction the reader
    sees; the assertion below reads the body rather than trusting the header.
    """
    producer, _user = _make_producer_user(
        db,
        status="draft",
        images=None,
        phone_verified=False,
        with_product=True,
        with_category=True,
    )

    _backdate(db, producer, days_old=3.1, sent_days_after=1)
    pending_nudge.send_pending_nudges(db)

    # She verifies her number, and four more days pass.
    producer.phone_verified = True
    db.commit()
    _advance(db, producer, 4)
    pending_nudge.send_pending_nudges(db)

    assert len(sent_log) == 2
    day3_subject, day3_body = sent_log[0][1], sent_log[0][2]
    day7_subject, day7_body = sent_log[1][1], sent_log[1][2]

    assert day3_subject == _SUBJECT_DAY_3_TEMPLATE.replace(_COUNT_TOKEN, "2")
    assert day7_subject == _SUBJECT_DAY_7_TEMPLATE.replace(_COUNT_TOKEN, "1")

    # The count and the body must agree. Derived from the body, never restated.
    assert day3_body.count("📷") + day3_body.count("✅") == 2
    assert day7_body.count("📷") + day7_body.count("✅") == 1


def test_no_sent_subject_still_carries_the_placeholder(db, sent_log):
    """A guard against the substitution silently not happening — the failure
    mode where the owner receives a literal `[מספר]` in her inbox. Cheap, and
    the kind of thing no other assertion here would catch on its own."""
    producer, _user = _incomplete_draft(db)
    _backdate(db, producer, days_old=7.2, sent_days_after=3)

    pending_nudge.send_pending_nudges(db)

    assert sent_log, "control: nothing was sent, so this test proved nothing"
    for _to, subject, _body in sent_log:
        assert _COUNT_TOKEN not in subject
