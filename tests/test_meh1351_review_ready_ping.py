"""MEH-1351: review-ready admin ping on the false→true approvability transition.

Approvability REUSES the admin approve-gate definition (admin.py — MEH-799
photo + MEH-971 license): ≥1 image AND (license present OR no license-required
category). The ping fires from PUT /producers/me only while status=="pending",
only on the transition, as a BackgroundTask (runs synchronously under
TestClient). notify_admin_producer_review_ready is patched at its import site
in producer_me.
"""

from unittest.mock import patch

from tests.conftest import auth_header, make_category, make_producer, make_user


def _pending_producer_user(db, *, images=None, category=None, license_no=None):
    producer = make_producer(
        db, name="משק הפינג", status="pending", images=images, category=category
    )
    if license_no is not None:
        producer.producer_license_number = license_no
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


PATCH_TARGET = "app.routers.producer_me.notify_admin_producer_review_ready"


def test_fires_once_on_first_image(client, db):
    """Pending + license-free category + no images → adding an image pings."""
    cat = make_category(db)  # ירקות אורגניים — not license-required
    user, producer = _pending_producer_user(db, category=cat)

    with patch(PATCH_TARGET) as ping:
        r = client.put(
            "/producers/me",
            json={
                "images": ["https://res.cloudinary.com/demo/image/upload/v1/first.jpg"]
            },
            headers=auth_header(user),
        )
    assert r.status_code == 200
    ping.assert_called_once_with("משק הפינג", producer.city)


def test_no_fire_when_already_approvable(client, db):
    """A producer already past the gate must not re-ping on further edits."""
    cat = make_category(db)
    user, _ = _pending_producer_user(
        db,
        images=["https://res.cloudinary.com/demo/image/upload/v1/a.jpg"],
        category=cat,
    )

    with patch(PATCH_TARGET) as ping:
        r1 = client.put(
            "/producers/me",
            json={"description": "עדכון תיאור בלבד לעסק שלנו"},
            headers=auth_header(user),
        )
        r2 = client.put(
            "/producers/me",
            json={
                "images": [
                    "https://res.cloudinary.com/demo/image/upload/v1/a.jpg",
                    "https://res.cloudinary.com/demo/image/upload/v1/b.jpg",
                ]
            },
            headers=auth_header(user),
        )
    assert r1.status_code == 200 and r2.status_code == 200
    ping.assert_not_called()


def test_no_fire_when_not_pending(client, db):
    """An approved producer crossing the threshold must not ping."""
    cat = make_category(db)
    user, _ = _pending_producer_user(db, category=cat)
    # Flip to approved AFTER seeding (make_producer default was overridden).
    from app.models.models import Producer

    db.query(Producer).update({"status": "approved"})
    db.commit()

    with patch(PATCH_TARGET) as ping:
        r = client.put(
            "/producers/me",
            json={
                "images": ["https://res.cloudinary.com/demo/image/upload/v1/first.jpg"]
            },
            headers=auth_header(user),
        )
    assert r.status_code == 200
    ping.assert_not_called()


def test_license_required_category_gates_the_ping(client, db):
    """With a license-required category, an image alone is not approvable —
    the ping waits for the license and then fires exactly once."""
    honey = make_category(db, name="דבש", emoji="🍯")  # license-required by name
    user, _ = _pending_producer_user(db, category=honey)

    with patch(PATCH_TARGET) as ping:
        r1 = client.put(
            "/producers/me",
            json={
                "images": ["https://res.cloudinary.com/demo/image/upload/v1/first.jpg"]
            },
            headers=auth_header(user),
        )
        assert r1.status_code == 200
        ping.assert_not_called()

        r2 = client.put(
            "/producers/me",
            json={"producer_license_number": "1234567"},
            headers=auth_header(user),
        )
        assert r2.status_code == 200
        ping.assert_called_once()
