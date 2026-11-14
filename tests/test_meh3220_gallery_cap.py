"""MEH-3220: the free-plan 3-photo cap is a GALLERY cap, not an upload cap.

`POST /upload/image` is shared by the gallery, product photos, event covers,
recipes and workshops. Capping it on `len(producer.images)` meant a business
with a full gallery could not give any product a photo (MEH-1335 already
ruled: "the 3-image cap is a gallery cap"). The cap now lives where the
gallery is written: `PUT /producers/me` with `images`.
"""

import io

from conftest import auth_header, make_producer, make_user

FAKE_JPG = b"\xff\xd8\xff" + b"\x00" * 100


def _url(i: int) -> str:
    return f"https://res.cloudinary.com/demo/image/upload/v1/g{i}.jpg"


def _free_owner(db, n_images: int):
    producer = make_producer(db, images=[_url(i) for i in range(n_images)])
    producer.plan = "free"
    user = make_user(db, role="producer", email=f"cap{n_images}@example.com")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def test_full_gallery_can_still_upload_a_product_photo(client, db):
    user, _ = _free_owner(db, 3)
    resp = client.post(
        "/upload/image",
        files={"file": ("p.jpg", io.BytesIO(FAKE_JPG), "image/jpeg")},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text


def test_fourth_gallery_photo_is_refused_in_hebrew(client, db):
    user, producer = _free_owner(db, 3)
    resp = client.put(
        "/producers/me",
        json={"images": [_url(i) for i in range(4)]},
        headers=auth_header(user),
    )
    assert resp.status_code == 403, resp.text
    assert "עד 3 תמונות" in resp.json()["detail"]
    db.refresh(producer)
    assert len(producer.images) == 3


def test_same_three_photos_still_save(client, db):
    user, _ = _free_owner(db, 3)
    resp = client.put(
        "/producers/me",
        json={"images": [_url(i) for i in (2, 1, 0)]},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text


def test_legacy_gallery_over_cap_can_shrink(client, db):
    """A row saved before the cap with 5 photos may drop to 4 (not grow)."""
    user, _ = _free_owner(db, 5)
    resp = client.put(
        "/producers/me",
        json={"images": [_url(i) for i in range(4)]},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
