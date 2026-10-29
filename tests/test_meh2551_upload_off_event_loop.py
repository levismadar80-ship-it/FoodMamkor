"""MEH-2551 — the Cloudinary upload must not run on the event loop.

All four /upload endpoints are `async def` and called the synchronous
`cloudinary.uploader.upload` directly: a 1–3 s network call that froze the
worker's event loop, so no other request progressed meanwhile. The fake upload
below records whether it was called with an asyncio loop running in its own
thread — true on the loop, false inside `asyncio.to_thread`.
"""

import asyncio
import io
from unittest.mock import patch

import pytest

from conftest import auth_header, make_producer, make_user

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 20


@pytest.fixture
def owner(db):
    producer = make_producer(db)
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user


@pytest.mark.parametrize("path", ["/upload/image", "/upload/avatar", "/upload/owner-photo", "/upload/kashrut-cert"])
def test_cloudinary_upload_runs_off_the_event_loop(client, owner, path):
    on_loop = []

    def fake_upload(*args, **kwargs):
        try:
            asyncio.get_running_loop()
            on_loop.append(True)
        except RuntimeError:
            on_loop.append(False)
        return {"secure_url": "https://res.cloudinary.com/demo/image/upload/x.jpg"}

    with patch("app.routers.upload.settings") as s, patch(
        "cloudinary.uploader.upload", side_effect=fake_upload
    ), patch("cloudinary.config"):
        s.cloudinary_cloud_name = "demo"
        s.cloudinary_api_key = "key"
        s.cloudinary_api_secret = "secret"
        r = client.post(
            path,
            files={"file": ("p.jpg", io.BytesIO(JPEG), "image/jpeg")},
            headers=auth_header(owner),
        )

    assert r.status_code == 200, r.text
    assert on_loop == [False], f"{path}: cloudinary upload ran on the event loop"
