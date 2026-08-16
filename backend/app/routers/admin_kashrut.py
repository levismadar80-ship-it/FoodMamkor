"""MEH-51: Admin endpoints for kashrut badge review + ambassador toggle."""

from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.auth import require_admin
from app.database import get_db
from app.models.models import KashrutBadgeRequest, Producer
from app.models import User
from app.rate_limit import limiter
from app.schemas.schemas import (
    KashrutExpiryReminderOut,
    KashrutExpiryReminderRow,
    KashrutRequestOut,
    KashrutRejectIn,
    SetAmbassadorIn,
)
from app.sentry import capture_background_exception
from app.services.whatsapp import send_template
from app.services.whatsapp_templates import KashrutExpiryReminderV1
from app.utils.pii import mask_phone

router = APIRouter(prefix="/admin", tags=["admin-kashrut"])

# MEH-1673: how far ahead the reminder looks. One constant, not a query
# param — a caller-chosen window would let a mistyped value blast every
# business on file, and the ticket scopes this to 30 days.
EXPIRY_REMINDER_WINDOW_DAYS = 30


@router.get("/kashrut", response_model=list[KashrutRequestOut])
@limiter.limit("60/minute")
def list_kashrut_requests(
    request: Request,
    status: str = "pending",
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(KashrutBadgeRequest)
        .options(joinedload(KashrutBadgeRequest.producer))
        .filter(KashrutBadgeRequest.status == status)
        .order_by(KashrutBadgeRequest.created_at.asc())
        .all()
    )
    results = []
    for r in rows:
        out = KashrutRequestOut.model_validate(r)
        out.producer_name = r.producer.name if r.producer else None
        results.append(out)
    return results


