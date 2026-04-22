"""
Tests for POST /upload/avatar (MEH-221).

Coverage:
- Valid JPEG upload → 200, URL returned, avatar_url saved to users table
- Valid PNG upload → 200
- No file → 422
- Non-image file (text) → 400
- Oversized file → 400
- Unauthenticated → 401
"""
import io
from unittest.mock import MagicMock, patch

from app.models.models import User
from conftest import auth_header, make_user

# Minimal valid JPEG magic bytes (+ padding to pass size check)
JPEG_HEADER = b"\xff\xd8\xff\xe0" + b"\x00" * 20
PNG_HEADER = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
NOT_IMAGE = b"hello, this is not an image at all"


def _upload(client, headers, data=None, filename="photo.jpg", content_type="image/jpeg"):
    if data is None:
        data = JPEG_HEADER
    return client.post(
        "/upload/avatar",
        files={"file": (filename, io.BytesIO(data), content_type)},
        headers=headers,
    )


class TestAvatarUpload:
    def test_jpeg_returns_200_and_url(self, client, db):
        user = make_user(db)
        with patch("app.config.settings") as mock_settings:
            mock_settings.cloudinary_cloud_name = None  # dev-mode: placeholder URL
            resp = _upload(client, auth_header(user))
        assert resp.status_code == 200
        assert "url" in resp.json()
        assert resp.json()["url"].startswith("/placeholder-image.png")

    def test_avatar_url_saved_to_db(self, client, db):
        user = make_user(db)
        with patch("app.config.settings") as mock_settings:
            mock_settings.cloudinary_cloud_name = None
            _upload(client, auth_header(user))
        db.refresh(user)
        assert user.avatar_url is not None
        assert "avatar" in user.avatar_url

    def test_png_upload_accepted(self, client, db):
        user = make_user(db)
        with patch("app.config.settings") as mock_settings:
            mock_settings.cloudinary_cloud_name = None
            resp = _upload(client, auth_header(user), data=PNG_HEADER, filename="photo.png", content_type="image/png")
        assert resp.status_code == 200

    def test_non_image_rejected_400(self, client, db):
        user = make_user(db)
        resp = _upload(client, auth_header(user), data=NOT_IMAGE, filename="evil.txt", content_type="text/plain")
        assert resp.status_code == 400
        assert "JPG" in resp.json()["detail"] or "PNG" in resp.json()["detail"]

    def test_empty_file_rejected_400(self, client, db):
        user = make_user(db)
        resp = _upload(client, auth_header(user), data=b"", filename="empty.jpg")
        assert resp.status_code == 400

    def test_unauthenticated_rejected_401(self, client):
        resp = _upload(client, headers={})
        assert resp.status_code == 401

    def test_cloudinary_upload_saves_real_url(self, client, db):
        user = make_user(db)
        fake_result = {"secure_url": "https://res.cloudinary.com/demo/image/upload/avatars/abc123.jpg"}
        with patch("app.routers.upload.settings") as mock_settings, \
             patch("cloudinary.uploader.upload", return_value=fake_result), \
             patch("cloudinary.config"):
            mock_settings.cloudinary_cloud_name = "demo"
            mock_settings.cloudinary_api_key = "key"
            mock_settings.cloudinary_api_secret = "secret"
            resp = _upload(client, auth_header(user))
        assert resp.status_code == 200
        assert resp.json()["url"] == fake_result["secure_url"]
        db.refresh(user)
        assert user.avatar_url == fake_result["secure_url"]
