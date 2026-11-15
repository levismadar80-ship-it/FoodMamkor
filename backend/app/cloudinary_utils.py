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
Those assets are intentionally reused per producer, so by default
`extract_public_id` returns None for them — the cleanup script's reject
list relies on this to protect live story-cards from being swept.

The producer-delete cascade is the one path that *must* delete a
reserved-namespace asset (the producer is gone; the story-card slot is
now an orphan). Callers in that situation pass `bypass_reserved=True`
to opt out of the reject check (MEH-510). Default behavior is unchanged
for the cleanup script and the 8 MEH-375 cascade hooks that legitimately
must NOT touch live story-cards.
"""

import logging
import re
from typing import TYPE_CHECKING

from app.config import settings

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

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
RESERVED_PUBLIC_ID_PREFIXES = ("mehamakor/producers/",)


def _is_transformation_segment(segment: str) -> bool:
    if not segment:
        return False
    if "," in segment:
        return True
    return bool(_TRANSFORMATION_PARAM_RE.match(segment))


def _looks_like_cloudinary_upload(url: object) -> bool:
    """Cheap pre-check: shape-match before parsing. Catches None, non-str,
    placeholder URLs, non-Cloudinary hosts, and Cloudinary URLs that
    aren't `/image/upload/` style (e.g. `/image/fetch/`)."""
    if not url or not isinstance(url, str):
        return False
    if "/placeholder" in url:
        return False
    return "res.cloudinary.com" in url and _UPLOAD_MARKER in url


def _parse_public_id_from_upload_url(url: str) -> str | None:
    """Strip transformation + version segments + leaf extension from the
    `/image/upload/...` tail. Returns the joined public_id or None when
    the URL has no parseable path after the marker."""
    idx = url.find(_UPLOAD_MARKER)
    tail = url[idx + len(_UPLOAD_MARKER) :].split("?", 1)[0].split("#", 1)[0]
    segments = tail.split("/") if tail else []
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
    return "/".join(segments) or None


def extract_public_id(url: str | None, bypass_reserved: bool = False) -> str | None:
    """Parse a Cloudinary secure_url back into its public_id.

    Returns None for: empty input, non-Cloudinary URLs, local placeholders,
    URLs that look malformed (no `/image/upload/` marker, no path after it),
    and (when `bypass_reserved=False`) the reserved `mehamakor/producers/*`
    story-card namespace.

    `bypass_reserved=True` skips the reserved-namespace reject (MEH-510 —
    producer-delete cascade). Default False preserves the cleanup script's
    protection of live story-cards and the existing 8 MEH-375 cascade hooks.
    """
    if not _looks_like_cloudinary_upload(url):
        return None
    public_id = _parse_public_id_from_upload_url(url)  # type: ignore[arg-type]
    if not public_id:
        return None
    if not bypass_reserved and any(
        public_id.startswith(prefix) for prefix in RESERVED_PUBLIC_ID_PREFIXES
    ):
        return None
    return public_id


def _still_referenced(
    db: "Session", public_ids: set[str], context: str
) -> set[str] | None:
    """MEH-3247: the public_ids some row still stores, or None when the check
    itself failed. Never raises: a failed check rolls the session back (so the
    caller's response is not turned into a 500) and the caller skips every
    destroy — fail closed, the orphan sweep picks up a real orphan later."""
    from app.services.image_refs import referenced_public_ids

    try:
        return referenced_public_ids(db, public_ids)
    except Exception as exc:
        log.error(
            "Cloudinary reference check failed [%s], destroy skipped: %s", context, exc
        )
        try:
            db.rollback()
        except Exception:  # noqa: BLE001 — best effort, never raise from cleanup
            pass
        return None


def _reference_verdict(db: "Session", public_id: str, context: str) -> bool | None:
    """None = safe to destroy; otherwise the value destroy_image returns.

    False when the check itself failed (fail closed), True when a row still
    references the asset (skipped, nothing to retry).
    """
    still = _still_referenced(db, {public_id}, context)
    if still is None:
        return False
    if public_id in still:
        log.info(
            "Cloudinary destroy skipped [%s], still referenced: %s", context, public_id
        )
        return True
    return None


def destroy_image(
    url: str | None,
    bypass_reserved: bool = False,
    context: str = "",
    db: "Session | None" = None,
) -> bool:
    """Best-effort destroy of the Cloudinary asset behind `url`. Never raises.

    Returns True when there is nothing to do (non-Cloudinary URL, reserved
    namespace under default behavior, Cloudinary not configured) or when
    Cloudinary acknowledges the destroy as `ok` or `not found` (idempotent
    — the asset is already gone). Returns False only on a real Cloudinary
    error, which is logged at error level via the `app.upload` logger so
    the cleanup script can pick the orphan up on its next run.

    `bypass_reserved=True` opts out of the `mehamakor/producers/*` reject
    list — used by the producer-delete cascade (MEH-510) where the asset
    is genuinely orphaned. Default False preserves existing behavior.

    `context` (MEH-512) is an optional caller-identifier string included
    in failure log lines so post-incident debugging can pinpoint which
    cascade hook dropped a destroy. Empty default preserves the existing
    log format minimally (the bracketed slot just appears empty).

    `db` (MEH-3247): every caller passes its session, AFTER its own commit.
    An asset some row still references is someone else's live photo and is
    not destroyed. tests/test_meh3247_shared_image_destroy.py fails on a call
    site in backend/app that leaves it out.
    """
    public_id = extract_public_id(url, bypass_reserved=bypass_reserved)
    if public_id is None:
        return True
    if db is not None:
        verdict = _reference_verdict(db, public_id, context)
        if verdict is not None:
            return verdict
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
        log.error("Cloudinary destroy failed [%s] for %s: %s", context, public_id, exc)
        return False

    outcome = result.get("result") if isinstance(result, dict) else None
    if outcome in ("ok", "not found"):
        log.info("Cloudinary destroy %s: %s", public_id, outcome)
        return True
    log.error(
        "Cloudinary destroy [%s] %s returned unexpected: %r",
        context,
        public_id,
        result,
    )
    return False


def destroy_removed_images(
    old: list[str] | None,
    new: list[str] | None,
    context: str = "",
    db: "Session | None" = None,
) -> None:
    """Best-effort destroy every URL in `old` not present in `new`.

    Uses set diff so a duplicate URL in `old` is destroyed only once
    (idempotent at Cloudinary's side, but avoids redundant API calls).

    `context` (MEH-512) is forwarded to each `destroy_image` call so
    gallery-diff cascade failures carry the same caller identifier as
    direct destroy_image cascades.
    """
    new_set = set(new or [])
    removed = set(old or []) - new_set
    if db is not None and removed:
        # MEH-3247: one reference check for the whole set, then destroy the
        # rest without asking again (db=None below on purpose).
        ids = {pid for pid in (extract_public_id(u) for u in removed) if pid}
        still = _still_referenced(db, ids, context) if ids else set()
        if still is None:
            return
        removed = {u for u in removed if extract_public_id(u) not in still}
    for url in removed:
        destroy_image(url, context=context)
