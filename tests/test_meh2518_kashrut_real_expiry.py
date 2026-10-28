"""MEH-2518 — the kashrut «תקף עד» is the date printed on the certificate.

Before: approve stamped `kashrut_expires_at = now + 365 days`, and every
further badge approval added another year — so a business with a 3-month
certificate showed «תקף עד» a year out, and two badges showed two years.
There was also no way to take a badge down except SQL.

Now: approve takes `expires_on` (the printed date) and stores the end of that
day in Israel; with another badge still live the EARLIER date wins (one expiry
per business, and the public line must never outlast a certificate). Revoke
removes the badge at once.

Clock: dates relative to `israel_today()` (testing.md, MEH-2290).
"""

from datetime import timedelta
from zoneinfo import ZoneInfo

from app.models.models import KashrutBadgeRequest
from app.utils.clock import israel_today, utc_now
from tests.conftest import auth_header, make_producer, make_user

IL = ZoneInfo("Asia/Jerusalem")


def _setup(db, *, code="rabanut"):
    producer = make_producer(db, name="מאפיית בדיקה")
    admin = make_user(db, role="admin")
    req = KashrutBadgeRequest(producer_id=producer.id, badge_code=code)
    db.add(req)
    db.commit()
    db.refresh(req)
    return producer, admin, req


def _new_request(db, producer, code):
    req = KashrutBadgeRequest(producer_id=producer.id, badge_code=code)
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def _approve(client, admin, req, days):
    return client.post(
        f"/admin/kashrut/{req.id}/approve",
        json={"expires_on": (israel_today() + timedelta(days=days)).isoformat()},
        headers=auth_header(admin),
    )


def _israel_day(naive_utc):
    from datetime import timezone

    return naive_utc.replace(tzinfo=timezone.utc).astimezone(IL).date()


# --- approve ---------------------------------------------------------------


def test_approve_stores_the_printed_date_not_a_year(client, db):
    producer, admin, req = _setup(db)
    r = _approve(client, admin, req, 60)
    assert r.status_code == 200, r.text
    db.refresh(producer)
    # The Israel calendar day of the stored instant is the printed day.
    assert _israel_day(producer.kashrut_expires_at) == israel_today() + timedelta(
        days=60
    )


def test_approve_without_a_date_is_rejected(client, db):
    _, admin, req = _setup(db)
    r = client.post(f"/admin/kashrut/{req.id}/approve", headers=auth_header(admin))
    assert r.status_code == 422


def test_approve_with_a_past_or_today_date_is_rejected(client, db):
    _, admin, req = _setup(db)
    assert _approve(client, admin, req, 0).status_code == 422
    assert _approve(client, admin, req, -5).status_code == 422


def test_approve_with_a_date_too_far_out_is_rejected(client, db):
    _, admin, req = _setup(db)
    assert _approve(client, admin, req, 401).status_code == 422
    assert _approve(client, admin, req, 400).status_code == 200


def test_second_badge_does_not_stack_a_year(client, db):
    # The old code added 365 days per extra badge. With another badge live,
    # the earlier certificate date wins.
    producer, admin, first = _setup(db, code="rabanut")
    assert _approve(client, admin, first, 90).status_code == 200
    second = _new_request(db, producer, "badatz")
    assert _approve(client, admin, second, 200).status_code == 200
    db.refresh(producer)
    assert _israel_day(producer.kashrut_expires_at) == israel_today() + timedelta(
        days=90
    )
    assert set(producer.kashrut_badges) == {"rabanut", "badatz"}


def test_second_badge_with_an_earlier_date_shortens_the_expiry(client, db):
    producer, admin, first = _setup(db, code="rabanut")
    assert _approve(client, admin, first, 200).status_code == 200
    second = _new_request(db, producer, "badatz")
    assert _approve(client, admin, second, 30).status_code == 200
    db.refresh(producer)
    assert _israel_day(producer.kashrut_expires_at) == israel_today() + timedelta(
        days=30
    )


def test_renewing_the_only_badge_replaces_the_date(client, db):
    producer, admin, first = _setup(db, code="rabanut")
    assert _approve(client, admin, first, 20).status_code == 200
    renewal = _new_request(db, producer, "rabanut")
    assert _approve(client, admin, renewal, 300).status_code == 200
    db.refresh(producer)
    assert _israel_day(producer.kashrut_expires_at) == israel_today() + timedelta(
        days=300
    )


def test_lapsed_business_takes_the_new_date(client, db):
    producer, admin, first = _setup(db, code="rabanut")
    assert _approve(client, admin, first, 20).status_code == 200
    db.refresh(producer)
    producer.kashrut_expires_at = utc_now() - timedelta(days=1)
    db.commit()
    second = _new_request(db, producer, "badatz")
    assert _approve(client, admin, second, 150).status_code == 200
    db.refresh(producer)
    assert _israel_day(producer.kashrut_expires_at) == israel_today() + timedelta(
        days=150
    )


