"""MEH-3413 — terms §11 (pricing and payment for businesses) is kept by code.

Every paragraph of «terms.sections.pricing» in he.json is classified here:
either a test that keeps it, or a SWITCH_ON_BLOCKERS line that keeps billing
off until it is built. A new paragraph, or a blocker removed without building
it, turns this file red.

Also here:
  - price list 1 is frozen (a business may already have agreed to it);
  - a business whose paid tools are closed still has its free page;
  - the monthly «הגיע הזמן» email: 0 / 1 / many qualifying businesses.
"""

import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from app import pricing
from app.models.billing import BillableEvent, BusinessBilling
from app.services import billing_start_signal
from app.services.billing_summary import START_BILLING_BUSINESSES, Month
from conftest import make_producer

ROOT = Path(__file__).resolve().parents[1]
HE = ROOT / "frontend" / "messages" / "he.json"

# Paragraph key → what keeps it. ("test", <file::name>) or ("blocker", <id>).
TERMS11 = {
    "free": ("test", "test_meh3413_terms11_enforcement.py::test_a_closed_business_keeps_its_free_page"),
    "launch": ("blocker", "terms11-notice-sent-record"),
    "scope": ("test", "test_meh3179_billing_ledger.py"),
    "dispute": ("blocker", "terms11-monthly-summary-and-dispute"),
    "early": ("blocker", "terms11-launch-joiner-reduced-rate"),
    "change": ("blocker", "terms11-price-change-notice"),
    "threshold": ("test", "test_meh3181_billing_summary.py"),
    "nochoice": ("blocker", "terms11-notice-expiry-to-page-only"),
    "trial": ("blocker", "terms11-trial-days"),
    "cancel": ("blocker", "terms11-cancel-and-refund"),
    "unpaid": ("blocker", "terms11-unpaid-reminder"),
    # Shown prices are the prices; tests/test_meh3179_pricing_mirror.py keeps
    # the site, the server and docs/PRICING.md equal.
    "vat": ("test", "test_meh3179_pricing_mirror.py"),
}

# Price list 1 as published on 14/11/2026. DO NOT edit to make this pass —
# add version 2 to PRICE_LISTS instead (terms §11 «change»).
PRICE_LIST_1 = {
    "version": 1,
    "effective_from": "2026-11-14",
    "subscription_monthly_agorot": 4900,
    "subscription_yearly_agorot": 49000,
    "paid_booking_percent": 5,
    "rescue_bag_fee_agorot": 200,
    "subscriber_booking_percent": 2,
    "subscriber_bag_fee_agorot": 100,
    "threshold_paid_bookings_agorot": 100000,
    "notice_days": 60,
    "launch_joiner_months": 12,
    "dispute_days": 14,
    "price_change_notice_days": 60,
    "trial_days": 90,
}


def _terms11_keys():
    pricing_section = json.loads(HE.read_text(encoding="utf-8"))["terms"]["sections"][
        "pricing"
    ]
    return set(pricing_section) - {"title"}


# ---------- every promise has a keeper ----------


def test_every_terms11_paragraph_is_classified():
    assert _terms11_keys() == set(TERMS11)


def test_every_unbuilt_promise_is_a_switch_blocker():
    missing = [
        ident
        for kind, ident in TERMS11.values()
        if kind == "blocker" and ident not in pricing.SWITCH_ON_BLOCKERS
    ]
    assert missing == []


def test_every_named_keeper_test_exists():
    for kind, ident in TERMS11.values():
        if kind != "test":
            continue
        file_name, _, test_name = ident.partition("::")
        path = Path(__file__).parent / file_name
        assert path.is_file(), ident
        if test_name:
            assert f"def {test_name}(" in path.read_text(encoding="utf-8"), ident


# ---------- price list 1 is frozen ----------


def test_price_list_1_is_what_was_published():
    assert asdict(pricing.PRICE_LISTS[1]) == PRICE_LIST_1


