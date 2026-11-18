"""
Module:   product_order_phone
Purpose:  Prove that a buyer holds the phone she orders with: issue a
          one-time code, count wrong tries, and consume the code when the
          order is written.
Touches:  DB table product_order_phone_codes. Takes a transaction-scoped
          Postgres advisory lock per phone. Sends nothing: the route sends
          the WhatsApp message.
Does NOT: store a code. Only HMAC-SHA256(server secret, phone:code) is
          kept, so reading the table does not reveal a live code and a code
          for one phone is worth nothing on another.
          Does NOT verify the business owner's phone — that is
          routers/producer_me.py (`phone_otp_tokens`, per business).
Related:  app/routers/product_order_buyer.py (the two callers),
          app/utils/phone.py::canonical_il_msisdn (the one phone form),
          tests/test_meh3263_order_route.py
History:  MEH-3263 (creation; stage 2b of MEH-3216)
"""

import hashlib
import hmac
import logging
import secrets
import string
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.config import settings
from app.models.product_orders import ProductOrderPhoneCode
from app.utils.clock import utc_now
from app.utils.phone import canonical_il_msisdn

log = logging.getLogger(__name__)

CODE_DIGITS = 6
CODE_TTL = timedelta(minutes=10)
MAX_WRONG_TRIES = 5
# A WhatsApp authentication message costs money and lands on a stranger's
# phone, so both limits are counted in the table, not per server process:
# three codes an hour to one phone, and a ceiling on the whole site per day
# that closes the feature (and shouts) instead of sending without bound.
CODES_PER_PHONE_PER_HOUR = 3
CODES_PER_DAY_SITE_WIDE = 500

PHONE_INVALID_DETAIL = "צריך מספר טלפון נייד ישראלי תקין"
TOO_MANY_CODES_DETAIL = "נשלחו כבר כמה קודים למספר הזה. אפשר לנסות שוב בעוד שעה"
CODES_UNAVAILABLE_DETAIL = "אי אפשר לשלוח קוד כרגע. נסו שוב מאוחר יותר"
CODE_WRONG_DETAIL = "הקוד לא נכון או שפג תוקפו. אפשר לבקש קוד חדש"


def canonical_phone(raw: str | None) -> str:
    """The one form a buyer's phone is stored, counted and locked in."""
    phone = canonical_il_msisdn(raw)
    if phone is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=PHONE_INVALID_DETAIL,
        )
    return phone


def lock_phone(db: Session, phone: str) -> None:
    """Serialise everything that counts by phone (codes sent, open orders)
    until the transaction ends. Always taken BEFORE any row lock."""
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"product-order-phone:{phone}"},
    )


def _code_hash(phone: str, code: str) -> str:
    return hmac.new(
        settings.secret_key.encode(), f"{phone}:{code}".encode(), hashlib.sha256
    ).hexdigest()


def _count_since(db: Session, since: datetime, phone: str | None = None) -> int:
    query = db.query(func.count(ProductOrderPhoneCode.id)).filter(
        ProductOrderPhoneCode.created_at >= since
    )
    if phone is not None:
        query = query.filter(ProductOrderPhoneCode.phone == phone)
    return int(query.scalar() or 0)


def issue_code(db: Session, phone: str, fixed_code: str | None = None) -> str:
    """Store a fresh code for `phone` and return it for sending. Commits.

    `fixed_code` is the staging test-number code (MEH-2231); every other
    caller passes None and gets six random digits.
    """
    lock_phone(db, phone)
    now = utc_now()
    if _count_since(db, now - timedelta(hours=1), phone) >= CODES_PER_PHONE_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=TOO_MANY_CODES_DETAIL,
        )
    if _count_since(db, now - timedelta(days=1)) >= CODES_PER_DAY_SITE_WIDE:
        # Fail closed. ERROR so Sentry raises it: either the site is being
        # used to spam phones, or the ceiling is too low for real traffic.
        log.error(
            "product orders: site-wide phone-code ceiling reached (%s a day)",
            CODES_PER_DAY_SITE_WIDE,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=CODES_UNAVAILABLE_DETAIL,
        )
    code = fixed_code or "".join(
        secrets.choice(string.digits) for _ in range(CODE_DIGITS)
    )
    db.add(
        ProductOrderPhoneCode(
            phone=phone,
            code_hash=_code_hash(phone, code),
            expires_at=now + CODE_TTL,
        )
    )
    db.commit()
    return code


def check_code(db: Session, phone: str, code: str) -> ProductOrderPhoneCode:
    """Return the live code row for `phone` when `code` matches it.

    Only the newest code counts. A wrong try is COMMITTED before the 4xx is
    raised, so a rollback further up cannot hand the try back; the caller
    must therefore have written nothing else in this transaction yet.
    The row is returned locked and still unused — `consume` marks it used in
    the transaction that writes the order.
    """
    row = (
        db.query(ProductOrderPhoneCode)
        .filter(ProductOrderPhoneCode.phone == phone)
        .order_by(ProductOrderPhoneCode.created_at.desc())
        .with_for_update()
        .first()
    )
    wrong = HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=CODE_WRONG_DETAIL
    )
    if (
        row is None
        or row.used_at is not None
        or row.expires_at <= utc_now()
        or int(row.attempts) >= MAX_WRONG_TRIES
    ):
        raise wrong
    if not hmac.compare_digest(str(row.code_hash), _code_hash(phone, code)):
        row.attempts = int(row.attempts) + 1
        db.commit()
        raise wrong
    return row


def consume(db: Session, row: ProductOrderPhoneCode) -> bool:
    """Mark the code used, once. False when someone else already did."""
    claimed = (
        db.query(ProductOrderPhoneCode)
        .filter(
            ProductOrderPhoneCode.id == row.id,
            ProductOrderPhoneCode.used_at.is_(None),
        )
        .update({"used_at": utc_now()}, synchronize_session=False)
    )
    return claimed == 1
