"""
Module:   test_meh3171_otp_purge
Purpose:  MEH-3171 — the daily retention purge deletes phone OTP rows one day
          after they expire. Before MEH-3171 nothing deleted them, so every
          OTP ever sent kept its phone number forever (PII), while
          limits.py OWNED_TABLE_EXEMPT called them "short-lived rows".
Related:  backend/app/services/retention_purge.py (OTP_RETENTION_AFTER_EXPIRY),
          tests/test_meh2303_retention_purge.py (same NOW-anchored shape).
History:  MEH-3171 (creation, 14/11/2026, from the repo health scan MEH-3143).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from conftest import make_producer

from app.models.models import PhoneOtpToken
from app.services.retention_purge import OTP_RETENTION_AFTER_EXPIRY, run_purge

ANCHOR = date(2026, 9, 6)
NOW = datetime(2026, 9, 6, 10, 0)  # naive UTC, like expires_at


def _otp(db, pid, expires_at, *, used=False):
    db.add(
        PhoneOtpToken(
            producer_id=pid,
            phone="0501234567",
            code="123456",
            expires_at=expires_at,
            used=used,
            created_at=expires_at - timedelta(minutes=10),
        )
    )


def test_expired_otp_rows_past_one_day_are_deleted_and_the_edge_is_kept(db):
    p = make_producer(db)
    edge = NOW - OTP_RETENTION_AFTER_EXPIRY
    _otp(db, p.id, edge - timedelta(minutes=1))  # past the window → deleted
    _otp(db, p.id, edge - timedelta(days=30), used=True)  # used, old → deleted
    _otp(db, p.id, edge + timedelta(minutes=1))  # inside the window → kept
    _otp(db, p.id, NOW + timedelta(minutes=5))  # still valid → kept
    db.commit()

    result = run_purge(db, today=ANCHOR, now=NOW)

    assert result.otps_deleted == 2
    kept = sorted(e for (e,) in db.query(PhoneOtpToken.expires_at).all())
    assert kept == [edge + timedelta(minutes=1), NOW + timedelta(minutes=5)]


def test_a_second_run_deletes_no_more_otps(db):
    p = make_producer(db)
    _otp(db, p.id, NOW - timedelta(days=3))
    db.commit()
    assert run_purge(db, today=ANCHOR, now=NOW).otps_deleted == 1
    assert run_purge(db, today=ANCHOR, now=NOW).otps_deleted == 0
