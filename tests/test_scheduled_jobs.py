"""
Tests for scheduled_jobs module.

Tests that:
- check_inactive_producers respects the days threshold from admin_settings
- Producers within threshold are not marked inactive
- check_kashrut_expiry gracefully skips when column doesn't exist
"""
from datetime import datetime, timedelta

from app.models.models import AdminSetting, Producer
from app.services.scheduled_jobs import check_inactive_producers, check_kashrut_expiry
from tests.conftest import make_producer


class TestCheckInactiveProducers:
    def test_marks_old_producers_inactive(self, db):
        """Producers whose last_active_at exceeds the threshold are set to inactive."""
        p = make_producer(db, name="חוות ישנה", status="approved")
        p.last_active_at = datetime.utcnow() - timedelta(days=200)
        db.commit()

        count = check_inactive_producers()
        db.refresh(p)

        assert count == 1
        assert p.status == "inactive"

    def test_respects_custom_threshold(self, db):
        """Uses auto_inactive_days from admin_settings when set."""
        db.add(AdminSetting(key="auto_inactive_days", value="30"))
        db.commit()

        p = make_producer(db, name="עסק חדש יחסית", status="approved")
        p.last_active_at = datetime.utcnow() - timedelta(days=35)
        db.commit()

        count = check_inactive_producers()
        db.refresh(p)

        assert count == 1
        assert p.status == "inactive"

    def test_skips_active_producers(self, db):
        """Producers active within the window are not touched."""
        p = make_producer(db, name="עסק פעיל", status="approved")
        p.last_active_at = datetime.utcnow() - timedelta(days=10)
        db.commit()

        count = check_inactive_producers()
        db.refresh(p)

        assert count == 0
        assert p.status == "approved"

    def test_skips_non_approved_producers(self, db):
        """Only approved producers can become inactive."""
        p = make_producer(db, name="עסק ממתין", status="pending")
        p.last_active_at = datetime.utcnow() - timedelta(days=200)
        db.commit()

        count = check_inactive_producers()
        db.refresh(p)

        assert count == 0
        assert p.status == "pending"


class TestCheckKashrutExpiry:
    def test_skips_when_column_missing(self, db):
        """When kashrut_expires_at column doesn't exist, returns 0 gracefully."""
        count = check_kashrut_expiry()
        assert count == 0
