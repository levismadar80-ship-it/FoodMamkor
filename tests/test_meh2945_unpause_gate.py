"""MEH-2945: un-pausing a business (inactive -> approved via toggle-status)
runs the same approval gates as the approve flow.

Sapir's ruling 11/11: block. Before this, `toggle_producer_status` flipped
inactive -> approved without calling `_assert_approvable`, so a business edited
(or whose licence lapsed) while paused came back live with content no gate saw.

The other direction stays open: approved -> inactive must work even for a
business that would not pass the gates — hiding a page is never blocked.
"""
from app.constants import LICENSE_REQUIRED_CATEGORIES
from app.models.models import Producer
from conftest import auth_header, make_category, make_producer, make_user

IMG = "https://res.cloudinary.com/demo/image/upload/v1/test.jpg"


def _toggle(client, producer_id, admin):
    return client.post(
        f"/admin/producers/{producer_id}/toggle-status", headers=auth_header(admin)
    )


def _admin(db):
    return make_user(db, role="admin")


def test_unpause_without_photo_is_blocked(client, db):
    producer = make_producer(db, status="inactive", images=[IMG], phone_verified=True)
    # the gallery emptied while the business was paused
    producer.images = []
    db.commit()
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 422, resp.text
    db.refresh(producer)
    assert producer.status == "inactive"


def test_unpause_with_unverified_phone_is_blocked(client, db):
    producer = make_producer(db, status="inactive", images=[IMG], phone_verified=False)
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 422, resp.text
    db.refresh(producer)
    assert producer.status == "inactive"


def test_unpause_with_licence_cleared_is_blocked(client, db):
    cat = make_category(db, name=LICENSE_REQUIRED_CATEGORIES[0])
    producer = make_producer(
        db, status="inactive", images=[IMG], phone_verified=True, category=cat
    )
    producer.producer_license_number = None
    db.commit()
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 422, resp.text
    db.refresh(producer)
    assert producer.status == "inactive"


def test_unpause_passing_the_gates_still_works(client, db):
    producer = make_producer(db, status="inactive", images=[IMG], phone_verified=True)
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "approved"


def test_pause_is_never_gated(client, db):
    # no photo, unverified phone: would fail every gate — hiding must still work
    producer = make_producer(db, status="approved", images=[], phone_verified=False)
    resp = _toggle(client, producer.id, _admin(db))
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "inactive"
