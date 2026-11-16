"""MEH-3338 — admin fills «מאחורי העסק» (owner bio + photo).

Covers:
  - POST /upload/owner-photo/{producer_id}: no token 401, consumer 403, the
    business's own owner 403 (she has her own route), unknown business 404,
    non-image 400, admin success writes the PATH business only (IDOR).
  - The owner route is unchanged (still writes her own business).
  - Admin create accepts owner_bio (sanitized, capped at 300); admin PUT sets
    the bio and clears the photo; the public detail carries both.
"""

import io
import uuid

from tests.conftest import auth_header, make_producer, make_user

FAKE_JPG = b"\xff\xd8\xff" + b"\x00" * 100


def _admin(db):
    return make_user(db, role="admin")


def _jpg():
    return {"file": ("me.jpg", io.BytesIO(FAKE_JPG), "image/jpeg")}


def _owner_photo_url(producer_id):
    return f"/upload/owner-photo/{producer_id}"


# --- auth -------------------------------------------------------------------


def test_admin_owner_photo_requires_a_token(client, db):
    producer = make_producer(db)
    assert client.post(_owner_photo_url(producer.id), files=_jpg()).status_code == 401


def test_consumer_is_403(client, db):
    producer = make_producer(db)
    consumer = make_user(db, role="consumer")
    resp = client.post(
        _owner_photo_url(producer.id), files=_jpg(), headers=auth_header(consumer)
    )
    assert resp.status_code == 403


def test_owner_cannot_use_the_admin_route_even_for_her_own_business(client, db):
    producer = make_producer(db)
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()
    resp = client.post(
        _owner_photo_url(producer.id), files=_jpg(), headers=auth_header(owner)
    )
    assert resp.status_code == 403
    db.refresh(producer)
    assert producer.owner_photo_url is None


# --- behaviour --------------------------------------------------------------


def test_admin_upload_writes_the_path_business_only(client, db):
    target = make_producer(db, name="סנדרה")
    other = make_producer(db, name="אחר")
    resp = client.post(
        _owner_photo_url(target.id), files=_jpg(), headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text
    url = resp.json()["url"]
    db.refresh(target)
    db.refresh(other)
    assert target.owner_photo_url == url
    assert other.owner_photo_url is None


def test_unknown_business_is_404(client, db):
    resp = client.post(
        _owner_photo_url(uuid.uuid4()), files=_jpg(), headers=auth_header(_admin(db))
    )
    assert resp.status_code == 404


def test_non_image_is_400_and_saves_nothing(client, db):
    producer = make_producer(db)
    resp = client.post(
        _owner_photo_url(producer.id),
        files={
            "file": (
                "x.jpg",
                io.BytesIO(b"<?php echo 1; ?>" + b"\x00" * 40),
                "image/jpeg",
            )
        },
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 400
    db.refresh(producer)
    assert producer.owner_photo_url is None


def test_owner_route_still_writes_her_own_business(client, db):
    producer = make_producer(db)
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()
    resp = client.post("/upload/owner-photo", files=_jpg(), headers=auth_header(owner))
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.owner_photo_url == resp.json()["url"]


# --- the bio on the admin form's saves -------------------------------------------


def test_admin_create_accepts_a_sanitized_capped_bio(client, db):
    resp = client.post(
        "/admin/producers",
        json={
            "name": "סנדרה פירות איכותיים",
            "owner_bio": "<b>אני סנדרה</b>, בת לחקלאים " + "א" * 400,
        },
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 201, resp.text
    detail = client.get(f"/producers/{resp.json()['id']}").json()
    assert detail["owner_bio"].startswith("אני סנדרה")
    assert "<b>" not in detail["owner_bio"]
    assert len(detail["owner_bio"]) <= 300


def test_admin_put_sets_the_bio_and_clears_the_photo(client, db):
    producer = make_producer(db)
    producer.owner_photo_url = (
        "https://res.cloudinary.com/test/image/upload/mehamakor/owner/owner_x.jpg"
    )
    db.commit()
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={
            "owner_bio": "כשקונים ישירות מהחקלאי, מרגישים את ההבדל",
            "owner_photo_url": None,
        },
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 200, resp.text
    detail = client.get(f"/producers/{producer.id}").json()
    assert detail["owner_bio"] == "כשקונים ישירות מהחקלאי, מרגישים את ההבדל"
    assert detail["owner_photo_url"] is None
