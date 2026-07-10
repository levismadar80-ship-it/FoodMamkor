"""MEH-509 PR2b — after-hours watchdog.

Tests the watchdog's three decision branches (within-hours skip,
after-hours send, vacation send) plus the idempotency contract
(bot_replied=True is set BEFORE the send attempt, so a send failure
permanently retires the message — one shot, no retry storm).

is_within_business_hours() is intentionally pure (accepts a `now`
parameter) so we don't need freezegun: tests pass a frozen tz-aware
datetime directly.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import inspect as sa_inspect

from app.models import AdminSetting, InboundMessage
from app.services.auto_reply_watchdog import (
    TEMPLATE_AFTER_HOURS,
    TEMPLATE_VACATION,
    _decide_template,
    is_within_business_hours,
    run_watchdog,
)
from app.services.whatsapp_templates import AfterHoursResponseHe, VacationResponseHeV2

IL = ZoneInfo("Asia/Jerusalem")


# Schema bootstrap — the `inbound_messages` table is created by Alembic in
# CI; the local pytest run uses Base.metadata.create_all() which already
# picks it up via the InboundMessage class import. Belt-and-suspenders:
# skip the test module if the table didn't materialize (would surface as
# an obvious skip in CI rather than a confusing OperationalError).
@pytest.fixture(autouse=True)
def _require_inbound_messages_table(db):
    inspector = sa_inspect(db.bind)
    if "inbound_messages" not in inspector.get_table_names():
        pytest.skip("inbound_messages table missing — Alembic migration not applied")


# ---- Business hours pure function ------------------------------------------


@pytest.mark.parametrize(
    "moment,expected",
    [
        (datetime(2026, 5, 24, 10, 0, tzinfo=IL), True),   # Sunday 10:00
        (datetime(2026, 5, 28, 18, 59, tzinfo=IL), True),  # Thursday 18:59
        (datetime(2026, 5, 28, 19, 0, tzinfo=IL), False),  # Thursday 19:00 (half-open)
        (datetime(2026, 5, 29, 12, 0, tzinfo=IL), True),   # Friday 12:00
        (datetime(2026, 5, 29, 13, 0, tzinfo=IL), False),  # Friday 13:00 (half-open)
        (datetime(2026, 5, 30, 11, 0, tzinfo=IL), False),  # Saturday closed
        (datetime(2026, 5, 24, 8, 59, tzinfo=IL), False),  # Sunday 08:59 pre-open
        (datetime(2026, 5, 24, 22, 0, tzinfo=IL), False),  # Sunday 22:00 post-close
    ],
)
def test_is_within_business_hours(moment, expected):
    assert is_within_business_hours(moment) is expected


def test_is_within_business_hours_naive_treated_as_utc():
    # 2026-05-24 (Sunday) 07:00 UTC == 10:00 Asia/Jerusalem (UTC+3 IDT) — within hours.
    naive = datetime(2026, 5, 24, 7, 0)
    assert is_within_business_hours(naive) is True


# ---- _decide_template (pure routing) ---------------------------------------


def test_decide_template_vacation_wins_over_business_hours():
    # Sunday 10:00 IL == within hours, but vacation overrides.
    moment = datetime(2026, 5, 24, 10, 0, tzinfo=IL)
    template = _decide_template(
        vacation_active=True,
        vacation_return_date=date(2026, 6, 1),
        now=moment,
    )
    assert isinstance(template, VacationResponseHeV2)
    assert template.name == TEMPLATE_VACATION
    assert template.return_date == "2026-06-01"


def test_decide_template_after_hours():
    moment = datetime(2026, 5, 24, 22, 0, tzinfo=IL)
    template = _decide_template(
        vacation_active=False, vacation_return_date=None, now=moment
    )
    assert isinstance(template, AfterHoursResponseHe)
    assert template.name == TEMPLATE_AFTER_HOURS


def test_decide_template_within_hours_returns_none():
    moment = datetime(2026, 5, 24, 10, 0, tzinfo=IL)
    template = _decide_template(
        vacation_active=False, vacation_return_date=None, now=moment
    )
    assert template is None


# ---- run_watchdog end-to-end -----------------------------------------------


# Frozen `now` anchors used by every end-to-end test below. run_watchdog
# computes cutoff = now - 30min, so received_at must live within that
# window relative to the SAME frozen now (NOT real datetime.utcnow()).
# Both anchors are naive UTC because that's what InboundMessage.received_at
# stores; the watchdog only converts to Asia/Jerusalem for the business-
# hours check.
NOW_WITHIN_HOURS_UTC = datetime(2026, 5, 24, 7, 0)   # Sun 10:00 IL (UTC+3 IDT)
NOW_AFTER_HOURS_UTC = datetime(2026, 5, 24, 19, 0)   # Sun 22:00 IL


def _make_inbound(
    db,
    *,
    phone="+972501112222",
    body="היי, אפשר להזמין?",
    minutes_ago=5,
    anchor=NOW_AFTER_HOURS_UTC,
):
    msg = InboundMessage(
        from_phone=phone,
        body=body,
        received_at=anchor - timedelta(minutes=minutes_ago),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def _frozen_now_within_hours():
    return NOW_WITHIN_HOURS_UTC


def _frozen_now_after_hours():
    return NOW_AFTER_HOURS_UTC


def test_run_watchdog_vacation_active_sends_vacation_template(db):
    msg = _make_inbound(db, anchor=NOW_WITHIN_HOURS_UTC)
    db.add(AdminSetting(key="vacation_mode_active", value="true"))
    db.add(AdminSetting(key="vacation_return_date", value="2026-06-05"))
    db.commit()

    with patch(
        "app.services.auto_reply_watchdog.send_template",
        return_value=True,
    ) as send_mock:
        counters = run_watchdog(db, now=_frozen_now_within_hours())

    send_mock.assert_called_once()
    args, _ = send_mock.call_args
    assert args[0] == "+972501112222"
    # MEH-672: second positional arg is now a typed template instance.
    assert isinstance(args[1], VacationResponseHeV2)
    assert args[1].name == TEMPLATE_VACATION
    assert args[1].return_date == "2026-06-05"
    assert counters["sent_vacation"] == 1
    db.refresh(msg)
    assert msg.bot_replied is True
    assert msg.bot_template_sent == TEMPLATE_VACATION


def test_run_watchdog_outside_hours_sends_after_hours_template(db):
    msg = _make_inbound(db)
    with patch(
        "app.services.auto_reply_watchdog.send_template",
        return_value=True,
    ) as send_mock:
        counters = run_watchdog(db, now=_frozen_now_after_hours())

    send_mock.assert_called_once()
    args, _ = send_mock.call_args
    # MEH-672: second positional arg is now a typed template instance.
    assert isinstance(args[1], AfterHoursResponseHe)
    assert args[1].name == TEMPLATE_AFTER_HOURS
    assert counters["sent_after_hours"] == 1
    db.refresh(msg)
    assert msg.bot_replied is True
    assert msg.bot_template_sent == TEMPLATE_AFTER_HOURS


def test_run_watchdog_within_hours_sends_nothing(db):
    msg = _make_inbound(db, anchor=NOW_WITHIN_HOURS_UTC)
    with patch(
        "app.services.auto_reply_watchdog.send_template",
        return_value=True,
    ) as send_mock:
        counters = run_watchdog(db, now=_frozen_now_within_hours())

    send_mock.assert_not_called()
    assert counters["skipped_within_hours"] == 1
    assert counters["sent_after_hours"] == 0
    assert counters["sent_vacation"] == 0
    db.refresh(msg)
    # Untouched — humans can still pick this up.
    assert msg.bot_replied is False
    assert msg.bot_template_sent is None


def test_run_watchdog_idempotent_skips_already_replied(db):
    msg = _make_inbound(db)
    msg.bot_replied = True
    msg.bot_template_sent = TEMPLATE_AFTER_HOURS
    db.commit()

    with patch(
        "app.services.auto_reply_watchdog.send_template",
        return_value=True,
    ) as send_mock:
        counters = run_watchdog(db, now=_frozen_now_after_hours())

    send_mock.assert_not_called()
    assert counters["scanned"] == 0


def test_run_watchdog_send_failure_does_not_block_batch(db):
    msg_a = _make_inbound(db, phone="+972500000001", minutes_ago=10)
    msg_b = _make_inbound(db, phone="+972500000002", minutes_ago=5)

    call_count = {"n": 0}

    def fake_send(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise RuntimeError("simulated meta 5xx")
        return True

    with patch(
        "app.services.auto_reply_watchdog.send_template",
        side_effect=fake_send,
    ) as send_mock:
        counters = run_watchdog(db, now=_frozen_now_after_hours())

    assert send_mock.call_count == 2
    assert counters["send_failed"] == 1
    assert counters["sent_after_hours"] == 1

    db.refresh(msg_a)
    db.refresh(msg_b)
    # Both flipped to bot_replied=True (idempotency lock) BEFORE attempted send.
    assert msg_a.bot_replied is True
    assert msg_b.bot_replied is True
    # Audit trail: failed one has NULL bot_template_sent (we tried + failed).
    assert msg_a.bot_template_sent is None
    assert msg_b.bot_template_sent == TEMPLATE_AFTER_HOURS


def test_run_watchdog_ignores_messages_older_than_30_minutes(db):
    msg_old = _make_inbound(db, phone="+972500000003", minutes_ago=45)
    msg_fresh = _make_inbound(db, phone="+972500000004", minutes_ago=10)
    with patch(
        "app.services.auto_reply_watchdog.send_template",
        return_value=True,
    ):
        counters = run_watchdog(db, now=_frozen_now_after_hours())
    assert counters["scanned"] == 1
    db.refresh(msg_old)
    db.refresh(msg_fresh)
    assert msg_old.bot_replied is False
    assert msg_fresh.bot_replied is True


def test_run_watchdog_skips_human_replied(db):
    msg = _make_inbound(db)
    msg.human_replied = True
    db.commit()
    with patch(
        "app.services.auto_reply_watchdog.send_template",
        return_value=True,
    ) as send_mock:
        counters = run_watchdog(db, now=_frozen_now_after_hours())
    send_mock.assert_not_called()
    assert counters["scanned"] == 0


def test_run_watchdog_empty_table_returns_zero_counters(db):
    with patch(
        "app.services.auto_reply_watchdog.send_template",
        return_value=True,
    ) as send_mock:
        counters = run_watchdog(db, now=_frozen_now_after_hours())
    send_mock.assert_not_called()
    assert counters == {
        "scanned": 0,
        "skipped_within_hours": 0,
        "sent_after_hours": 0,
        "sent_vacation": 0,
        "send_failed": 0,
    }


def test_watchdog_disabled_in_test_env():
    """The WATCHDOG_ENABLED flag in app.config.settings defaults False.
    Tests exercise run_watchdog() directly without ever starting the
    APScheduler instance — this assertion guards against an accidental
    'True' default sneaking in via env or refactor."""
    from app.config import settings as cfg

    assert cfg.watchdog_enabled is False
