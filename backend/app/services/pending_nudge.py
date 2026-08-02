"""
Module:   pending_nudge
Purpose:  Daily-scheduler entry point for the ONE day-1 nudge email sent to a
          business that registered but cannot yet be approved — it is missing
          a photo (the MEH-799 gate) and/or its WhatsApp number is unverified
          (status `pending_whatsapp`, MEH-745). The email names exactly what
          is missing and links to the dashboard.
Touches:  reads producers + users via SQLAlchemy Session; writes
          `email_pending_nudge_sent_at` on the producer row; dispatches via
          app.services.email.send_email (Resend, fail-open).
Does NOT: hold the scheduler instance (that lives in app.startup); send a
          second/third nudge (ONE email, once — see the stamp contract
          below); touch app.services.onboarding_followup, which is frozen
          under MEH-1587 and stays approved-only.
Related:  backend/app/services/onboarding_followup.py (the module this
          mirrors 1:1 — candidate query shape, per-producer fail-isolation,
          per-producer commit, sent-column stamping),
          backend/app/services/email.py (send_email fail-open contract),
          backend/alembic/versions/20260802_1200_d3b7f1a92c64_meh1818_
          pending_nudge_sent_at.py (the column this module relies on).
History:  MEH-1818 (creation, 2026-08-02) — implements the decision deferred
          in MEH-1587 §8 ("what does a PENDING business receive?").
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import Producer, User
from app.services.email import send_email

# MEH-1242 established SITE_DOMAIN as the SINGLE canonical site-domain
# constant. Imported rather than re-declared — a second literal here is
# exactly the duplication MEH-1242 removed. Reading a public constant does
# not violate the MEH-1587 freeze on that module's bodies/logic.
from app.services.onboarding_followup import SITE_DOMAIN

logger = logging.getLogger(__name__)


# MEH-1818: the two Producer.status values that may receive the nudge.
#
# Producer.status is a free String(20) (models.py:78) with no enum and no DB
# CHECK constraint; the authoritative enumeration is the admin filter pattern
# at routers/admin.py:112 — pending | pending_whatsapp | approved | rejected |
# inactive. Membership in this tuple admits exactly two of the five, so a
# status added later is excluded by DEFAULT (fail-closed) rather than silently
# opted into an email that assumes "we are waiting on you".
#
# This is the same fail-closed reasoning MEH-1587 used to pick a single `==`
# for the approved-only sequence; the safe direction is that a new status
# receives nothing until someone decides what it should receive.
_NUDGEABLE_STATUSES = ("pending", "pending_whatsapp")

# MEH-1818: a business is nudged one day after registering. Deliberately not
# tunable via env (the ticket's constraint: no new env vars) — the activation
# research behind the choice (<48h activation ⇒ <10% churn) is a product
# decision, not an operational knob.
_NUDGE_AFTER = timedelta(hours=24)


# ---------- email copy ----------
#
# LOCKED — approved verbatim by Sapir 31/07/2026 in the MEH-1818 description
# (<hebrew_copy locked="✓">). Style matches onboarding_followup: Sapir's first
# person (feminine — "אני קוראת"), addressing the reader in the plural.
# Changing a character requires Sapir's sign-off.

_SUBJECT = "עוד צעד קטן — והעסק שלך עובר לבדיקה"

_BODY = """\
{greeting}

קיבלנו את ההרשמה — תודה! כדי שנוכל לבדוק ולאשר את העסק, נשאר להשלים:

{missing_items}

הכל בלוח הבקרה, לוקח פחות מ-5 דקות:
{frontend_url}/producer/dashboard

צריך עזרה או משהו לא ברור? תכתבו לי בחזרה — אני קוראת כל אימייל.

