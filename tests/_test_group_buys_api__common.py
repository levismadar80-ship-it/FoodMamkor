"""Shared helpers, constants and fixtures of `tests/test_group_buys_api.py`.

Moved here verbatim by the MEH-3540 mechanical split. Not collected by
pytest (no `test_` prefix); `tests/test_group_buys_api.py` is the module pytest runs.
"""

import pytest
import re
from datetime import datetime, timedelta, timezone
from unittest import mock
from uuid import uuid4

from conftest import auth_header, make_producer, make_user

from app.config import settings
from app.models.models import GroupBuy, GroupBuyCommit
from app.services.group_buy_notifications import (
    notify_participant_cancelled,
    notify_participant_funded,
    notify_producer_funded,
)
from app.utils.clock import utc_now


def _producer_user(db, *, email="gbprod@test.com", status="approved"):
    producer = make_producer(db, name=f"GB Producer {uuid4().hex[:6]}", status=status)
    user = make_user(db, role="producer", email=email)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


def _make_group_buy(
    db,
    producer,
    *,
    status="open",
    deadline=None,
    min_participants=2,
    max_participants=None,
    city="תל אביב",
):
    gb = GroupBuy(
        producer_id=producer.id,
        title="רכש קמח מלא",
        description="שק 25 ק\"ג",
        product_name="קמח מלא",
        unit="שק",
        price_per_unit_regular=120,
        price_per_unit_group=90,
        min_participants=min_participants,
        max_participants=max_participants,
        deadline=deadline or (utc_now() + timedelta(days=7)),
        city=city,
        status=status,
    )
    db.add(gb)
    db.commit()
    db.refresh(gb)
    return gb


def _valid_create_payload(**overrides):
    payload = {
        "title": "רכש שמן זית",
        "product_name": "שמן זית כתית",
        "unit": "ליטר",
        "price_per_unit_regular": 80,
        "price_per_unit_group": 60,
        "min_participants": 3,
        "deadline": (utc_now() + timedelta(days=10)).isoformat(),
        "city": "חיפה",
        # MEH-2453: required. Participants read it before they join.
        "fulfillment_note": "איסוף מהמשק ביום שישי",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# MEH-1651 — funded notifications (both sides, zero contact details)
# ---------------------------------------------------------------------------

# The privacy guarantee is an ABSENCE claim, and a presence-only check cannot
# detect a removal that never happened (MEH-1578). So the detector below is
# exercised against synthetic inputs FIRST (test_contact_detector_self_test) —
# if it cannot tell a leaking body from a clean one, nothing it reports about
# the real templates is worth reading (MEH-1619).
_PHONE_RE = re.compile(r"(?<!\d)0\d{1,2}-?\d{7}(?!\d)")


def _contact_details_in(text: str) -> list[str]:
    """Return every phone-shaped run and every email-shaped token in `text`."""
    return _PHONE_RE.findall(text) + [tok for tok in text.split() if "@" in tok]


# A fixed id keeps the absence assertion deterministic: a random uuid4 can
# contain an all-digit run that trips a phone regex, which would make this
# test flaky for a reason unrelated to what it guards.
_FIXED_GB_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
_FIXED_PRODUCER_ID = "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee"
