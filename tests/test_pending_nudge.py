"""
MEH-1818 — day-1 pending-nudge email.

Tests the public entry point app.services.pending_nudge.send_pending_nudges:
  1. Missing-items matrix: which items appear for which (status × images) cell.
  2. Status eligibility: one case per Producer.status value — pending and
     pending_whatsapp are candidates, the other three never are.
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

from app.models.models import Producer, User
from app.services import pending_nudge


# Producer.status is a free String(20) with no enum and no DB CHECK
# constraint. The authoritative enumeration is the admin filter pattern at
# backend/app/routers/admin.py:112 —
#     ^(pending|pending_whatsapp|approved|rejected|inactive|all)$
# ("all" is a query-filter sentinel, never a stored value). Every one of the
# five real values is asserted below, so a status added to that pattern
# without a decision here shows up as an uncovered value in review.
_ALL_PRODUCER_STATUSES = [
    "pending",
    "pending_whatsapp",
    "approved",
    "rejected",
    "inactive",
]
_NUDGEABLE_STATUSES = {"pending", "pending_whatsapp"}


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
) -> tuple[Producer, User]:
    """Create a Producer + linked User pair, backdated `hours_old` hours.
    `images=None` means the no-photo state (the MEH-799 default)."""
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
    )
    db.add(producer)
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
    """
    producer, user = _make_producer_user(db, status="pending", images=None)

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


def test_pending_whatsapp_with_photo_gets_phone_item_only(db, sent_log):
    """pending_whatsapp + images present → the phone item, and NOT the photo
    item."""
    _producer, _user = _make_producer_user(
        db,
        status="pending_whatsapp",
        images=["https://res.cloudinary.com/demo/image/upload/x.jpg"],
    )

    counts = pending_nudge.send_pending_nudges(db)

    assert counts == {"sent": 1, "stamped_nothing_missing": 0}
    _to, _subject, body = sent_log[0]
    assert pending_nudge._MISSING_ITEM_PHONE in body
    assert pending_nudge._MISSING_ITEM_PHOTO not in body


def test_pending_whatsapp_without_photo_gets_both_items(db, sent_log):
    """pending_whatsapp + no images → BOTH items in one email (not two
    emails)."""
    _producer, _user = _make_producer_user(
        db, status="pending_whatsapp", images=None
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
    _make_producer_user(
        db, status=status, images=None, email_local=f"st_{status}"
    )

    counts = pending_nudge.send_pending_nudges(db)

    if status in _NUDGEABLE_STATUSES:
        assert counts == {"sent": 1, "stamped_nothing_missing": 0}
        assert len(sent_log) == 1
    else:
        assert counts == {"sent": 0, "stamped_nothing_missing": 0}, (
            f"status={status!r} must NOT be a nudge candidate"
        )
        assert sent_log == [], (
            f"status={status!r} received {len(sent_log)} email(s)"
        )


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
