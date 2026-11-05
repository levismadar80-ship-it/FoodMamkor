"""MEH-2618 — «תודיעו לי כשתגיעו ל{עיר}»: the per-city delivery waitlist.

Module:   delivery_waitlist
Purpose:  The one owner of the waitlist's two writes — adding an entry
          (POST /producers/{id}/delivery-waitlist, routers/producers.py) and
          the once-only email fan-out when a business adds a city to its
          delivery areas (PUT /producers/me → BackgroundTasks → notify_cities).
Touches:  delivery_waitlist rows; services.email.send_email (Resend, fail-open).
Does NOT: decide whether a business is live (that is `is_business()` from
          producer_listing, composed here exactly as the favorite alerts do —
          MEH-2513: a non-live business alerts no one), and does not know
          about favorites or WhatsApp: a signed-in visitor who also wants a
          WhatsApp ping uses the existing favorite-alert panel.
Related:  routers/alerts.py (the account-bound sibling), routers/marketing.py
          (the signed unsubscribe-token pattern this copies), app/data/cities
          (city_key — the ONE comparison form for city strings, MEH-2456).
History:  MEH-2618 (creation). Plan: claude.ai/artifact/2W4LNWVVxUDBSu8gMQQWsW.
"""

from __future__ import annotations

import logging
from datetime import UTC, timedelta
from uuid import UUID

from joserfc import jwt as jose_jwt
from joserfc.errors import JoseError
from joserfc.jwk import OctKey
from sqlalchemy.orm import Session

from app.config import settings
from app.data.cities import city_key
from app.models import DeliveryWaitlistEntry, Producer, User
from app.services.email import send_email
from app.services.producer_listing import is_business
from app.utils.clock import utc_now

logger = logging.getLogger(__name__)

__all__ = [
    "add_entry",
    "city_key",
    "create_host_confirm_token",
    "create_unsubscribe_token",
    "decode_host_confirm_token",
    "decode_unsubscribe_token",
    "claim_host_confirm_send",
    "send_host_confirmation",
    "find_entry",
    "normalize_email",
    "notify_cities",
]

# Stateless signed token, same shape as marketing.py's newsletter one: no DB
# column, no raw email in a GET URL, scope-namespaced so an access/refresh
# token cannot unsubscribe and vice versa, no `exp` — the link in an email
# must keep working months later. `sub` is the ENTRY id, not the email, so the
# token removes exactly one (business, city, email) row and nothing else.
_UNSUBSCRIBE_SCOPE = "delivery_waitlist_unsubscribe"


def _key() -> OctKey:
    return OctKey.import_key(settings.secret_key.encode())


# MEH-2673: the «אשמח לארח נקודת מסירה» confirmation link. Same token shape,
# its own scope, so an unsubscribe link can never confirm hosting and a
# confirmation link can never delete the row.
_HOST_CONFIRM_SCOPE = "delivery_waitlist_host_confirm"
# Unlike the unsubscribe link, a consent link expires: an old mail found
# months later should not still hand the address to a business.
HOST_CONFIRM_TTL = timedelta(days=14)
# One confirmation mail per entry per window, whatever the per-IP limit lets
# through — a stranger re-submitting the form cannot flood the address.
HOST_CONFIRM_RESEND_COOLDOWN = timedelta(hours=24)


def _encode(entry_id: UUID, scope: str, ttl: timedelta | None = None) -> str:
    payload = {"sub": str(entry_id), "scope": scope}
    if ttl is not None:
        payload["exp"] = int((utc_now() + ttl).replace(tzinfo=UTC).timestamp())
    return jose_jwt.encode({"alg": settings.algorithm}, payload, _key())


def create_unsubscribe_token(entry_id: UUID) -> str:
    return _encode(entry_id, _UNSUBSCRIBE_SCOPE)


def create_host_confirm_token(entry_id: UUID) -> str:
    return _encode(entry_id, _HOST_CONFIRM_SCOPE, HOST_CONFIRM_TTL)