ספיר שנפ
מייסדת | מהמקור
{site_domain}
"""

_MISSING_ITEM_PHOTO = (
    "📷 תמונה אחת של העסק או המוצרים — זה הדבר הראשון שלקוחות רואים, "
    "ובלעדיה לא נוכל לאשר."
)
_MISSING_ITEM_PHONE = (
    "✅ אימות מספר הוואטסאפ — קוד קצר שמגיע בוואטסאפ, מאשרים אותו בלוח הבקרה."
)


# ---------- helpers ----------


def _greeting(first_name: str) -> str:
    """Build the opening Hebrew greeting line ("Hi X,"). Falls back to the
    bare greeting ("Hi,") when the user has no parseable first name
    (User.name None/empty/whitespace-only).

    Mirrors onboarding_followup._greeting. Deliberately re-declared rather
    than imported: that symbol is private to a module frozen under MEH-1587,
    and reaching into another module's underscore API to save four lines
    creates a coupling nobody would expect to be load-bearing.
    """
    return f"היי {first_name}," if first_name else "היי,"


def _missing_items(producer: Producer) -> list[str]:
    """The list of things blocking this producer's approval, in the order
    they are shown in the email.

    Photo: `Producer.images` is ARRAY(Text) with `default=[]` (models.py:79),
    so an untouched row can be `[]` OR `None` depending on how it was
    inserted — `or []` normalises both to "no photo". This is the MEH-799
    gate: registration does not collect an image, so a brand-new business is
    born un-approvable.

    Phone: `pending_whatsapp` IS the unverified-number state (MEH-745), so
    the status value alone is the signal — there is no separate flag to read.
    """
    items: list[str] = []
    if not (producer.images or []):
        items.append(_MISSING_ITEM_PHOTO)
    if producer.status == "pending_whatsapp":
        items.append(_MISSING_ITEM_PHONE)
    return items


def _build_email(
    producer: Producer, first_name: str, items: list[str]
) -> tuple[str, str]:
    """Render (subject, body) for one producer's nudge."""
    return _SUBJECT, _BODY.format(
        greeting=_greeting(first_name),
        missing_items="\n".join(items),
        frontend_url=settings.frontend_url,
        site_domain=SITE_DOMAIN,
    )


# ---------- public entry point ----------


def send_pending_nudges(db: Session) -> dict[str, int]:
    """Scheduler entry point. Find every producer that is still awaiting
    approval, registered more than 24h ago, and has never been through this
    pass; email it exactly what is missing; stamp
    `email_pending_nudge_sent_at`. Returns
    {"sent": n, "stamped_nothing_missing": n}.

    ONE email, once. Two mechanisms enforce that jointly:
      * the candidate query requires `email_pending_nudge_sent_at IS NULL`;
      * a producer with NOTHING missing is stamped WITHOUT being emailed.
    The second is the non-obvious half. A complete-but-unapproved business is
    waiting on Sapir, not on itself — nudging it would be false ("נשאר
    להשלים" with an empty list). Stamping it anyway takes it out of the
    candidate set permanently, so it cannot be re-evaluated and mailed on a
    later day if it happens to lose its photo.

    Per-producer fail-isolation: any exception inside one iteration is logged
    and the loop continues — the daily run never crashes on a bad row.
    Per-producer commit (not batch): if Resend silently drops a delivery the
    column still flips to non-null, the same accepted risk as MEH-539
    Phase 2A.5.

    Status gate: `_NUDGEABLE_STATUSES` is a correctness boundary. An approved,
    rejected, or inactive business must never receive this — "we are waiting
    for you to finish" is false for all three, and actively insulting to a
    rejected one (the MEH-1587 failure, in a new module).
    """
    counts = {"sent": 0, "stamped_nothing_missing": 0}
    cutoff = datetime.now(timezone.utc) - _NUDGE_AFTER

    candidates = (
        db.query(Producer)
        .filter(
            Producer.status.in_(_NUDGEABLE_STATUSES),
            Producer.created_at <= cutoff,
            Producer.email_pending_nudge_sent_at.is_(None),
        )
        .all()
    )

    for p in candidates:
        try:
            items = _missing_items(p)
            if not items:
                # Nothing to nudge about — stamp and move on, no email.
                p.email_pending_nudge_sent_at = datetime.now(timezone.utc)
                db.commit()
                counts["stamped_nothing_missing"] += 1
                logger.info(
                    "[PENDING-NUDGE] producer_id=%s nothing missing — stamped, "
                    "no email",
                    p.id,
                )
                continue

            user = db.query(User).filter(User.producer_id == p.id).first()
            if not user or not user.email:
                # No addressable owner. Left UNSTAMPED on purpose: the column
                # means "has been nudged", and this producer has not been.
                # If a user row appears later the nudge still fires.
                continue

            parts = (user.name or "").strip().split()
            first_name = parts[0] if parts else ""
            subject, body = _build_email(p, first_name, items)
            send_email(user.email, subject, body)
            p.email_pending_nudge_sent_at = datetime.now(timezone.utc)
            db.commit()
            counts["sent"] += 1
            logger.info(
                "[PENDING-NUDGE] producer_id=%s sent items=%d", p.id, len(items)
            )
        except Exception as e:  # noqa: BLE001 — fail-open per producer
            db.rollback()
            logger.warning("[PENDING-NUDGE] producer_id=%s failed: %s", p.id, e)
            continue

    return counts
