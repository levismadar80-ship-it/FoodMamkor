"""
MEH-3699: signup data cannot disappear silently.

Covers:
  - frontend/lib/signup-field-homes.json names exactly the fields the business
    signup request (ProducerRegister) accepts: a new field needs a home, and a
    removed one leaves the registry (the form side is RegisterProducerClient-01
    «signup field homes»);
  - services/signup_fill_digest: the Sunday counts over the last 7 days
    (businesses only; test rows, test-owned rows and organizers out), the 0%
    warning from 3 signups, and that nothing is sent on a healthy week, on
    another day, or with no signups.

The digest's "now" is a fixed Sunday (10:00 Israel) and every seed is dated
relative to it, so no assertion reads the runner's clock.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.models import DeliveryArea, ProducerLocation
from app.schemas.registration import ProducerRegister
from app.services import signup_fill_digest as sfd
from conftest import make_producer

REGISTRY = Path(__file__).resolve().parents[1] / "frontend" / "lib" / "signup-field-homes.json"

# A Sunday, 10:00 Israel time (07:00 UTC in November).
SUNDAY = datetime(2026, 11, 22, 7, 0, tzinfo=timezone.utc)


def test_registry_names_exactly_the_signup_schema_fields():
    registry = set(json.loads(REGISTRY.read_text(encoding="utf-8"))["fields"])
    schema = set(ProducerRegister.model_fields)
    assert schema - registry == set(), "signup fields with no home in signup-field-homes.json"
    assert registry - schema == set(), "registry fields the signup schema no longer accepts"


def _naive(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _business(db, *, days_ago=2, referral="instagram", located=True, **flags):
    p = make_producer(db, name="מאפיית הבדיקה")
    p.created_at = _naive(SUNDAY - timedelta(days=days_ago))
    p.referral_source = referral
    p.kind = flags.get("kind", "producer")
    p.is_test = flags.get("is_test", False)
    p.has_physical_location = True
    p.offers_delivery = False
    for loc in list(p.locations or []):
        db.delete(loc)
    db.flush()
    if located:
        db.add(ProducerLocation(producer_id=p.id, kind="branch", is_primary=True, city="חיפה", lat=32.8, lng=35.0))
    db.commit()
    db.refresh(p)
    return p


def test_counts_only_recent_real_businesses(db):
    _business(db, referral="instagram", located=True)
    _business(db, referral=None, located=True)
    _business(db, referral="friend", located=False)
    _business(db, days_ago=10)  # outside the window
    _business(db, is_test=True)  # a test row
    _business(db, kind="organizer")  # not a business
    rates = sfd.measure(db, SUNDAY)
    assert (rates.signups, rates.with_referral, rates.with_location) == (3, 2, 2)
    assert rates.zero_fields() == []


def test_delivery_only_business_counts_as_located_by_its_areas(db):
    p = _business(db, located=False)
    p.has_physical_location = False
    p.offers_delivery = True
    db.add(DeliveryArea(producer_id=p.id, city="חיפה"))
    db.commit()
    assert sfd.measure(db, SUNDAY).with_location == 1


def _record_reports(monkeypatch):
    reported = []
    monkeypatch.setattr(sfd, "report_to_sentry", lambda rates, field: reported.append(field))
    return reported


def test_zero_share_over_three_signups_warns(db, monkeypatch):
    for _ in range(3):
        _business(db, referral="")
    reported = _record_reports(monkeypatch)
    rates = sfd.check_signup_fill(db, SUNDAY)
    assert rates is not None and rates.zero_fields() == ["referral_source"]
    assert reported == ["referral_source"]


def test_sentry_report_is_tagged_and_grouped_per_field(monkeypatch):
    """The weekly Claude check searches Sentry by this tag; one issue per field."""
    import sentry_sdk

    seen = []

    def fake_capture(message, level=None):
        scope = sentry_sdk.get_current_scope()
        seen.append((message, level, dict(scope._tags), list(scope._fingerprint or [])))

    monkeypatch.setattr(sentry_sdk, "capture_message", fake_capture)
    sfd.report_to_sentry(sfd.FillRates(signups=4, with_referral=0, with_location=4), "referral_source")
    assert len(seen) == 1
    message, level, tags, fingerprint = seen[0]
    assert level == "warning"
    assert "referral_source" in message and "4 signups" in message
    assert tags[sfd.SENTRY_TAG] == "referral_source"
    assert fingerprint == ["signup-fill-zero", "referral_source"]


def test_two_signups_with_zero_do_not_warn(db):
    for _ in range(2):
        _business(db, referral="")
    assert sfd.measure(db, SUNDAY).zero_fields() == []


def test_healthy_week_reports_nothing(db, monkeypatch):
    """Sapir 22/11: only on a warning, never a weekly «all fine»."""
    for _ in range(3):
        _business(db)
    reported = _record_reports(monkeypatch)
    assert sfd.check_signup_fill(db, SUNDAY) is None
    assert reported == []


def test_business_owned_by_a_test_account_is_not_counted(db):
    from conftest import make_user

    p = _business(db)
    u = make_user(db, role="producer")
    u.producer_id = p.id
    u.is_test = True
    db.commit()
    assert sfd.measure(db, SUNDAY).signups == 0


@pytest.mark.parametrize("weekday_offset", [1, 3])
def test_nothing_reported_on_another_day(db, monkeypatch, weekday_offset):
    for _ in range(3):
        _business(db, referral="")
    reported = _record_reports(monkeypatch)
    assert sfd.check_signup_fill(db, SUNDAY + timedelta(days=weekday_offset)) is None
    assert reported == []


def test_nothing_reported_without_signups(db, monkeypatch):
    reported = _record_reports(monkeypatch)
    assert sfd.check_signup_fill(db, SUNDAY) is None
    assert reported == []