@router.post("/kashrut/{request_id}/approve")
def approve_kashrut_request(
    request_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    req = (
        db.query(KashrutBadgeRequest)
        .filter(KashrutBadgeRequest.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="בקשה לא נמצאה")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail="הבקשה כבר טופלה")

    producer = db.query(Producer).filter(Producer.id == req.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    badges = list(producer.kashrut_badges or [])
    if req.badge_code not in badges:
        badges.append(req.badge_code)
        producer.kashrut_badges = badges

    # Only set timestamps when this is the FIRST approved badge; subsequent
    # badge approvals extend the expiry to keep the latest renewal date.
    now = datetime.utcnow()
    if producer.kashrut_expires_at is None or producer.kashrut_expires_at < now:
        producer.kashrut_verified_at = now
        producer.kashrut_expires_at = now + timedelta(days=365)
    else:
        # Extend by 1 year from latest expiry so cert chains don't shrink.
        producer.kashrut_expires_at = producer.kashrut_expires_at + timedelta(days=365)

    req.status = "approved"
    req.reviewed_by = user.id
    db.commit()
    return {"detail": "badge אושר"}


@router.post("/kashrut/{request_id}/reject")
def reject_kashrut_request(
    request_id: UUID,
    body: KashrutRejectIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    req = (
        db.query(KashrutBadgeRequest)
        .filter(KashrutBadgeRequest.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="בקשה לא נמצאה")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail="הבקשה כבר טופלה")

    req.status = "rejected"
    req.reviewed_by = user.id
    req.notes = body.notes
    db.commit()
    return {"detail": "בקשה נדחתה"}


@router.post("/producers/{producer_id}/set-ambassador")
def set_ambassador(
    producer_id: UUID,
    body: SetAmbassadorIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    if body.ambassador and producer.status != "approved":
        raise HTTPException(
            status_code=400, detail="ניתן להגדיר שגריר רק לבית עסק פעיל"
        )
    if producer.ambassador == body.ambassador:
        return {"detail": "ללא שינוי", "ambassador": producer.ambassador}
    producer.ambassador = body.ambassador
    db.commit()
    return {"detail": "עודכן", "ambassador": producer.ambassador}


def _normalize_il_phone(phone: str) -> str:
    """Strip hyphens/whitespace; prepend +972 if local 0… format.
    # REUSES: backend/app/services/auth_notifications.py:39 — same
    # normalization every other producer-facing template send uses.
    """
    phone = phone.replace("-", "").strip()
    if not phone.startswith("+"):
        phone = "+972" + phone.lstrip("0")
    return phone


@router.post("/kashrut/expiry-reminders", response_model=KashrutExpiryReminderOut)
@limiter.limit("10/hour")
def kashrut_expiry_reminders(
    request: Request,
    dry_run: bool = True,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """MEH-1673: WhatsApp reminder to businesses whose kashrut cert expires soon.

    `dry_run` defaults to **True** — the dangerous direction has to be asked
    for explicitly, so a bare POST can never send. In dry-run the rows are
    returned and `send_template` is not called even once.

    Selection: `kashrut_expires_at` between now and now+30d, producer
    approved, at least one active badge, and a phone on file. An expiry
    already in the past is NOT included — that reminder is too late to keep
    the badge continuous, which is the whole point.

    Per-business failures are isolated: one bad send is recorded on its own
    row and the batch continues. Every exception is reported to Sentry
    explicitly via `capture_background_exception` — a batch loop that
    swallows exceptions is exactly the blindness MEH-1533 documented.
    """
    now = datetime.utcnow()
    horizon = now + timedelta(days=EXPIRY_REMINDER_WINDOW_DAYS)
    producers = (
        db.query(Producer)
        .filter(
            Producer.kashrut_expires_at.isnot(None),
            Producer.kashrut_expires_at >= now,
            Producer.kashrut_expires_at <= horizon,
            Producer.status == "approved",
            Producer.phone.isnot(None),
            Producer.phone != "",
        )
        .order_by(Producer.kashrut_expires_at.asc())
        .all()
    )
    # kashrut_badges is an ARRAY column; an empty list means the badge is not
    # active, so there is nothing for the owner to keep continuous. Filtered
    # in Python rather than SQL to keep the query portable across the
    # array-emptiness dialects.
    producers = [p for p in producers if p.kashrut_badges]

    rows: list[KashrutExpiryReminderRow] = []
    sent_count = 0
    failed_count = 0

    for producer in producers:
        row = KashrutExpiryReminderRow(
            producer_id=producer.id,
            name=producer.name,
            phone_masked=mask_phone(producer.phone),
            expires_at=producer.kashrut_expires_at,
        )
        if dry_run:
            rows.append(row)
            continue

        try:
            ok = send_template(
                _normalize_il_phone(producer.phone),
                KashrutExpiryReminderV1(
                    owner_name=producer.contact_name or producer.name,
                    producer_name=producer.name,
                    expires_at=producer.kashrut_expires_at.strftime("%d/%m/%Y"),
                ),
            )
        except Exception as exc:  # noqa: BLE001 — one bad send must not stop the batch
            capture_background_exception(exc, task="kashrut_expiry_reminders")
            row.sent = False
            # The masked phone is already on the row; keep the exception text
            # out of the response so a Meta payload can't leak a full number.
            row.error = "שגיאה בשליחה"
            failed_count += 1
            rows.append(row)
            continue

        row.sent = ok
        if ok:
            sent_count += 1
        else:
            # send_template is fail-open and returns False on a Meta error —
            # including 132001 (template not approved yet), which is the
            # EXPECTED state until Meta approves `kashrut_expiry_reminder`.
            row.error = "ההודעה לא נשלחה — ייתכן שה-template עדיין לא אושר"
            failed_count += 1
        rows.append(row)

    return KashrutExpiryReminderOut(
        dry_run=dry_run,
        window_days=EXPIRY_REMINDER_WINDOW_DAYS,
        total=len(rows),
        sent_count=sent_count,
        failed_count=failed_count,
        rows=rows,
    )
