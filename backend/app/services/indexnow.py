"""
Module:   indexnow
Purpose:  Tell Bing (and every IndexNow engine) within seconds that a public
          page on mehamakor.co.il appeared, changed or disappeared.
          Production only — staging and local never ping.
Touches:  outbound HTTPS POST to api.indexnow.org (httpx). No DB, no env var.
Does NOT: ping Google (no IndexNow support), queue or retry a failed ping,
          decide WHEN a page is public — the routers do that, after their
          commit, via schedule(). The URL shapes are sitemap.js's, not ours:
          frontend/app/sitemap.js is the owner, tests/test_indexnow.py reds
          if it drifts from the builders below.
Related:  frontend/public/<INDEXNOW_KEY>.txt (the key file, public by design);
          app/config.py `railway_environment` (the production gate);
          app/services/onboarding_followup.py SITE_DOMAIN (the domain).
History:  MEH-2852 (creation).
"""

import logging
from collections.abc import Iterable

import httpx
from fastapi import BackgroundTasks

from app.config import settings
from app.services.onboarding_followup import SITE_DOMAIN

logger = logging.getLogger(__name__)

# MEH-2852: the IndexNow ownership key. Public by design — it is served at
# KEY_LOCATION so the engine can confirm we own the host. Generated once with
# secrets.token_hex(16).
# DO NOT rotate it without renaming frontend/public/<key>.txt in the same PR —
# a key with no matching file makes every submission a 403.
INDEXNOW_KEY = "640fd9eef761fabe8424763a99f11067"
ENDPOINT = "https://api.indexnow.org/indexnow"
SITE_ORIGIN = f"https://{SITE_DOMAIN}"
KEY_LOCATION = f"{SITE_ORIGIN}/{INDEXNOW_KEY}.txt"
MAX_URLS_PER_CALL = 10_000  # the IndexNow protocol limit
TIMEOUT_SECONDS = 5
# localePrefix "as-needed" (frontend/i18n/routing.js): he has no prefix.
LOCALE_PREFIXES = ("", "/en")


def localized(path: str) -> list[str]:
    """One logical path → its he + en absolute URLs (sitemap.js urlForLocale)."""
    return [f"{SITE_ORIGIN}{prefix}{path}" for prefix in LOCALE_PREFIXES]


def producer_urls(producer) -> list[str]:
    """A business is `/{slug}` (or `/producer/{id}` without one); an organizer
    is `/organizers/{slug}` and has no page without a slug (MEH-2461)."""
    if producer.kind == "organizer":
        return localized(f"/organizers/{producer.slug}") if producer.slug else []
    if producer.slug:
        return localized(f"/{producer.slug}")
    return localized(f"/producer/{producer.id}")


def recipe_urls(producer, recipe_id) -> list[str]:
    """sitemap.js lists recipes of slugged producers only."""
    if producer is None or not producer.slug:
        return []
    return localized(f"/{producer.slug}/recipes/{recipe_id}")


def event_urls(event_id) -> list[str]:
    return localized(f"/events/{event_id}")


def experience_urls(experience_id) -> list[str]:
    return localized(f"/experiences/{experience_id}")


def group_buy_urls(group_buy_id) -> list[str]:
    return localized(f"/group-buys/{group_buy_id}")


def is_public_owner(producer) -> bool:
    """The owner's own page, and its events, are public once it is approved —
    a business at /{slug}, an organizer at /organizers/{slug} (MEH-2459:
    organizer events are listed on purpose)."""
    return producer is not None and producer.status == "approved"


def is_public_business(producer) -> bool:
    """Experiences, recipes and group buys are public only from a live
    business — producer_listing.is_business(): approved AND kind 'producer'.
    An organizer's are never listed, so pinging them would announce a 404."""
    return is_public_owner(producer) and producer.kind == "producer"


def _breadcrumb(message: str) -> None:
    try:
        import sentry_sdk

        sentry_sdk.add_breadcrumb(category="indexnow", message=message, level="warning")
    except Exception:  # pragma: no cover — SDK absent or misbehaving
        pass


def _post(batch: list[str]) -> None:
    body = {
        "host": SITE_DOMAIN,
        "key": INDEXNOW_KEY,
        "keyLocation": KEY_LOCATION,
        "urlList": batch,
    }
    try:
        resp = httpx.post(ENDPOINT, json=body, timeout=TIMEOUT_SECONDS)
    except Exception as exc:  # never raise — a ping is best-effort
        logger.warning("[indexnow] POST failed: %s", type(exc).__name__)
        _breadcrumb(f"IndexNow POST failed: {type(exc).__name__}")
        return
    if resp.status_code not in (200, 202):
        logger.warning("[indexnow] POST answered %s", resp.status_code)
        _breadcrumb(f"IndexNow POST answered {resp.status_code}")


def notify(urls: list[str]) -> None:
    """Submit `urls` to IndexNow. Production only; never raises."""
    unique = list(dict.fromkeys(urls))
    if not unique:
        return
    if settings.railway_environment != "production":
        logger.info(
            "[indexnow] skipped %d URL(s) — environment %r is not production",
            len(unique),
            settings.railway_environment,
        )
        return
    for start in range(0, len(unique), MAX_URLS_PER_CALL):
        _post(unique[start : start + MAX_URLS_PER_CALL])


def schedule(background_tasks: BackgroundTasks, urls: Iterable[str]) -> None:
    """Queue notify() to run after the response — call it after the commit."""
    url_list = list(urls)
    if url_list:
        background_tasks.add_task(notify, url_list)


def schedule_public_producer(background_tasks: BackgroundTasks, producer) -> None:
    """Queue the business's own page — only while it is public."""
    if is_public_owner(producer):
        schedule(background_tasks, producer_urls(producer))
