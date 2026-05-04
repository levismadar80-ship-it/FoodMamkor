"""
OAuth provider verification + Google avatar re-host.

verify_google_token / verify_apple_token are direct ports of the inline
helpers in backend/app/routers/auth.py. Both fail-open (return None on
any error or missing configuration) so the caller can return its own
401 with the appropriate provider-specific error message.

upload_google_avatar_or_none downloads a Google profile picture and
re-hosts it on Cloudinary. Fail-open by design — Cloudinary or network
errors return None so OAuth login is never blocked.

Lazy imports of the optional provider deps (jwt, google.oauth2, httpx,
cloudinary, requests) live INSIDE the try blocks so a missing optional
dep gracefully fails to None instead of breaking import time.

No module-level state — Apple JWKS is fetched fresh on every call (no
caching today; preserve verbatim).

Lifted verbatim from auth.py during the MEH-440 refactor; only the
function names and the avatar-cap constant name change (the public
exports drop the leading underscore).
"""

import logging
import uuid

from app.config import settings

logger = logging.getLogger(__name__)

# 1 MB cap — Google avatars are tiny.
MAX_AVATAR_BYTES = 1 * 1024 * 1024


def upload_google_avatar_or_none(picture_url: str | None) -> str | None:
    """Download a Google profile picture and re-host it on Cloudinary.

    Fail-open: any network or API error returns None so OAuth login is
    never blocked. Returns the Cloudinary secure_url on success, or
    picture_url unchanged when Cloudinary is not configured (dev only).
    """
    if not picture_url:
        return None
    if not settings.cloudinary_cloud_name:
        return picture_url  # dev fallback — Cloudinary not wired up
    try:
        import httpx
        import cloudinary
        import cloudinary.uploader

        resp = httpx.get(picture_url, timeout=5, follow_redirects=True)
        resp.raise_for_status()
        contents = resp.content
        if len(contents) > MAX_AVATAR_BYTES:
            logger.warning(
                "Google avatar too large (%d bytes), skipping Cloudinary re-host",
                len(contents),
            )
            return None
        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
        )
        result = cloudinary.uploader.upload(
            contents,
            folder="mehamakor/avatars",
            public_id=uuid.uuid4().hex,
            resource_type="image",
            transformation=[{"width": 400, "height": 400, "crop": "fill", "gravity": "face"}],
        )
        return result["secure_url"]
    except Exception:
        logger.exception(
            "Failed to re-host Google avatar from %s — login continues without avatar",
            picture_url,
        )
        return None


def verify_apple_token(id_token: str) -> dict | None:
    """Verify Apple ID token and return user info."""
    if not settings.apple_client_id:
        logger.debug("[APPLE AUTH] No client ID configured, skipping verification")
        return None
    try:
        import jwt as pyjwt
        import requests

        # Fetch Apple's public keys
        apple_keys_url = "https://appleid.apple.com/auth/keys"
        keys_response = requests.get(apple_keys_url, timeout=8)
        keys_response.raise_for_status()
        apple_keys = keys_response.json().get("keys")
        if not apple_keys:
            return None

        # Decode header to find the right key
        header = pyjwt.get_unverified_header(id_token)
        key = next((k for k in apple_keys if k["kid"] == header["kid"]), None)
        if not key:
            return None

        public_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(key)
        payload = pyjwt.decode(
            id_token,
            public_key,
            algorithms=["RS256"],
            audience=settings.apple_client_id,
            issuer="https://appleid.apple.com",
        )
        return payload
    except Exception as e:
        logger.warning(f"[APPLE AUTH] Verification failed: {e}")
        return None


def verify_google_token(id_token: str) -> dict | None:
    """Verify Google ID token and return user info."""
    if not settings.google_client_id:
        # Fallback for development: decode without verification
        logger.debug("[GOOGLE AUTH] No client ID configured, skipping verification")
        return None
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests

        info = google_id_token.verify_oauth2_token(
            id_token, requests.Request(), settings.google_client_id
        )
        return info
    except Exception as e:
        logger.warning(f"[GOOGLE AUTH] Verification failed: {e}")
        return None