def test_price_list_versions_are_contiguous_and_current_exists():
    versions = sorted(pricing.PRICE_LISTS)
    assert versions == list(range(1, len(versions) + 1))
    assert pricing.CURRENT_PRICE_LIST_VERSION in pricing.PRICE_LISTS


# ---------- the page stays free (terms §11 «free», «launch», «nochoice») ----------


@pytest.mark.parametrize("state", ["page_only", "unpaid"])
def test_a_closed_business_keeps_its_free_page(client, db, monkeypatch, state):
    monkeypatch.setattr(pricing, "BILLING_PHASE", "billing")
    producer = make_producer(db, name="רק עמוד")
    db.add(BusinessBilling(producer_id=producer.id, state=state))
    db.commit()

    listed = [p["name"] for p in client.get("/producers").json()]
    assert "רק עמוד" in listed
    page = client.get(f"/producers/{producer.id}")
    assert page.status_code == 200
    assert page.json()["name"] == "רק עמוד"


# ---------- the monthly «הגיע הזמן» email ----------

OCT, NOV = Month(2026, 10), Month(2026, 11)
OVER = pricing.PRICE_LISTS[1].threshold_paid_bookings_agorot


def _over_in(db, producer, month):
    db.add(
        BillableEvent(
            producer_id=producer.id,
            source_id=uuid4(),
            price_list_version=1,
            kind="event_registration",
            occurred_at=datetime(month.year, month.month, 10, 10, tzinfo=timezone.utc),
            quantity=1,
            base_amount_agorot=OVER,
            fee_agorot=OVER * 5 // 100,
            status="counted",
        )
    )
    db.commit()


def _qualifying(db, count):
    for i in range(count):
        producer = make_producer(db, name=f"עסק {i}")
        _over_in(db, producer, OCT)
        _over_in(db, producer, NOV)


@pytest.fixture
def sent(monkeypatch):
    outbox: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        billing_start_signal,
        "send_email",
        lambda to, subject, body: outbox.append((to, subject, body)),
    )
    monkeypatch.setattr(
        billing_start_signal.settings, "admin_email", "admin@example.com"
    )
    return outbox


@pytest.mark.parametrize("count", [0, 1, START_BILLING_BUSINESSES - 1])
def test_below_the_signal_no_email(db, sent, count):
    _qualifying(db, count)
    assert billing_start_signal.send_billing_start_signal(db, month=NOV) is False
    assert sent == []


def test_at_the_signal_one_email_to_the_admin(db, sent):
    _qualifying(db, START_BILLING_BUSINESSES)
    assert billing_start_signal.send_billing_start_signal(db, month=NOV) is True
    assert len(sent) == 1
    to, subject, body = sent[0]
    assert to == "admin@example.com"
    assert "הגיע הזמן" in subject
    assert f"{START_BILLING_BUSINESSES} בתי עסק" in body
    assert "/admin/billing" in body


def test_one_month_over_is_not_two(db, sent):
    for i in range(START_BILLING_BUSINESSES):
        _over_in(db, make_producer(db, name=f"חודש אחד {i}"), NOV)
    assert billing_start_signal.send_billing_start_signal(db, month=NOV) is False
    assert sent == []


def test_once_billing_is_on_the_signal_is_silent(db, sent, monkeypatch):
    _qualifying(db, START_BILLING_BUSINESSES)
    monkeypatch.setattr(pricing, "BILLING_PHASE", "billing")
    assert billing_start_signal.send_billing_start_signal(db, month=NOV) is False
    assert sent == []


def test_default_month_is_the_one_that_just_ended(db, sent, monkeypatch):
    seen: list[str] = []
    real = billing_start_signal.billing_summary.overview

    def spy(db_, month):
        seen.append(month.label())
        return real(db_, month)

    monkeypatch.setattr(billing_start_signal.billing_summary, "overview", spy)
    monkeypatch.setattr(
        billing_start_signal.Month, "current", classmethod(lambda cls: Month(2026, 12))
    )
    billing_start_signal.send_billing_start_signal(db)
    assert seen == ["2026-11"]
