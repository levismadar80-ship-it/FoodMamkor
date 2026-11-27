"""MEH-3081 — the admin attaches a kashrut certificate for a business.

19 businesses say «כשר» in their about text and 18 have no owner account, so
nobody could file `POST /producers/me/kashrut-request` for them. The admin now
uploads the photo the business sent (`/upload/kashrut-cert` accepts an admin)
and turns the badge on with `POST /admin/producers/{id}/kashrut`, which stores
an approved request (so the public cert proxy serves it) and applies the same
printed-expiry rule as approve (MEH-2518).

Clock: dates relative to `israel_today()` (testing.md, MEH-2290).
"""

from datetime import timedelta

from app.models.models import KashrutBadgeRequest
from app.utils.clock import israel_today
from tests.conftest import auth_header, make_producer, make_user

CERT = "https://res.cloudinary.com/demo/image/upload/v1/mehamakor/kashrut/u/x/cert.jpg"


def _body(code="rabanut", days=60, url=CERT):
    return {
        "badge_code": code,
        "cert_url": url,
        "expires_on": (israel_today() + timedelta(days=days)).isoformat(),
    }


def _grant(client, user, producer, **kw):
    return client.post(
        f"/admin/producers/{producer.id}/kashrut",
        json=_body(**kw),
        headers=auth_header(user),
    )


def test_admin_grant_turns_the_badge_on_with_the_printed_date(client, db):
    producer = make_producer(db, name="המתססה")
    admin = make_user(db, role="admin")
    r = _grant(client, admin, producer, days=60)
    assert r.status_code == 201, r.text
    db.refresh(producer)
    assert producer.kashrut_badges == ["rabanut"]
    assert producer.kashrut_verified_at is not None
    req = db.query(KashrutBadgeRequest).filter_by(producer_id=producer.id).one()
    assert (req.status, req.cert_url, req.reviewed_by) == ("approved", CERT, admin.id)


def test_public_cert_list_includes_the_admin_attached_cert(client, db):
    producer = make_producer(db, name="המתססה")
    admin = make_user(db, role="admin")
    assert _grant(client, admin, producer).status_code == 201
    r = client.get(f"/producers/{producer.id}")
    assert r.status_code == 200, r.text
    assert [c["badge_code"] for c in r.json()["kashrut_certs"]] == ["rabanut"]


def test_non_admin_is_refused(client, db):
    producer = make_producer(db, name="המתססה")
    owner = make_user(db, role="producer")
    r = _grant(client, owner, producer)
    assert r.status_code == 403
    db.refresh(producer)
    assert not producer.kashrut_badges


def test_unknown_badge_code_is_refused(client, db):
    producer = make_producer(db, name="המתססה")
    admin = make_user(db, role="admin")
    assert _grant(client, admin, producer, code="kosher-ish").status_code == 400


def test_past_expiry_is_refused(client, db):
    producer = make_producer(db, name="המתססה")
    admin = make_user(db, role="admin")
    assert _grant(client, admin, producer, days=-1).status_code == 422


def test_cert_off_cloudinary_is_refused(client, db):
    # The public proxy only fetches res.cloudinary.com; any other host would
    # be a badge whose certificate link is dead.
    producer = make_producer(db, name="המתססה")
    admin = make_user(db, role="admin")
    r = _grant(client, admin, producer, url="https://example.com/cert.jpg")
    assert r.status_code == 422


def test_second_badge_keeps_the_earlier_expiry(client, db):
    producer = make_producer(db, name="המתססה")
    admin = make_user(db, role="admin")
    assert _grant(client, admin, producer, code="rabanut", days=30).status_code == 201
    db.refresh(producer)
    first = producer.kashrut_expires_at
    assert _grant(client, admin, producer, code="mehadrin", days=200).status_code == 201
    db.refresh(producer)
    assert producer.kashrut_badges == ["rabanut", "mehadrin"]
    assert producer.kashrut_expires_at == first


def test_cert_upload_accepts_an_admin_without_a_business(client, db):
    admin = make_user(db, role="admin")
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f"
        b"\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    r = client.post(
        "/upload/kashrut-cert",
        files={"file": ("cert.png", png, "image/png")},
        headers=auth_header(admin),
    )
    assert r.status_code == 200, r.text
    assert r.json()["url"]


def test_cert_upload_still_refuses_a_consumer(client, db):
    consumer = make_user(db, role="consumer")
    r = client.post(
        "/upload/kashrut-cert",
        files={"file": ("cert.png", b"\x89PNG\r\n\x1a\n" + b"0" * 64, "image/png")},
        headers=auth_header(consumer),
    )
    assert r.status_code == 403
