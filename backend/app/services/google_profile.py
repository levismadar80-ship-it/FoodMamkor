"""
Module:   google_profile
Purpose:  The owner's «הפרופיל שלכם בגוגל» tool: search Google for her own
          profile, decide whether a picked profile is hers (name or phone
          matches the business), and compare the live Google details with
          what the business page says.
Touches:  Google Maps Platform — Places API (New): Text Search (Pro fields)
          and Place Details (displayName, phone, website, opening hours).
          Server-side key only (GOOGLE_PLACES_API_KEY, existing).
Does NOT: store any Google value. Google Maps Platform ToS §3.2.3(b) allows
          the place_id only; every other field is returned to the caller and
          dropped. The write of producers.google_place_id and the admin ping
          live in routers/producer_google_profile.py. The public rating line
          is routers/google_rating.py.
Related:  routers/google_rating.py:150 (the admin search this mirrors),
          utils/phone.py (mobile-only canonical form, too narrow here: a
          business's Google number is often a landline).
History:  MEH-3641 (creation).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import settings

log = logging.getLogger(__name__)

_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
# id + displayName + formattedAddress = the Pro SKU. No rating count here:
# the owner picks her own profile, she does not need the number to choose.
_SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress"
_DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"
_DETAILS_FIELD_MASK = (
    "id,displayName,nationalPhoneNumber,internationalPhoneNumber,"
    "websiteUri,regularOpeningHours.weekdayDescriptions"
)
_TIMEOUT_SECONDS = 4.0
MAX_CANDIDATES = 3
_MIN_NAME_OVERLAP = 3

SAME = "same"
DIFFERENT = "different"
MISSING = "missing"


@dataclass(frozen=True)
class PlaceDetails:
    place_id: str
    name: str | None
    phone: str | None
    website: str | None
    hours: list[str]


def available() -> bool:
    """True when the server has a Places key. Without one the tool says
    «לא זמין» and makes no call."""
    return bool(settings.google_places_api_key)


def _headers(mask: str) -> dict[str, str]:
    return {
        "X-Goog-Api-Key": settings.google_places_api_key or "",
        "X-Goog-FieldMask": mask,
        "Content-Type": "application/json",
    }


def search_candidates(query: str) -> list[dict[str, Any]] | None:
    """Up to three profiles for `query`. [] = Google found none;
    None = no key or Google failed (the caller says «לא זמין»)."""
    query = query.strip()
    if not available() or not query:
        return None
    try:
        resp = httpx.post(
            _TEXT_SEARCH_URL,
            headers=_headers(_SEARCH_FIELD_MASK),
            json={"textQuery": query, "languageCode": "he", "regionCode": "IL"},
            timeout=_TIMEOUT_SECONDS,
        )
        if resp.status_code != 200:
            log.info("[google_profile] Text Search %s — fail-quiet", resp.status_code)
            return None
        data = resp.json()
    except Exception as exc:  # noqa: BLE001 — fail-quiet on any network/JSON error
        log.warning("[google_profile] Text Search failed: %s", exc)
        return None
    out: list[dict[str, Any]] = []
    for place in (data.get("places") or [])[:MAX_CANDIDATES]:
        if not place.get("id"):
            continue
        out.append(
            {
                "place_id": place["id"],
                "display_name": (place.get("displayName") or {}).get("text"),
                "formatted_address": place.get("formattedAddress"),
            }
        )
    return out


def fetch_details(place_id: str) -> PlaceDetails | None:
    """Live details for one place. None = no key, unknown place or a Google
    error. NEVER cached."""
    if not available():
        return None
    try:
        resp = httpx.get(
            _DETAILS_URL.format(place_id=place_id),
            headers=_headers(_DETAILS_FIELD_MASK),
            timeout=_TIMEOUT_SECONDS,
        )
        if resp.status_code != 200:
            log.info("[google_profile] Details %s — fail-quiet", resp.status_code)
            return None
        data = resp.json()
    except Exception as exc:  # noqa: BLE001 — fail-quiet on any network/JSON error
        log.warning("[google_profile] Details failed: %s", exc)
        return None
    hours = (data.get("regularOpeningHours") or {}).get("weekdayDescriptions") or []
    return PlaceDetails(
        place_id=place_id,
        name=(data.get("displayName") or {}).get("text"),
        phone=data.get("nationalPhoneNumber") or data.get("internationalPhoneNumber"),
        website=data.get("websiteUri"),
        hours=[str(h) for h in hours],
    )


# ── comparison ──────────────────────────────────────────────────────────────

_NOT_WORD = re.compile(r"[^\w]+", re.UNICODE)
_NON_DIGIT = re.compile(r"\D")


def normalize_name(name: str | None) -> str:
    """Lower case, punctuation (quotes, geresh, dashes) to spaces, one space."""
    return " ".join(_NOT_WORD.sub(" ", (name or "").lower()).split())


def names_match(ours: str | None, theirs: str | None) -> bool:
    """Equal after normalising, or one holds the other («המאפייה של רותי»
    in «המאפייה של רותי - רחובות»). The shorter side needs 3+ letters, so
    a one-letter name never matches everything."""
    a, b = normalize_name(ours), normalize_name(theirs)
    if not a or not b:
        return False
    short, long_ = sorted((a, b), key=len)
    return len(short.replace(" ", "")) >= _MIN_NAME_OVERLAP and short in long_


def national_digits(phone: str | None) -> str | None:
    """An Israeli number, mobile or landline, as its national digits with the
    leading 0 («+972 3-123-4567» → «031234567»). None when it is not one."""
    digits = _NON_DIGIT.sub("", phone or "")
    if digits.startswith("972"):
        digits = "0" + digits[3:]
    return digits if digits.startswith("0") and 9 <= len(digits) <= 10 else None


def phones_match(ours: list[str | None], theirs: str | None) -> bool:
    google = national_digits(theirs)
    return google is not None and google in {national_digits(p) for p in ours}


def is_her_profile(
    details: PlaceDetails, name: str | None, phones: list[str | None]
) -> bool:
    """The server's one test before an owner may link a profile: the Google
    name or the Google phone matches the business."""
    return names_match(name, details.name) or phones_match(phones, details.phone)


def _host(url: str | None) -> str | None:
    if not url or not url.strip():
        return None
    raw = url.strip()
    parsed = urlparse(raw if "//" in raw else f"https://{raw}")
    host = (parsed.hostname or "").lower().removeprefix("www.")
    return f"{host}{parsed.path.rstrip('/')}" if host else None


def website_verdict(ours: str | None, page_hosts: list[str], theirs: str | None) -> str:
    """same = Google links to her own site or to her page here."""
    google = _host(theirs)
    if google is None:
        return MISSING
    if google == _host(ours):
        return SAME
    if any(google == h or google.startswith(h + "/") for h in page_hosts):
        return SAME
    return DIFFERENT


def compare(
    details: PlaceDetails,
    *,
    name: str | None,
    phones: list[str | None],
    website: str | None,
    page_hosts: list[str],
) -> dict[str, str]:
    """A verdict per row: name, phone, website."""
    return {
        "name": MISSING
        if not details.name
        else (SAME if names_match(name, details.name) else DIFFERENT),
        "phone": MISSING
        if not details.phone
        else (SAME if phones_match(phones, details.phone) else DIFFERENT),
        "website": website_verdict(website, page_hosts, details.website),
    }