def decode_unsubscribe_token(token: str) -> UUID | None:
    """Entry id for a valid token, else None. Never raises (mirrors
    marketing.decode_unsubscribe_token)."""
    return _decode(token, _UNSUBSCRIBE_SCOPE)


def decode_host_confirm_token(token: str) -> UUID | None:
    """MEH-2673: entry id for a valid host-confirmation token, else None."""
    return _decode(token, _HOST_CONFIRM_SCOPE)


def _decode(token: str, scope: str) -> UUID | None:
    try:
        token_obj = jose_jwt.decode(token, _key(), algorithms=[settings.algorithm])
    except (JoseError, ValueError):
        return None
    if token_obj.claims.get("scope") != scope:
        return None
    # joserfc's decode does not check `exp`; a token that carries one is
    # checked here (unsubscribe tokens carry none and never expire).
    exp = token_obj.claims.get("exp")
    if exp is not None:
        now = utc_now().replace(tzinfo=UTC).timestamp()
        if not isinstance(exp, int | float) or exp < now:
            return None
    sub = token_obj.claims.get("sub")
    try:
        return UUID(str(sub))
    except (ValueError, TypeError):
        return None


def normalize_email(email: str) -> str:
    return email.strip().lower()


def find_entry(
    db: Session, producer_id: UUID, *, city: str, email: str
) -> DeliveryWaitlistEntry | None:
    return (
        db.query(DeliveryWaitlistEntry)
        .filter(
            DeliveryWaitlistEntry.producer_id == producer_id,
            DeliveryWaitlistEntry.city_key == city_key(city),
            DeliveryWaitlistEntry.email == normalize_email(email),
        )
        .first()
    )


def add_entry(
    db: Session, producer: Producer, *, email: str, city: str, user: User | None
) -> DeliveryWaitlistEntry:
    """Add (not commit) one waitlist row. The caller checks for the duplicate
    first (find_entry) so it can answer 200/exists instead of 201 — the UNIQUE
    constraint is the backstop, not the interface.

    A signed-in visitor with NO profile city gets this city written to her
    profile: it is the city the favorite-alert geo filter (MEH-1360) reads,
    and asking her again elsewhere is the friction this feature removes. An
    existing profile city is never overwritten — a recent explicit choice wins.
    """
    entry = DeliveryWaitlistEntry(
        producer_id=producer.id,
        city=city.strip(),
        city_key=city_key(city),
        email=normalize_email(email),
        user_id=user.id if user is not None else None,
    )
    db.add(entry)
    if user is not None and not (user.city or "").strip():
        user.city = city.strip()
    return entry


def _producer_url(producer_id: UUID) -> str:
    # The UUID route, not the slug: it always resolves (retired slugs, renames).
    return f"{settings.frontend_url}/producer/{producer_id}"


def _unsubscribe_url(entry_id: UUID) -> str:
    return (
        f"{settings.frontend_url}/delivery-waitlist/unsubscribe"
        f"?token={create_unsubscribe_token(entry_id)}"
    )


def _email_copy(producer_name: str, city: str, producer_id: UUID, entry_id: UUID):
    # Copy approved by Sapir 30/10 («מאשרת הכל», thread «בירור הודעה כשקבוצת
    # רכש לא מגיעה לעיר»). {city} is the VISITOR's spelling — it is her city.
    subject = f"{producer_name} מגיעים עכשיו גם ל{city}"
    body = (
        f"היי,\n\n"
        f"ביקשת שנודיע לך כש{producer_name} יגיעו ל{city} — וזה קרה. "
        f"עכשיו אפשר להזמין:\n{_producer_url(producer_id)}\n\n"
        f"ספיר ✨\n\n"
        f"לא רוצה עדכונים על המשלוחים האלה? {_unsubscribe_url(entry_id)}\n"
        "מהמקור — בתי עסק מקומיים, כולם במקום אחד."
    )
    return subject, body


