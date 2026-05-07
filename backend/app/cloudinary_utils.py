"""Cloudinary helpers for orphan-image cleanup (MEH-375).

`extract_public_id` parses a secure_url back into the public_id we
originally uploaded. `destroy_image` is the best-effort companion: it
calls `cloudinary.uploader.destroy` and never raises, so callers in
DELETE / cascade paths can fail-open without rolling back the DB write
(the cleanup script will sweep up any miss).

URL shape we parse:

    https://res.cloudinary.com/<cloud>/image/upload/[<transformations>/][v<digits>/]<public_id>.<ext>

Anything that isn't a `res.cloudinary.com` upload URL — local
placeholders (`/placeholder-image.png`), Google's `lh3.googleusercontent`
fallback, empty / None — returns None from `extract_public_id` and is a
no-op for `destroy_image`.

The `mehamakor/producers/*` namespace is reserved for admin story-card
uploads (admin.py:512), which use a fixed public_id + overwrite=True.
Those assets are intentionally reused per producer and must NEVER be
destroyed by the cleanup pathway — `extract_public_id` returns None for
them as a defense-in-depth check (the cleanup script also rejects the
prefix on its own).
"""

import logging
import re

from app.config import settings

log = logging.getLogger("app.upload")

_UPLOAD_MARKER = "/image/upload/"
_VERSION_RE = re.compile(r"^v\d+$")
# Cloudinary transformation segments are either comma-joined (`w_400,h_400`)
# or a single `<param>_<value>` pair (`f_auto`). Public-id folder segments
# we use (`mehamakor`, `avatars`) and uuid4 hex public_ids never start
# with a `<letters>_` prefix, so this regex is a reliable signal.
_TRANSFORMATION_PARAM_RE = re.compile(r"^[a-z]+_")

# Story-card namespace — admin upload reuses public_id="story-card" per
# producer with overwrite=True, so these assets are intentionally
# long-lived and shared across producer versions. Never destroy.
_RESERVED_PUBLIC_ID_PREFIXES = ("mehamakor/producers/",)


def _is_transformation_segment(segment: str) -> bool:
    if not segment:
        return False
    if "," in segment:
        return True
    return bool(_TRANSFORMATION_PARAM_RE.match(segment))


def extract_public_id(url: str | None) -> str | None:
    """Parse a Cloudinary secure_url back into its public_id.

    Returns None for: empty input, non-Cloudinary URLs, local placeholders,
    URLs that look malformed (no `/image/upload/` marker, no path after it),
    and the reserved `mehamakor/producers/*` story-card namespace.
    """
    if not url or not isinstance(url, str):
        return None
    if "/placeholder" in url:
        return None
    if "res.cloudinary.com" not in url:
        return None

    idx = url.find(_UPLOAD_MARKER)
    if idx == -1:
        return None
    tail = url[idx + len(_UPLOAD_MARKER):]
    # Strip fragment / query so they don't bleed into the public_id.
    tail = tail.split("?", 1)[0].split("#", 1)[0]
    if not tail:
        return None

    segments = tail.split("/")
    # Drop leading transformation segments (chained transforms appear as
    # multiple slash-separated groups: `w_400,h_400/c_fill/`).
    while segments and _is_transformation_segment(segments[0]):
        segments.pop(0)
    # Drop the optional version segment (`v1234567890`).
    if segments and _VERSION_RE.match(segments[0]):
        segments.pop(0)
    if not segments:
        return None

    # Strip extension from the final segment only — public_ids may contain
    # dots in folder names but Cloudinary appends the format suffix to the
    # leaf.
    last = segments[-1]
    if "." in last:
        last = last.rsplit(".", 1)[0]
    if not last:
        return None
    segments[-1] = last

    public_id = "/".join(segments)
    if not public_id:
        return None
    if any(public_id.startswith(prefix) for prefix in _RESERVED_PUBLIC_ID_PREFIXES):
        return None
    return public_id


def destroy_image(url: str | None) -> bool:
    """Best-effort destroy of the Cloudinary asset behind `url`. Never raises.

    Returns True when there is nothing to do (non-Cloudinary URL, reserved
    namespace, Cloudinary not configured) or when Cloudinary acknowledges
    the destroy as `ok` or `not found` (idempotent — the asset is already
    gone). Returns False only on a real Cloudinary error, which is logged
    at error level via the `app.upload` logger so the cleanup script can
    pick the orphan up on its next run.
    """
    public_id = extract_public_id(url)
    if public_id is None:
        return True
    if not settings.cloudinary_cloud_name:
        # Dev fallback: Cloudinary unwired, nothing remote to destroy.
        return True

    try:
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
        )
        result = cloudinary.uploader.destroy(
            public_id,
            invalidate=True,
            resource_type="image",
        )
    except Exception as exc:
        log.error("Cloudinary destroy failed for %s: %s", public_id, exc)
        return False

    outcome = result.get("result") if isinstance(result, dict) else None
    if outcome in ("ok", "not found"):
        log.info("Cloudinary destroy %s: %s", public_id, outcome)
        return True
    log.error("Cloudinary destroy %s returned unexpected: %r", public_id, result)
    return False
