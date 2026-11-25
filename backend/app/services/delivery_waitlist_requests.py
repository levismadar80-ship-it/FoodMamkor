"""
Module:   delivery_waitlist_requests
Purpose:  What the three public delivery-waitlist routes do with a request:
          join a business's per-city waitlist (with the «אשמח לארח» host
          confirmation), confirm hosting from the signed email link, and
          unsubscribe from it.
Touches:  DB delivery_waitlist rows (commit / rollback here). Queues
          `delivery_waitlist.send_host_confirmation` on BackgroundTasks after
          the commit (Resend, fail-open).
Does NOT: own the waitlist's rules, which live in services/delivery_waitlist.py:
          the entry lookup and insert, the per-address send cap and advisory
          lock, the tokens and the city fan-out. It also doesn't set the HTTP
          status of a repeat signup: `add_to_delivery_waitlist` says whether
          the row is new and the router answers 201 or 200.
Related:  app/routers/producers.py join_delivery_waitlist ·
          confirm_delivery_waitlist_host · unsubscribe_delivery_waitlist
          (the callers).
History:  MEH-3537 (moved from routers/producers.py; the bodies are verbatim,
          only add_to_delivery_waitlist now returns (body, created); not
          named join_waitlist, which group_buy_capacity.py already uses).
          Originally MEH-2618 · MEH-2673 · MEH-2952.
"""

from typing import Any
from uuid import UUID

from fastapi import BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import DeliveryWaitlistEntry, Producer, User
from app.schemas.schemas import (
    DeliveryWaitlistHostConfirmIn,
    DeliveryWaitlistIn,
    DeliveryWaitlistOut,
)
from app.services import delivery_waitlist  # MEH-2618
from app.services.producer_listing import is_business
from app.utils.clock import utc_now


def add_to_delivery_waitlist(
    db: Session,
    producer_id: UUID,
    data: DeliveryWaitlistIn,
    current_user: User | None,
    background_tasks: BackgroundTasks,
) -> tuple[DeliveryWaitlistOut, bool]:
    """Join, or re-ask on an existing entry. Returns the body and whether a
    new row was added (201) rather than found (200)."""
    # MEH-2618: the public listing filter, not a bare existence check — a
    # pending/rejected business has no public page to send her to, and its
    # trigger would never fire (notify_cities applies the same filter).
    producer = (
        db.query(Producer).filter(Producer.id == producer_id, is_business()).first()
    )
    if producer is None:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    # MEH-2952: a test business or a signed-in test account → no mail.
    test_cause = bool(
        producer.is_test or (current_user is not None and current_user.is_test)
    )
    existing = delivery_waitlist.find_entry(
        db,
        producer.id,  # type: ignore[arg-type]
        city=data.city,
        email=data.email,
    )
    if existing is not None:
        # MEH-2673: a repeat signup that ticks «אשמח לארח» (re)sends the
        # confirmation link; the row turns True only from that link. An
        # unticked repeat changes nothing — never a silent withdrawal.
        host_confirm = None
        if data.wants_to_host:
            if existing.wants_to_host:
                host_confirm = "confirmed"
            else:
                verdict = delivery_waitlist.claim_host_confirm_send(db, existing)
                if verdict == "send":
                    # Captured before the commit: expire_on_commit would
                    # otherwise refresh the row just to read three columns.
                    mail_args = (
                        existing.id,
                        existing.email,
                        existing.city,
                        producer.name,
                    )
                    db.commit()
                    host_confirm = "sent"
                    background_tasks.add_task(
                        delivery_waitlist.send_host_confirmation,
                        *mail_args,  # type: ignore[arg-type]
                        test_cause=test_cause,
                    )
                else:
                    db.rollback()  # releases the advisory lock, nothing to write
                    host_confirm = verdict
        return DeliveryWaitlistOut(status="exists", host_confirm=host_confirm), False
    entry = delivery_waitlist.add_entry(
        db, producer, email=data.email, city=data.city, user=current_user
    )
    new_verdict: delivery_waitlist.HostConfirmVerdict | None = None
    try:
        # The INSERT is flushed here, inside the except below, BEFORE the
        # claim takes the per-address lock — so a double-tap (two first-time
        # POSTs for the same row in flight) trips the unique constraint
        # here, not as an unhandled 500 out of the claim's own statements.
        db.flush()
        if data.wants_to_host:
            # Stamped before the commit so this mail counts toward the
            # per-address cap; the mail itself is queued after the commit.
            new_verdict = delivery_waitlist.claim_host_confirm_send(db, entry)
        mail_args = (entry.id, entry.email, entry.city, producer.name)
        db.commit()
    except IntegrityError:
        # Two identical POSTs in flight (double-tap): both passed find_entry,
        # the second trips uq_delivery_waitlist_city_email. That is the same
        # calm "exists" as the sequential duplicate, not a 500.
        db.rollback()
        return DeliveryWaitlistOut(status="exists"), False
    host_confirm = new_verdict
    if new_verdict == "send":
        # MEH-2673: the box alone shares nothing. The row stays
        # wants_to_host=False until the address itself clicks the link —
        # otherwise anyone could hand a stranger's email to a business.
        host_confirm = "sent"
        background_tasks.add_task(
            delivery_waitlist.send_host_confirmation,
            *mail_args,  # type: ignore[arg-type]
            test_cause=test_cause,
        )
    return DeliveryWaitlistOut(status="added", host_confirm=host_confirm), True


def confirm_host(
    db: Session,
    data: DeliveryWaitlistHostConfirmIn,
    background_tasks: BackgroundTasks,
) -> dict[str, Any] | JSONResponse:
    """The signed host-confirmation link: turn wants_to_host on, or answer
    410 and mail a fresh link when the token has expired."""
    entry_id, state = delivery_waitlist.inspect_host_confirm_token(data.token)
    entry = db.get(DeliveryWaitlistEntry, entry_id) if entry_id else None
    if entry is None:
        raise HTTPException(status_code=400, detail="הקישור לא תקין או שפג תוקפו")
    if state == "expired" and not entry.wants_to_host:
        # An expired link on an already-confirmed entry falls through to the
        # idempotent 200 below: the consent is on record, no error page.
        resent = False
        if delivery_waitlist.claim_host_confirm_send(db, entry) == "send":
            mail_args = (entry.id, entry.email, entry.city, entry.producer.name)
            db.commit()
            resent = True
            background_tasks.add_task(
                delivery_waitlist.send_host_confirmation,
                *mail_args,  # type: ignore[arg-type]
                test_cause=bool(entry.producer and entry.producer.is_test),
            )
        else:
            db.rollback()  # releases the advisory lock, nothing to write
        return JSONResponse(
            status_code=410,
            content={"detail": "הקישור לא תקין או שפג תוקפו", "resent": resent},
        )
    if not entry.wants_to_host:
        entry.wants_to_host = True  # type: ignore[assignment]
        entry.host_confirmed_at = utc_now()  # type: ignore[assignment]
        db.commit()
    return {"producer_name": entry.producer.name}


def unsubscribe(db: Session, token: str) -> dict[str, Any]:
    """Remove one entry by its signed token. Idempotent; 400 on a bad token."""
    entry_id = delivery_waitlist.decode_unsubscribe_token(token)
    if entry_id is None:
        raise HTTPException(status_code=400, detail="קישור ביטול לא תקין")
    entry = db.get(DeliveryWaitlistEntry, entry_id)
    if entry is not None:
        db.delete(entry)
        db.commit()
    return {"detail": "הוסרת מרשימת ההמתנה"}
