"""
Module:   image_ownership
Purpose:  A user may store only Cloudinary photos SHE uploaded. Uploads land in
          a per-uploader folder (`mehamakor/u/<owner_key>/`); every write that
          stores an image URL refuses a NEW URL in our namespace that is not in
          the caller's own folder, so business A cannot show business B's photo.
Touches:  nothing (pure checks; raises HTTPException 403).
Does NOT: destroy anything (cloudinary_utils.destroy_image, which also skips an
          asset another row still uses — MEH-3247 part 1), or check URLs that
          were already on the row (grandfathered, so old rows still save).
Related:  backend/app/routers/upload.py (folder_for), services/image_refs.py
          (the column registry), tests/test_meh3247_own_uploads_only.py.
History:  MEH-3247 part 2 (grill B2 follow-up). Folder ownership instead of an
          upload ledger: no migration, and the URL path IS the asset, so a URL
          in your own folder can only point at your own upload.
"""

import hashlib
import hmac
import re
import unicodedata
from collections.abc import Iterable
from typing import Any
from urllib.parse import unquote

from fastapi import HTTPException

from app.cloudinary_utils import extract_public_id
from app.config import settings

# Our assets all live under this namespace. A Cloudinary URL whose public_id is
# outside it cannot map to one of our assets on destroy, so it is left alone.
OUR_NAMESPACE = "mehamakor/"

OWN_IMAGE_DETAIL = "אפשר להוסיף רק תמונה שהעליתם בעצמכם. העלו את התמונה מחדש."

# MEH-3247: the ONLY accepted shape for a URL that mentions Cloudinary. No
# query, no fragment, no transformation segment, no `..`: each of those let a
# URL that "looks" like your folder render someone else's asset (reviewer
# findings: `?x=/placeholder`, `/u/me/../../B.jpg`, `l_<overlay>`). The upload
# endpoint returns exactly this `secure_url`; transforms are added at render.
_CANONICAL = re.compile(
    r"^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/image/upload/"
    r"(?:v\d+/)?(?P<pid>[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*)"
    r"\.(?:jpg|jpeg|png|webp|gif|heic)$"
)


def owner_key(user_id: object) -> str:
    """Opaque, stable folder key for a user (her id is not exposed in URLs)."""
    digest = hmac.new(
        settings.secret_key.encode(), f"img-owner:{user_id}".encode(), hashlib.sha256
    ).hexdigest()
    return digest[:20]


def own_prefixes(user: Any) -> tuple[str, ...]:
    """public_id prefixes (trailing slash included) and fixed ids she owns."""
    key = owner_key(user.id)
    owned: list[str] = [f"mehamakor/u/{key}/", f"mehamakor/kashrut/u/{key}/"]
    # Fixed server-side public_ids (upload.py avatar / owner-photo endpoints).
    owned.append(f"mehamakor/avatars/user_{user.id}")
    producer_id = getattr(user, "producer_id", None)
    if producer_id:
        owned.append(f"mehamakor/owner/owner_{producer_id}")
    return tuple(owned)


def _is_owned(pid: str, owned: tuple[str, ...]) -> bool:
    for prefix in owned:
        if prefix.endswith("/"):
            if pid.startswith(prefix):
                return True
        elif pid == prefix:
            return True
    return False


def _mentions_cloudinary(url: str) -> bool:
    # Reviewer (rule 5a): `res.cloudinar%79.com` and a full-width `ｃ` both
    # resolve to res.cloudinary.com in a browser, so decode and fold first.
    folded = unicodedata.normalize("NFKC", unquote(unquote(url))).casefold()
    return "cloudinary" in folded


def is_allowed_new_url(user: Any, url: object) -> bool:
    if not isinstance(url, str) or not _mentions_cloudinary(url):
        return True  # not a Cloudinary asset: today's behaviour
    match = _CANONICAL.match(url)
    if match is None:
        return False
    pid = match.group("pid")
    # Reviewer (rule 5a): a leading transformation (`q_auto/`, `t_thumb/`)
    # passes the character class but is not part of the asset id. The id must
    # be exactly what the destroy path would parse, so no segment is skipped.
    if extract_public_id(url, bypass_reserved=True) != pid:
        return False
    if not pid.startswith(OUR_NAMESPACE):
        return True  # outside our namespace: cannot be one of our assets
    return _is_owned(pid, own_prefixes(user))


def _as_list(value: object) -> list[object]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return list(value)
    return [value]


def assert_own_new_images(user: Any, new: object, old: object = None) -> None:
    """403 if `new` adds a Cloudinary URL the caller did not upload.

    `new` / `old` are a URL, a list of URLs, or None. URLs already in `old`
    pass unchecked (grandfathered). Admins may store any URL.
    """
    if getattr(user, "role", None) == "admin":
        return
    previous = set(_as_list(old))
    added: Iterable[object] = (u for u in _as_list(new) if u not in previous)
    if not all(is_allowed_new_url(user, url) for url in added):
        raise HTTPException(status_code=403, detail=OWN_IMAGE_DETAIL)
