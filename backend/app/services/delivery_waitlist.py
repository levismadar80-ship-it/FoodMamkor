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
    "create_unsubscribe_token",
    "decode_unsubscribe_token",
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


def create_unsubscribe_token(entry_id: UUID) -> str:
    payload = {"sub": str(entry_id), "scope": _UNSUBSCRIBE_SCOPE}
    return jose_jwt.encode({"alg": settings.algorithm}, payload, _key())


def decode_unsubscribe_token(token: str) -> UUID | None:
    """Entry id for a valid token, else None. Never raises (mirrors
    marketing.decode_unsubscribe_token)."""
    try:
        token_obj = jose_jwt.decode(token, _key(), algorithms=[settings.algorithm])
    except (JoseError, ValueError):
        return None
    if token_obj.claims.get("scope") != _UNSUBSCRIBE_SCOPE:
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
    alert takes, with the same `new_cities` list). Fail-open per recipient: a
    send that raises is logged and the row stays un-notified, so the next add
    of the same city retries it rather than losing it. Nothing is sent for a
    business that is not live (MEH-2513 — every link points at a page that is
    a 404 for the public).
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
        except Exception as exc:  # noqa: BLE001 — fail-open, per recipient
            logger.warning(
                "delivery_waitlist: send failed for entry %s: %s", entry.id, exc
            )
            continue
        entry.notified_at = utc_now()
        db.commit()