# --- revoke ----------------------------------------------------------------


def test_revoke_removes_the_badge_from_the_public_page(client, db):
    producer, admin, req = _setup(db, code="rabanut")
    assert _approve(client, admin, req, 90).status_code == 200
    before = client.get(f"/producers/{producer.id}").json()
    assert "rabanut" in (before.get("kashrut_badges") or [])

    r = client.post(
        f"/admin/kashrut/{req.id}/revoke",
        json={"notes": "התעודה בוטלה"},
        headers=auth_header(admin),
    )
    assert r.status_code == 200, r.text
    db.refresh(producer)
    db.refresh(req)
    assert req.status == "revoked"
    assert req.notes == "התעודה בוטלה"
    assert producer.kashrut_badges == []
    assert producer.kashrut_verified_at is None
    assert producer.kashrut_expires_at is None
    after = client.get(f"/producers/{producer.id}").json()
    assert not (after.get("kashrut_badges") or [])


def test_revoke_one_of_two_keeps_the_other(client, db):
    producer, admin, first = _setup(db, code="rabanut")
    assert _approve(client, admin, first, 90).status_code == 200
    second = _new_request(db, producer, "badatz")
    assert _approve(client, admin, second, 120).status_code == 200
    r = client.post(
        f"/admin/kashrut/{first.id}/revoke", json={}, headers=auth_header(admin)
    )
    assert r.status_code == 200
    db.refresh(producer)
    assert producer.kashrut_badges == ["badatz"]
    assert producer.kashrut_expires_at is not None


def test_revoke_also_revokes_an_older_approved_request_for_the_same_badge(client, db):
    producer, admin, first = _setup(db, code="rabanut")
    assert _approve(client, admin, first, 20).status_code == 200
    renewal = _new_request(db, producer, "rabanut")
    assert _approve(client, admin, renewal, 200).status_code == 200
    r = client.post(
        f"/admin/kashrut/{renewal.id}/revoke", json={}, headers=auth_header(admin)
    )
    assert r.status_code == 200
    db.refresh(first)
    assert first.status == "revoked"


def test_revoke_a_pending_request_is_409(client, db):
    _, admin, req = _setup(db)
    r = client.post(
        f"/admin/kashrut/{req.id}/revoke", json={}, headers=auth_header(admin)
    )
    assert r.status_code == 409


def test_revoke_unknown_request_is_404(client, db):
    admin = make_user(db, role="admin")
    db.commit()
    r = client.post(
        "/admin/kashrut/00000000-0000-0000-0000-000000000000/revoke",
        json={},
        headers=auth_header(admin),
    )
    assert r.status_code == 404


def test_revoke_requires_admin(client, db):
    producer, admin, req = _setup(db)
    assert _approve(client, admin, req, 90).status_code == 200
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()
    r = client.post(
        f"/admin/kashrut/{req.id}/revoke", json={}, headers=auth_header(owner)
    )
    assert r.status_code == 403
    db.refresh(producer)
    assert producer.kashrut_badges == ["rabanut"]


def test_revoke_and_reject_notes_are_bounded(client, db):
    _, admin, req = _setup(db)
    long_notes = "א" * 1001
    r = client.post(
        f"/admin/kashrut/{req.id}/reject",
        json={"notes": long_notes},
        headers=auth_header(admin),
    )
    assert r.status_code == 422
    assert _approve(client, admin, req, 90).status_code == 200
    r = client.post(
        f"/admin/kashrut/{req.id}/revoke",
        json={"notes": long_notes},
        headers=auth_header(admin),
    )
    assert r.status_code == 422


def test_cert_proxy_lists_the_newest_certificate_first_after_renewal(db):
    from app.routers.producers import _servable_kashrut_certs

    producer, admin, first = _setup(db, code="rabanut")
    first.status = "approved"
    first.cert_url = "https://res.cloudinary.com/demo/old.jpg"
    first.created_at = utc_now() - timedelta(days=200)
    renewal = _new_request(db, producer, "rabanut")
    renewal.status = "approved"
    renewal.cert_url = "https://res.cloudinary.com/demo/new.jpg"
    producer.status = "approved"
    producer.kashrut_badges = ["rabanut"]
    producer.kashrut_verified_at = utc_now()
    producer.kashrut_expires_at = utc_now() + timedelta(days=90)
    db.commit()
    certs = _servable_kashrut_certs(db, producer)
    assert certs[0].cert_url.endswith("new.jpg")
