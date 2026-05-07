"""Cloudinary orphan-image cleanup (MEH-375 Chunk I).

Scans Cloudinary for assets uploaded into mehamakor/* folders that are
no longer referenced from any DB column, then deletes them.

Default mode is dry-run — `--apply` is required to actually delete.
The dry-run path is non-destructive: no Cloudinary writes, only reads.

Usage:
    python -m scripts.cleanup_cloudinary_orphans            # dry-run
    python -m scripts.cleanup_cloudinary_orphans --apply    # real delete

Chunk I lands in 5 sub-chunks:
    I.1 (this commit) — skeleton + argparse + Cloudinary config + missing-config exit
    I.2 — referenced-set DB query (8 image-bearing columns)
    I.3 — paginated cloudinary.api.resources() + depth-1 filter + reject-list + min-age
    I.4 — orphan compute + dry-run summary
    I.5 — --apply: confirmation prompt + batch delete + per-ID logging
"""
import argparse
import logging
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

# Allow running as `python -m scripts.cleanup_cloudinary_orphans` from backend/.
# Mirrors scripts/import_producers.py:12-15.
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.cloudinary_utils import RESERVED_PUBLIC_ID_PREFIXES  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    Event,
    Experience,
    HomeProduct,
    Producer,
    Product,
    User,
)

logger = logging.getLogger("scripts.cleanup_cloudinary_orphans")

DEFAULT_PREFIXES = ("mehamakor", "mehamakor/avatars")
# Cloudinary's delete_resources accepts up to 100 public_ids per call per the
# Admin API guidance: https://cloudinary.com/documentation/admin_api#delete_resources
BATCH_SIZE_HARD_CAP = 100
DEFAULT_MIN_AGE_HOURS = 24

# Image-bearing columns we treat as the referenced set. 8 sources total
# (6 scalar + 2 array); see docs/DATA.md for column types. The reserved
# story-card namespace (mehamakor/producers/<id>/story-card.jpg) is
# excluded at the Cloudinary-scan side via RESERVED_PUBLIC_ID_PREFIXES
# and depth-1 filter (I.3); story_card_url is included here belt-and-
# braces so a misconfigured Cloudinary scan can never delete a live
# referenced asset.
SCALAR_URL_SOURCES = (
    User.avatar_url,             # users.avatar_url        (varchar)
    Producer.story_card_url,     # producers.story_card_url (varchar(500))
    Product.image_url,           # products.image_url      (text)
    HomeProduct.photo,           # home_products.photo     (text)
    Event.image_url,             # events.image_url        (text)
    Experience.image_url,        # experiences.image_url   (text, nullable)
)
ARRAY_URL_SOURCES = (
    Producer.images,             # producers.images        (text[])
    HomeProduct.images,          # home_products.images    (text[])
)


def _bounded_batch_size(raw: str) -> int:
    """argparse type — int but capped at BATCH_SIZE_HARD_CAP. Larger requests
    can drop public_ids silently inside the SDK's parameter mapping, so we
    refuse to send more than the documented soft-limit per call."""
    return min(int(raw), BATCH_SIZE_HARD_CAP)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cleanup_cloudinary_orphans",
        description=(
            "Find Cloudinary assets that are no longer referenced by any DB "
            "column. With --apply, delete them; otherwise dry-run."
        ),
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually delete orphans. Without this flag, the script reports only.",
    )
    parser.add_argument(
        "--min-age-hours",
        type=int,
        default=DEFAULT_MIN_AGE_HOURS,
        help=(
            "Skip assets younger than N hours — race-condition guard for "
            f"in-flight uploads. Default: {DEFAULT_MIN_AGE_HOURS}."
        ),
    )
    parser.add_argument(
        "--prefix",
        action="append",
        # IMPORTANT: default=None then post-fill. argparse `action="append"`
        # appends to the default list rather than replacing it, so a literal
        # default would produce e.g. ["mehamakor", "mehamakor/avatars", "user-arg"].
        default=None,
        help=(
            "Cloudinary folder prefix to scan. Repeatable. "
            f"Default: {list(DEFAULT_PREFIXES)}."
        ),
    )
    parser.add_argument(
        "--batch-size",
        type=_bounded_batch_size,
        default=BATCH_SIZE_HARD_CAP,
        help=(
            f"public_ids per delete_resources call. Capped at "
            f"{BATCH_SIZE_HARD_CAP}. Default: {BATCH_SIZE_HARD_CAP}."
        ),
    )
    return parser


def _add_scalar_urls(target: set[str], rows: Iterable) -> None:
    """Drain `rows` (iterable of 1-tuples from `db.query(col)`) into `target`,
    filtering out None and empty strings. Pure — no DB, no SQLA.
    """
    for (url,) in rows:
        if url:
            target.add(url)


def _add_array_urls(target: set[str], rows: Iterable) -> None:
    """Drain `rows` (iterable of 1-tuples wrapping PG text[] arrays) into
    `target`, flattening each array and filtering None / empty. Pure —
    no DB, no SQLA.
    """
    for (arr,) in rows:
        for url in arr or ():
            if url:
                target.add(url)