def notify_cities(db: Session, producer_id: UUID, cities: list[str]) -> None:
    """Mail every not-yet-notified entry whose city_key is among `cities`.

    Runs as a FastAPI BackgroundTask after PUT /producers/me committed the new
    delivery areas (producer_me.py — the same hop the favorite `delivery_area`
    alert takes, with the same `new_cities` list). Delivery is BEST-EFFORT,
    like every other mail in the app: `send_email` is fail-open by contract
    (services/email.py: a missing key, an empty recipient or a Resend error
    is reported to Sentry and swallowed, it never raises), so `notified_at`
    means "handed to the mailer once", not "delivered". There is no retry;
    a delivery failure is visible in Sentry, not in this table. The
    `except` below is defence for a mailer that one day raises; in that case
    the row stays un-notified and the next add of the same city retries it.
    Nothing is sent for a business that is not live (MEH-2513: every link
    points at a page that is a 404 for the public).
    """
    keys = {k for k in (city_key(c) for c in cities) if k}
    if not keys:
        return
    producer = (
        db.query(Producer).filter(Producer.id == producer_id, is_business()).first()
    )
    if producer is None:
        return
    entries = (
        db.query(DeliveryWaitlistEntry)
        .filter(
            DeliveryWaitlistEntry.producer_id == producer_id,
            DeliveryWaitlistEntry.city_key.in_(keys),
            DeliveryWaitlistEntry.notified_at.is_(None),
        )
        .all()
    )
    for entry in entries:
        subject, body = _email_copy(producer.name, entry.city, producer.id, entry.id)
        try:
            send_email(entry.email, subject, body)
        except Exception as exc:  # noqa: BLE001 — defence only; see docstring
            logger.warning(
                "delivery_waitlist: send failed for entry %s: %s", entry.id, exc
            )
            continue
        entry.notified_at = utc_now()
        db.commit()


def _host_confirm_url(entry_id: UUID) -> str:
    return (
        f"{settings.frontend_url}/delivery-waitlist/host-confirm"
        f"?token={create_host_confirm_token(entry_id)}"
    )


def _host_confirm_copy(producer_name: str, city: str, entry_id: UUID):
    # MEH-2673 — copy pending Sapir's word-for-word approval (thread
    # «בדיקת פתרון לניהול נקודות איסוף לבתי עסק», 05/11). Neutral reader
    # address per ADR-037.
    subject = f"אישור: נקודת מסירה של {producer_name} ב{city}"
    body = (
        f"קיבלנו בקשה לארח נקודת מסירה של {producer_name} ב{city}. "
        f"אם זה אתם, אשרו בלחיצה, והמייל שלכם יועבר ל{producer_name} "
        f"כדי לתאם איתכם. אם לא ביקשתם, אפשר להתעלם מהמייל הזה.\n\n"
        f"מאשרים, אפשר להעביר: {_host_confirm_url(entry_id)}\n\n"
        "מהמקור — בתי עסק מקומיים, כולם במקום אחד."
    )
    return subject, body


def send_host_confirmation(
    entry_id: UUID, email: str, city: str, producer_name: str
) -> None:
    """MEH-2673: mail the «אשמח לארח» confirmation link to the address that
    ticked the box. Until the link is clicked `wants_to_host` stays False, so
    an address typed by someone else never reaches the business. Runs as a
    BackgroundTask and reads nothing from the DB — the caller passes what the
    copy needs. Fail-open like every mail (send_email never raises)."""
    subject, body = _host_confirm_copy(producer_name, city, entry_id)
    send_email(email, subject, body)


def claim_host_confirm_send(entry: DeliveryWaitlistEntry) -> bool:
    """MEH-2673: True (and stamps the entry) when a confirmation mail may go
    out now; False inside the resend cooldown. The caller commits."""
    now = utc_now()
    last = entry.host_confirm_sent_at
    if last is not None and now - last < HOST_CONFIRM_RESEND_COOLDOWN:
        return False
    entry.host_confirm_sent_at = now
    return True
