"""MEH-51: tests for trust tier computation + kashrut badge endpoints."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.models import KashrutBadgeRequest, PhoneOtpToken, Producer
from app.services.trust_tier import compute_trust_tier, VALID_BADGE_CODES

from tests.conftest import make_producer, make_user, auth_header


# ---------------------------------------------------------------------------
# Unit tests: compute_trust_tier
# ---------------------------------------------------------------------------

class _FakeProducer:
    def __init__(self, **kwargs):
        self.ambassador = kwargs.get("ambassador", False)
        self.reviews_count = kwargs.get("reviews_count", 0)
        self.avg_rating = kwargs.get("avg_rating", 0.0)
        self.is_verified = kwargs.get("is_verified", False)
        self.verified_at = kwargs.get("verified_at", None)
        self.phone_verified = kwargs.get("phone_verified", False)


def test_tier1_default():
    assert compute_trust_tier(_FakeProducer()) == 1


def test_tier2_phone_verified():
    assert compute_trust_tier(_FakeProducer(phone_verified=True)) == 2


def test_tier3_verified_at():
    # MEH-766: Tier 3 now sourced from verified_at (document-verified), not is_verified.
    assert compute_trust_tier(_FakeProducer(verified_at=datetime.now(timezone.utc))) == 3


def test_tier3_supersedes_tier2():
    assert (
        compute_trust_tier(
            _FakeProducer(phone_verified=True, verified_at=datetime.now(timezone.utc))
        )
        == 3
    )


def test_tier3_decoupled_from_is_verified():
    # MEH-766 decoupling (the whole point): legacy is_verified=True with
    # verified_at=None is NO LONGER Tier 3 — falls to Tier 1 (no other qual).
    assert compute_trust_tier(_FakeProducer(is_verified=True, verified_at=None)) == 1


def test_tier4_reviews_and_rating():
    p = _FakeProducer(reviews_count=10, avg_rating=4.5)
    assert compute_trust_tier(p) == 4


def test_tier4_requires_both_criteria():
    assert compute_trust_tier(_FakeProducer(reviews_count=10, avg_rating=4.4)) == 1
    assert compute_trust_tier(_FakeProducer(reviews_count=9, avg_rating=4.5)) == 1


def test_tier5_ambassador():
    assert compute_trust_tier(_FakeProducer(ambassador=True)) == 5


def test_tier5_supersedes_all():
    p = _FakeProducer(
        ambassador=True, is_verified=True, phone_verified=True,
        reviews_count=10, avg_rating=4.9,
    )
    assert compute_trust_tier(p) == 5


def test_valid_badge_codes_not_empty():
    assert len(VALID_BADGE_CODES) == 8
    assert "rabanut" in VALID_BADGE_CODES
    assert "badatz" in VALID_BADGE_CODES
    assert "artisan-dairy" in VALID_BADGE_CODES
    assert "grass-fed" not in VALID_BADGE_CODES
    assert "raw-dairy" not in VALID_BADGE_CODES


# ---------------------------------------------------------------------------
# Integration tests: phone verification endpoints
# ---------------------------------------------------------------------------

def test_send_otp_no_phone(client, db):
    producer = make_producer(db, name="חוות א")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()

    r = client.post("/producers/me/verify-phone", headers=auth_header(user))
    assert r.status_code == 400
    assert "טלפון" in r.json()["detail"]


def test_send_otp_success(client, db):
    producer = make_producer(db, name="חוות ב")
    producer.phone = "0501234567"
    db.commit()
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()

    r = client.post("/producers/me/verify-phone", headers=auth_header(user))
    assert r.status_code == 200
    # OTP row created
    token = db.query(PhoneOtpToken).filter(
        PhoneOtpToken.producer_id == producer.id
    ).first()
    assert token is not None
    assert token.used is False


def test_confirm_otp_wrong_code(client, db):
    producer = make_producer(db, name="חוות ג")
    producer.phone = "0501234568"
    db.commit()
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()

    client.post("/producers/me/verify-phone", headers=auth_header(user))
    r = client.post(
        "/producers/me/verify-phone/confirm",
        json={"code": "000000"},
        headers=auth_header(user),
    )
    assert r.status_code == 400


def test_confirm_otp_success(client, db):
    producer = make_producer(db, name="חוות ד")
    producer.phone = "0501234569"
    db.commit()
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()

    # Manually create a valid token
    code = "123456"
    db.add(PhoneOtpToken(
        producer_id=producer.id,
        phone=producer.phone,
        code=code,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    ))
    db.commit()

    r = client.post(
        "/producers/me/verify-phone/confirm",
        json={"code": code},
        headers=auth_header(user),
    )
    assert r.status_code == 200
    db.refresh(producer)
    assert producer.phone_verified is True


def test_confirm_otp_expired(client, db):
    producer = make_producer(db, name="חוות ה")
    producer.phone = "0501234570"
    db.commit()
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()

    code = "654321"
    db.add(PhoneOtpToken(
        producer_id=producer.id,
        phone=producer.phone,
        code=code,
        expires_at=datetime.utcnow() - timedelta(minutes=1),  # expired
    ))
    db.commit()

    r = client.post(
        "/producers/me/verify-phone/confirm",
        json={"code": code},
        headers=auth_header(user),
    )
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Integration tests: kashrut badge requests
# ---------------------------------------------------------------------------

def test_kashrut_request_invalid_code(client, db):
    producer = make_producer(db, name="חוות ו")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()

    r = client.post(
        "/producers/me/kashrut-request",
        json={"badge_code": "notreal"},
        headers=auth_header(user),
    )
    assert r.status_code == 400


def test_kashrut_request_success(client, db):
    producer = make_producer(db, name="חוות ז")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()

    r = client.post(
        "/producers/me/kashrut-request",
        json={"badge_code": "badatz", "cert_url": "https://example.com/cert.pdf"},
        headers=auth_header(user),
    )
    assert r.status_code == 201
    data = r.json()
    assert data["badge_code"] == "badatz"
    assert data["status"] == "pending"


def test_kashrut_request_duplicate_pending(client, db):
    producer = make_producer(db, name="חוות ח")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()

    payload = {"badge_code": "rabanut"}
    client.post("/producers/me/kashrut-request", json=payload, headers=auth_header(user))
    r = client.post("/producers/me/kashrut-request", json=payload, headers=auth_header(user))
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# Integration tests: admin kashrut review
# ---------------------------------------------------------------------------

def test_list_kashrut_requests(client, db):
    producer = make_producer(db, name="חוות בדיקה")
    admin = make_user(db, role="admin")
    db.commit()

    pending = KashrutBadgeRequest(producer_id=producer.id, badge_code="rabanut")
    approved = KashrutBadgeRequest(producer_id=producer.id, badge_code="badatz", status="approved")
    db.add_all([pending, approved])
    db.commit()

    r = client.get("/admin/kashrut?status=pending", headers=auth_header(admin))
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["badge_code"] == "rabanut"
    assert data[0]["producer_name"] == "חוות בדיקה"

    r2 = client.get("/admin/kashrut?status=approved", headers=auth_header(admin))
    assert r2.status_code == 200
    assert len(r2.json()) == 1
    assert r2.json()[0]["badge_code"] == "badatz"


def test_list_kashrut_requires_admin(client, db):
    consumer = make_user(db, role="consumer")
    db.commit()
    r = client.get("/admin/kashrut?status=pending", headers=auth_header(consumer))
    assert r.status_code == 403


def test_admin_approve_kashrut(client, db):
    producer = make_producer(db, name="חוות ט")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    admin = make_user(db, role="admin")
    db.commit()

    # Create a pending request directly
    req = KashrutBadgeRequest(
        producer_id=producer.id,
        badge_code="chalak",
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    r = client.post(
        f"/admin/kashrut/{req.id}/approve",
        headers=auth_header(admin),
    )
    assert r.status_code == 200
    db.refresh(producer)
    assert "chalak" in (producer.kashrut_badges or [])
    assert producer.kashrut_verified_at is not None
    assert producer.kashrut_expires_at is not None


def test_admin_reject_kashrut(client, db):
    producer = make_producer(db, name="חוות י")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    admin = make_user(db, role="admin")
    db.commit()

    req = KashrutBadgeRequest(producer_id=producer.id, badge_code="mehadrin")
    db.add(req)
    db.commit()
    db.refresh(req)

    r = client.post(
        f"/admin/kashrut/{req.id}/reject",
        json={"notes": "תעודה לא תקינה"},
        headers=auth_header(admin),
    )
    assert r.status_code == 200
    db.refresh(req)
    assert req.status == "rejected"
    assert req.notes == "תעודה לא תקינה"


def test_set_ambassador(client, db):
    producer = make_producer(db, name="חוות כ")
    admin = make_user(db, role="admin")
    db.commit()

    r = client.post(
        f"/admin/producers/{producer.id}/set-ambassador",
        json={"ambassador": True},
        headers=auth_header(admin),
    )
    assert r.status_code == 200
    db.refresh(producer)
    assert producer.ambassador is True


def test_set_ambassador_requires_admin(client, db):
    producer = make_producer(db, name="חוות ל")
    user = make_user(db, role="consumer")
    db.commit()

    r = client.post(
        f"/admin/producers/{producer.id}/set-ambassador",
        json={"ambassador": True},
        headers=auth_header(user),
    )
    assert r.status_code == 403


def test_trust_tier_in_producer_list(client, db):
    producer = make_producer(db, name="חוות מ")
    # MEH-766: Tier 3 sourced from verified_at, not is_verified (make_producer
    # already sets is_verified=True; that alone no longer earns Tier 3).
    producer.verified_at = datetime.now(timezone.utc)
    db.commit()

    r = client.get("/producers")
    assert r.status_code == 200
    match = next((p for p in r.json() if p["name"] == "חוות מ"), None)
    assert match is not None
    assert match["trust_tier"] == 3


def test_trust_tier_decoupled_from_is_verified_in_list(client, db):
    # MEH-766: a producer with is_verified=True but verified_at=None (the
    # make_producer default) is NO LONGER Tier 3 in the serialized list.
    make_producer(db, name="חוות לא מתויגת")  # is_verified=True, verified_at=None

    r = client.get("/producers")
    assert r.status_code == 200
    match = next((p for p in r.json() if p["name"] == "חוות לא מתויגת"), None)
    assert match is not None
    assert match["trust_tier"] < 3


def test_verified_filter_uses_verified_at(client, db):
    # MEH-766: ?verified now filters on verified_at, not is_verified. Both
    # producers have is_verified=True (make_producer default); only the
    # stamped one has verified_at — proving the decoupling.
    stamped = make_producer(db, name="חוות מאומתת")
    stamped.verified_at = datetime.now(timezone.utc)
    make_producer(db, name="חוות לא מאומתת")  # is_verified=True, verified_at=None
    db.commit()

    names_true = {p["name"] for p in client.get("/producers?verified=true").json()}
    assert "חוות מאומתת" in names_true
    assert "חוות לא מאומתת" not in names_true  # decoupling: is_verified alone is not enough

    names_false = {p["name"] for p in client.get("/producers?verified=false").json()}
    assert "חוות לא מאומתת" in names_false
    assert "חוות מאומתת" not in names_false
