"""
MEH-539 Phase 2C — onboarding follow-up email scheduler.

Tests the public entry point app.services.onboarding_followup.send_due_followups:
  1. A 2-day-old producer becomes step-2 due → returns {2: 1, 3: 0, 4: 0, 5: 0}.
  2. Idempotency: the same producer called twice → second call returns
     {2: 0, ...} because email_followup_2_sent_at is now NOT NULL.
  3. Email-5 dual-variant: licensed (status='approved' + license number set)
     → subject A; unlicensed (any other state) → subject B.

send_email is monkeypatched at the onboarding_followup module surface to a
list-append spy, so no Resend HTTP calls are attempted from the test process.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.models import Producer, User
from app.services import onboarding_followup


@pytest.fixture
def sent_log(monkeypatch):
    """Replace onboarding_followup.send_email with a list-append spy.
    Each call appends (to, subject, body)."""
    captured: list[tuple[str, str, str]] = []

    def fake_send_email(to, subject, body, html=None):
        captured.append((to, subject, body))

    monkeypatch.setattr(onboarding_followup, "send_email", fake_send_email)
    return captured


def _make_producer_user(
    db,
    *,
    days_old: int,
    status: str = "approved",
    license_number: str | None = None,
    name: str = "ספיר ניסוי",
    email_local: str | None = None,
) -> tuple[Producer, User]:
    """Create a Producer + linked User pair, with the producer's created_at
    backdated to `days_old` days ago. Returns the refreshed (producer, user)."""
    backdated = datetime.now(timezone.utc) - timedelta(days=days_old, hours=1)
    producer = Producer(
        name="חוות הניסוי",
        description="Test producer",
        city="תל אביב",
        lat=32.0853,
        lng=34.7818,
        status=status,
        is_verified=True,
        producer_license_number=license_number,
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


def test_step2_due_after_two_days(db, sent_log):
    """A 2-day-old producer with no follow-up sent yet → step 2 fires once."""
    producer, user = _make_producer_user(db, days_old=2)

    counts = onboarding_followup.send_due_followups(db)

    assert counts == {2: 1, 3: 0, 4: 0, 5: 0}
    assert len(sent_log) == 1
    to, subject, body = sent_log[0]
    assert to == user.email
    assert subject == onboarding_followup._EMAIL_2_SUBJECT
    # First-name extraction: "ספיר ניסוי" → "ספיר"
    assert body.startswith("היי ספיר,")

    db.refresh(producer)
    assert producer.email_followup_2_sent_at is not None
    assert producer.email_followup_3_sent_at is None
    assert producer.email_followup_4_sent_at is None
    assert producer.email_followup_5_sent_at is None


def test_step2_idempotent_on_second_run(db, sent_log):
    """Re-running the same scheduler on the same producer skips them —
    email_followup_2_sent_at is NOT NULL after the first call, so the second
    call's WHERE clause excludes them."""
    _producer, _user = _make_producer_user(db, days_old=2)

    first = onboarding_followup.send_due_followups(db)
    second = onboarding_followup.send_due_followups(db)

    assert first == {2: 1, 3: 0, 4: 0, 5: 0}
    assert second == {2: 0, 3: 0, 4: 0, 5: 0}
    assert len(sent_log) == 1  # only the first call sent


def test_step5_variant_a_for_licensed_approved(db, sent_log):
    """status='approved' AND non-blank producer_license_number → variant A."""
    producer, _user = _make_producer_user(
        db,
        days_old=30,
        status="approved",
        license_number="12345",
    )

    counts = onboarding_followup.send_due_followups(db)

    # Producer is 30 days old → ALL four steps fire (2, 3, 4, AND 5).
    # The point of this test is the Email-5 subject, not the count shape.
    assert counts[5] == 1
    # Pull the step-5 send out of the log (any send whose subject matches).
    step5_sends = [
        s for s in sent_log if s[1] == onboarding_followup._EMAIL_5A_SUBJECT
    ]
    assert len(step5_sends) == 1, "expected exactly one variant-A send"
    assert not [
        s for s in sent_log if s[1] == onboarding_followup._EMAIL_5B_SUBJECT
    ], "variant B must not fire for an approved+licensed producer"

    db.refresh(producer)
    assert producer.email_followup_5_sent_at is not None


def test_step5_variant_b_for_pending_or_unlicensed(db, sent_log):
    """Anything other than (status='approved' AND license set) → variant B.
    Three sub-cases under one test to assert the predicate covers the space:
      a) status=approved, license=None → variant B (no license)
      b) status=approved, license='   ' (whitespace) → variant B (normalised)
      c) status=pending, license='999' → variant B (not approved)
    """
    # (a) approved but no license
    _make_producer_user(
        db,
        days_old=30,
        status="approved",
        license_number=None,
        email_local="no_license",
    )
    # (b) approved but whitespace-only license — same as no license per
    # license_validation.py:30 _normalize_license convention.
    _make_producer_user(
        db,
        days_old=30,
        status="approved",
        license_number="   ",
        email_local="ws_license",
    )
    # (c) license supplied but status not approved
    _make_producer_user(
        db,
        days_old=30,
        status="pending",
        license_number="999",
        email_local="pending_status",
    )

    counts = onboarding_followup.send_due_followups(db)

    assert counts[5] == 3, "all three producers should hit step 5 once"
    variant_a_sends = [
        s for s in sent_log if s[1] == onboarding_followup._EMAIL_5A_SUBJECT
    ]
    variant_b_sends = [
        s for s in sent_log if s[1] == onboarding_followup._EMAIL_5B_SUBJECT
    ]
    assert variant_a_sends == [], "variant A must not fire for any of (a-c)"
    assert len(variant_b_sends) == 3, "all three should get variant B"