def build_referenced_url_set(db) -> set[str]:
    """Collect every Cloudinary URL referenced from the DB into one set.

    Iterates the 8 columns in SCALAR_URL_SOURCES + ARRAY_URL_SOURCES,
    drops None / empty strings, and returns a deduped set. PG `text[]`
    arrays are iterated in Python (no `func.unnest`) — matches the
    rest of the codebase, which has no existing unnest pattern.
    """
    referenced: set[str] = set()
    for col in SCALAR_URL_SOURCES:
        _add_scalar_urls(referenced, db.query(col).filter(col.isnot(None)))
    for col in ARRAY_URL_SOURCES:
        _add_array_urls(referenced, db.query(col).filter(col.isnot(None)))
    return referenced


# Depth-1 filter for the bare `mehamakor` scan. Single segment under the
# root means producer-uploaded image OR placeholder-uuid avatar; deeper
# paths are reserved (mehamakor/producers/<id>/...) or future subfolders
# the operator hasn't sanctioned (default-deny).
_DEPTH_1_PUBLIC_ID_RE = re.compile(r"^mehamakor/[^/]+$")
_RESOURCES_PAGE_SIZE = 500


def _passes_depth_filter(public_id: str, scan_prefix: str) -> bool:
    """Default-deny on unknown subfolders under mehamakor/ when scanning the
    bare top-level. Sub-prefix scans (e.g. `mehamakor/avatars`) opt out —
    the operator is explicitly targeting that subtree.
    """
    if scan_prefix != "mehamakor":
        return True
    return bool(_DEPTH_1_PUBLIC_ID_RE.match(public_id))


def _passes_reject_filter(public_id: str) -> bool:
    """Defense-in-depth filter on every page result before any delete call.
    Independent of `app.cloudinary_utils.extract_public_id` so an SDK
    response shape change cannot bypass it.
    """
    if "/placeholder" in public_id:
        return False
    if any(public_id.startswith(p) for p in RESERVED_PUBLIC_ID_PREFIXES):
        return False
    return True


def _passes_age_filter(created_at_iso: str, cutoff: datetime) -> bool:
    """True when the asset is older than the cutoff (safe to consider for
    deletion). Strict `<` boundary: an asset whose `created_at == cutoff`
    is treated as too young — protects in-flight upload races where
    Cloudinary's `created_at` and our DB INSERT happen seconds apart.
    """
    created = datetime.fromisoformat(created_at_iso.replace("Z", "+00:00"))
    return created < cutoff


def list_cloudinary_assets(
    prefixes: list[str],
    min_age_hours: int,
) -> list[tuple[str, str, int]]:
    """List Cloudinary assets across `prefixes`, applying depth-1 filter,
    reject list, and min-age cutoff. Returns `(public_id, secure_url, bytes)`
    tuples surviving all filters.

    Pagination terminates on missing or empty `next_cursor`. Any SDK
    exception is logged with prefix context and re-raised — caller decides
    exit code.
    """
    import cloudinary  # noqa: F401, PLC0415 — needed before cloudinary.api is importable
    import cloudinary.api  # noqa: PLC0415

    cutoff = datetime.now(timezone.utc) - timedelta(hours=min_age_hours)
    candidates: list[tuple[str, str, int]] = []
    for scan_prefix in prefixes:
        cursor: str | None = None
        page = 0
        while True:
            page += 1
            kwargs = {
                "prefix": scan_prefix,
                "type": "upload",
                "resource_type": "image",
                "max_results": _RESOURCES_PAGE_SIZE,
            }
            if cursor:
                kwargs["next_cursor"] = cursor
            try:
                response = cloudinary.api.resources(**kwargs)
            except Exception as exc:
                logger.error(
                    "cloudinary.api.resources failed for prefix=%r page=%d: %s",
                    scan_prefix,
                    page,
                    exc,
                )
                raise
            for asset in response.get("resources", []):
                public_id = asset.get("public_id", "")
                if not _passes_depth_filter(public_id, scan_prefix):
                    continue
                if not _passes_reject_filter(public_id):
                    continue
                created_at = asset.get("created_at", "")
                if not _passes_age_filter(created_at, cutoff):
                    continue
                candidates.append(
                    (
                        public_id,
                        asset.get("secure_url", ""),
                        asset.get("bytes", 0),
                    )
                )
            cursor = response.get("next_cursor")
            if not cursor:
                break
    return candidates


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )
    args = build_parser().parse_args(argv)
    if args.prefix is None:
        args.prefix = list(DEFAULT_PREFIXES)

    if not settings.cloudinary_cloud_name:
        logger.info("Cloudinary not configured — no-op")
        return 0

    # Lazy import: keeps `--help` and the missing-config exit path from
    # paying the SDK import cost. The SDK reaches out to the network on
    # first config call in some configurations, so we also delay until
    # after the early-exit gates.
    import cloudinary  # noqa: PLC0415

    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
    )

    logger.info(
        "Parsed args: apply=%s min_age_hours=%d prefix=%s batch_size=%d",
        args.apply,
        args.min_age_hours,
        args.prefix,
        args.batch_size,
    )

    db = SessionLocal()
    try:
        referenced = build_referenced_url_set(db)
    finally:
        db.close()
    logger.info(
        "Referenced-set built: %d unique URLs across 8 sources", len(referenced)
    )

    try:
        candidates = list_cloudinary_assets(args.prefix, args.min_age_hours)
    except Exception:
        logger.exception(
            "Cloudinary listing failed; aborting before any delete call"
        )
        return 1
    logger.info("Cloudinary candidates after filters: %d", len(candidates))

    # I.4-I.5 fill in: orphan compute → --apply delete.
    return 0


if __name__ == "__main__":
    sys.exit(main())
