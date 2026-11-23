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

MEH-440-followup hardening on top of the verbatim port:

  1. Apple JWKS caching — module-level dict with a 1-hour TTL. Apple
     rotates JWKS infrequently; fresh fetch per login was wasteful. On
     a fresh-fetch failure AFTER a successful prior fetch, falls back
     to the cached keys (graceful degradation) instead of breaking
     login during a transient appleid.apple.com outage.

  2. Avatar download streams + aborts early. The original buffered
     the entire body before checking the size cap; a hostile or
     misconfigured URL could waste arbitrary memory/bandwidth. We now
     stream in 8 KiB chunks and abort the connection as soon as the
     accumulated size exceeds MAX_AVATAR_BYTES.
"""

from typing import Any, cast, TYPE_CHECKING
import logging
import time
import uuid

from app.config import settings

if TYPE_CHECKING:
    from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey

logger = logging.getLogger(__name__)

# 1 MB cap — Google avatars are tiny.
MAX_AVATAR_BYTES = 1 * 1024 * 1024

# Avatar streaming chunk size — 8 KiB balances loop overhead against
# the worst-case overrun (one chunk past the cap before we notice).
_AVATAR_CHUNK_SIZE = 8192

# Apple JWKS cache: 1-hour TTL. Apple rotates keys on the order of
# weeks / months, so an in-process cache keyed off the module is fine.
_APPLE_JWKS_CACHE: dict[str, Any] = {"keys": None, "fetched_at": None}
_APPLE_JWKS_TTL_SECONDS = 3600


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

        # MEH-440-followup: stream + early-abort on size cap so a
        # hostile or misconfigured URL can't waste arbitrary memory.
        contents = bytearray()
        with httpx.stream("GET", picture_url, timeout=5, follow_redirects=True) as resp:
            resp.raise_for_status()
            for chunk in resp.iter_bytes(chunk_size=_AVATAR_CHUNK_SIZE):
                contents.extend(chunk)
                if len(contents) > MAX_AVATAR_BYTES:
                    logger.warning(
                        "Google avatar exceeds %d bytes; aborting download",
                        MAX_AVATAR_BYTES,
                    )
                    return None
        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
        )
        result = cloudinary.uploader.upload(
            bytes(contents),
            folder="mehamakor/avatars",
            public_id=uuid.uuid4().hex,
            resource_type="image",
            transformation=[
                {"width": 400, "height": 400, "crop": "fill", "gravity": "face"}
            ],
        )
        return cast(str | None, result["secure_url"])
    except Exception:
        logger.exception(
            "Failed to re-host Google avatar from %s — login continues without avatar",
            picture_url,
        )
        return None


def _fetch_apple_jwks_or_fallback(
    now: float, cached_keys: list[Any] | None
) -> list[Any] | None:
    """Fetch fresh JWKS from Apple, falling back to cached keys on any
    failure. Re-raises only when no cached keys exist AND the fetch
    raises (so the outer except returns None).

    MEH-468-followup: bumps fetched_at on every fetch failure to
    negative-cache outages and avoid 8s-timeout retry storms."""
    import requests

    try:
        keys_response = requests.get("https://appleid.apple.com/auth/keys", timeout=8)
        keys_response.raise_for_status()
        apple_keys = keys_response.json().get("keys")
        if apple_keys:
            _APPLE_JWKS_CACHE["keys"] = apple_keys
            _APPLE_JWKS_CACHE["fetched_at"] = now
            return cast(list[Any], apple_keys)
        if cached_keys is not None:
            logger.warning("[APPLE AUTH] Fresh JWKS empty; using cached keys")
            return cached_keys
        return None
    except Exception as fetch_err:
        _APPLE_JWKS_CACHE["fetched_at"] = now
        if cached_keys is not None:
            logger.warning(
                f"[APPLE AUTH] JWKS refetch failed ({fetch_err}); using cached keys"
            )
            return cached_keys
        raise


def _refetch_apple_jwks_for_kid_miss() -> list[Any] | None:
    """MEH-468-followup: refetch Apple's JWKS once when a token's kid is
    missing from the cached keyset (Apple may have rotated keys mid-TTL).

    Returns the fresh keys list and updates the cache on success, or None
    on any failure (network error, bad response, empty keyset)."""
    try:
        import requests

        keys_response = requests.get("https://appleid.apple.com/auth/keys", timeout=8)
        keys_response.raise_for_status()
        fresh_keys = keys_response.json().get("keys") or []
        if not fresh_keys:
            return None
        _APPLE_JWKS_CACHE["keys"] = fresh_keys
        _APPLE_JWKS_CACHE["fetched_at"] = time.time()
        return fresh_keys
    except Exception as refetch_err:
        logger.warning(f"[APPLE AUTH] kid-miss refetch failed ({refetch_err})")
        return None


# MEH-3725 review: the report carries the exception CLASS only. A captured
# exception would ship frame locals (sentry-sdk include_local_variables is on
# by default), and the id_token is a local here — a bearer credential for our
# own /auth/google and /auth/apple, with the user's email inside. Throttled
# per (provider, class) per process, like the health probes.
_VERIFIER_REPORT_WINDOW_SECONDS = 600
_last_verifier_report_at: dict[tuple[str, str], float] = {}


def _report_unexpected_verifier_error(provider: str, exc: BaseException) -> None:
    """A token the provider rejects is the user's problem and stays a warning.
    Anything else — the library failed to import, its API changed (a
    TypeError after a major bump), the provider's keys could not be fetched
    or came back garbled — fails EVERY sign-in with the same "invalid token"
    answer, so it goes to Sentry. Same blind spot as the anthropic 2.x bump
    (#5154): a caught exception and a mocked test suite. Never raises."""
    key = (provider, type(exc).__name__)
    now = time.monotonic()
    last = _last_verifier_report_at.get(key)
    if last is not None and now - last < _VERIFIER_REPORT_WINDOW_SECONDS:
        return
    _last_verifier_report_at[key] = now
    try:
        import sentry_sdk  # noqa: PLC0415

        scope_factory = getattr(sentry_sdk, "new_scope", None) or getattr(
            sentry_sdk, "push_scope", None
        )
        if scope_factory is None:  # pragma: no cover
            return
        with scope_factory() as scope:
            scope.set_tag("oauth_provider", provider)
            scope.set_tag("oauth_error_class", type(exc).__name__)
            scope.fingerprint = ["oauth-verifier", provider, type(exc).__name__]
            sentry_sdk.capture_message(
                f"{provider} sign-in verifier failed unexpectedly: {type(exc).__name__}",
                level="error",
            )
    except Exception:  # pragma: no cover — reporting must never break sign-in
        logger.debug("[%s AUTH] Sentry report failed", provider.upper())


def _is_provider_response_garbled(exc: BaseException) -> bool:
    """A provider key/cert response that is not JSON. json.JSONDecodeError
    (and requests' subclass) is a ValueError, but no crafted TOKEN raises it:
    google-auth wraps token parsing in MalformedError, PyJWT in DecodeError.
    Only a broken certs/JWKS body reaches it — and that breaks every sign-in."""
    import json  # noqa: PLC0415

    return isinstance(exc, json.JSONDecodeError)


def _is_expected_apple_error(exc: BaseException) -> bool:
    """A rejected or malformed Apple token: PyJWT's own errors, a header with
    no ``kid`` (KeyError), or a bad value. Everything else is unexpected."""
    if _is_provider_response_garbled(exc):
        return False
    try:
        import jwt as pyjwt  # noqa: PLC0415

        if isinstance(exc, pyjwt.PyJWTError):
            return True
    except Exception:  # noqa: BLE001 — PyJWT missing is itself unexpected
        return False
    return isinstance(exc, (KeyError, ValueError))


def _is_expected_google_error(exc: BaseException) -> bool:
    """google-auth raises ValueError (MalformedError, InvalidValue, …) for a
    token it rejects. TransportError — Google's certs could not be fetched —
    is NOT a ValueError and is unexpected; a garbled certs body is too."""
    return isinstance(exc, ValueError) and not _is_provider_response_garbled(exc)


def verify_apple_token(id_token: str) -> dict[str, Any] | None:
    """Verify Apple ID token and return user info."""
    if not settings.apple_client_id:
        logger.debug("[APPLE AUTH] No client ID configured, skipping verification")
        return None
    try:
        import jwt as pyjwt

        # MEH-440-followup: 1-hour TTL cache on Apple JWKS. On a fresh
        # fetch failure AFTER a successful prior fetch, fall back to
        # the cached keys (graceful degradation).
        # MEH-468-followup: bump fetched_at on every fetch failure so we
        # don't hammer Apple with 8s timeouts during an outage > TTL.
        now = time.time()
        cached_keys = _APPLE_JWKS_CACHE["keys"]
        fetched_at = _APPLE_JWKS_CACHE["fetched_at"]
        cache_fresh = (
            fetched_at is not None and (now - fetched_at) < _APPLE_JWKS_TTL_SECONDS
        )

        apple_keys = (
            cached_keys
            if cache_fresh
            else _fetch_apple_jwks_or_fallback(now, cached_keys)
        )
        if not apple_keys:
            return None

        # Decode header to find the right key
        header = pyjwt.get_unverified_header(id_token)
        key = next((k for k in apple_keys if k["kid"] == header["kid"]), None)
        if not key and cache_fresh:
            fresh_keys = _refetch_apple_jwks_for_kid_miss()
            if fresh_keys:
                apple_keys = fresh_keys
                key = next((k for k in apple_keys if k["kid"] == header["kid"]), None)
        if not key:
            return None

        public_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(key)
        payload = pyjwt.decode(
            id_token,
            cast("RSAPublicKey", public_key),
            algorithms=["RS256"],
            audience=settings.apple_client_id,
            issuer="https://appleid.apple.com",
        )
        return payload
    except Exception as e:
        logger.warning(
            "[APPLE AUTH] Verification failed: %s: %.120s", type(e).__name__, e
        )
        if not _is_expected_apple_error(e):
            _report_unexpected_verifier_error("apple", e)
        return None


def verify_google_token(id_token: str) -> dict[str, Any] | None:
    """Verify Google ID token and return user info."""
    if not settings.google_client_id:
        # Fallback for development: decode without verification
        logger.debug("[GOOGLE AUTH] No client ID configured, skipping verification")
        return None
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests

        info = google_id_token.verify_oauth2_token(  # type: ignore[no-untyped-call]
            id_token, requests.Request(), settings.google_client_id
        )
        return cast(dict[str, Any], info)
    except Exception as e:
        logger.warning(
            "[GOOGLE AUTH] Verification failed: %s: %.120s", type(e).__name__, e
        )
        if not _is_expected_google_error(e):
            _report_unexpected_verifier_error("google", e)
        return None
