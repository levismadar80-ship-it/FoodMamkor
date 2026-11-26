"""MEH-3906: admin gallery uploads get their own limit on POST /upload/image.

Several admin threads upload gallery photos from Sapir's one browser, so
they share one IP. The route's 20/hour per-IP limit answered 429 to the
admin. The admin now has her own bucket (200/hour, per admin user); everyone
else keeps 20/hour per IP.

Discrimination: against the old route the admin's 21st upload is 429 and
`test_admin_passes_the_per_ip_limit` fails.
"""

import io

from app.routers.upload import ADMIN_UPLOAD_IMAGE_LIMIT, UPLOAD_IMAGE_LIMIT
from conftest import auth_header, make_user

FAKE_JPG = b"\xff\xd8\xff" + b"\x00" * 100
PER_IP = int(UPLOAD_IMAGE_LIMIT.split("/")[0])
PER_ADMIN = int(ADMIN_UPLOAD_IMAGE_LIMIT.split("/")[0])


def _upload(client, user) -> int:
    return client.post(
        "/upload/image",
        files={"file": ("p.jpg", io.BytesIO(FAKE_JPG), "image/jpeg")},
        headers=auth_header(user),
    ).status_code


def test_admin_passes_the_per_ip_limit(client, db):
    admin = make_user(db, role="admin", email="up-admin@example.com")
    statuses = [_upload(client, admin) for _ in range(PER_IP + 5)]
    assert statuses == [200] * (PER_IP + 5)


def test_admin_has_her_own_cap(client, db):
    admin = make_user(db, role="admin", email="up-admin2@example.com")
    statuses = [_upload(client, admin) for _ in range(PER_ADMIN + 1)]
    assert statuses[:PER_ADMIN] == [200] * PER_ADMIN
    assert statuses[PER_ADMIN] == 429


def test_owner_keeps_the_per_ip_limit(client, db):
    owner = make_user(db, role="producer", email="up-owner@example.com")
    statuses = [_upload(client, owner) for _ in range(PER_IP + 1)]
    assert statuses[:PER_IP] == [200] * PER_IP
    assert statuses[PER_IP] == 429


def test_admin_uploads_do_not_spend_the_owners_ip_bucket(client, db):
    admin = make_user(db, role="admin", email="up-admin3@example.com")
    owner = make_user(db, role="producer", email="up-owner2@example.com")
    for _ in range(PER_IP):
        assert _upload(client, admin) == 200
    assert _upload(client, owner) == 200


def test_each_admin_has_her_own_bucket(client, db):
    first = make_user(db, role="admin", email="up-admin4@example.com")
    second = make_user(db, role="admin", email="up-admin5@example.com")
    for _ in range(PER_ADMIN):
        assert _upload(client, first) == 200
    assert _upload(client, first) == 429
    assert _upload(client, second) == 200
