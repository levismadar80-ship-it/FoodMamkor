"""
Module:    admin_decisions
Purpose:   The admin review decisions under /admin/producers: the pending
           queue, approve, reject (with presets), request changes, and the
           verified badge, plus the two send wrappers those routes use.
Does NOT:  Hold the approval rules (services/producer_approval.py), the
           email copy (services/admin_producer_emails.py), or the rest of
           the admin API (routers/admin.py).
Split out of routers/admin.py (MEH-3267); the code is moved verbatim.
"""

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import require_admin
from app.config import settings
from app.database import get_db
from app.models import Producer, User
from app.routers.admin import (
    _attach_aging,
    _attach_has_owner,
)
from app.schemas.schemas import (
    GrantVerifiedIn,
    ProducerAdminOut,
    ProducerRejectIn,
    RejectionPresetOut,
    RequestChangesIn,
)
from app.services import indexnow  # MEH-2852
from app.services.admin_producer_emails import (
    _producer_approved_body,
    _producer_approved_html,
    _producer_changes_requested_body,
    _producer_rejected_body,
    _producer_rejected_html,
    _rejection_reason_suffix,
)
from app.services.auth_notifications import (
    notify_producer_approved,
    notify_producer_changes_requested,
)
from app.services.email import send_email
from app.services.group_buy_delist import cancel_live_group_buys  # MEH-2498
from app.services.producer_approval import (
    ApprovalOverrides,
    _apply_approval_state,
    _assert_approvable,
    _persist_approval,
)
from app.services.producer_queries import attach_badge_fields
from app.services.whatsapp import send_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/producers/pending", response_model=list[ProducerAdminOut])
def pending_producers(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[ProducerAdminOut] | list[Producer]:
    results = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
            # MEH-2060: see list_producers above — same derivation, same reason.
            selectinload(Producer.locations),
        )
        .filter(Producer.status == "pending")
        # NOTE (MEH-2110): deliberately still newest-first. This route has no
        # frontend consumer today, and re-ordering it is a behaviour change the
        # ticket does not ask for. The aging field below IS attached, because
        # ProducerAdminOut declares it and serialising a structural `0` here
        # would misreport rather than merely omit.
        .order_by(Producer.created_at.desc())
        .all()
    )
    for p in results:
        attach_badge_fields(p)
        _attach_aging(p)
    _attach_has_owner(db, results)
    return results


@router.post("/producers/{producer_id}/approve", response_model=None)
def approve_producer(  # noqa: PLR0913 — all 6 args are FastAPI-injected (path id, BackgroundTasks, two override flags, auth dep, db dep); MEH-2852 added the IndexNow hop
    producer_id: UUID,
    background_tasks: BackgroundTasks,
    # MEH-971 chunk 4: explicit admin override for the license-pending guard
    # below. Defaults False so the guard is on by default; an admin who has
    # verified a license out-of-band passes ?allow_without_license=true.
    allow_without_license: bool = Query(default=False),
    # MEH-2121: the same shape, for the WhatsApp-verification gate. Default
    # False, so an admin has to ask for the door in the URL.
    allow_unverified_phone: bool = Query(default=False),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    # MEH-2121: a draft never asked to be reviewed. Approving one publishes a
    # business that skipped the whole machine and leaves
    # `submitted_for_review_at` NULL, which is the column MEH-2110's SLA badge
    # counts from — so the queue would carry a row it cannot age. No override:
    # unlike the license and phone gates below, there is no legitimate reason to
    # approve something that was never submitted; the owner presses the button.
    #
    # Handler-only, and that is sufficient rather than an oversight: the retry
    # path re-reads the row. The four literal `status="draft"` writes are all
    # at creation (auth.py:571, auth.py:781, services/producer_queries.py:662,
    # and admin.py:669 — admin_create_producer's `as_draft`, MEH-2322; lines as
    # of 10/11/2026). No route
    # moves an existing producer back to draft: the admin PUT that once could
    # (found in the MEH-2322 re-review) refuses any `status` in its payload
    # with a 422 since MEH-2502 (admin_update_producer, `if "status" in
    # payload`). So the retry cannot read a draft row unless a creation path
    # is added. MEH-2870: this comment used to call that hole open and accepted.
    if producer.status == "draft":
        raise HTTPException(
            status_code=409,
            detail="העסק עדיין בטיוטה — טרם נשלח לבדיקה",
        )
    overrides = ApprovalOverrides(
        without_license=allow_without_license,
        unverified_phone=allow_unverified_phone,
    )
    # MEH-2017: the approval gates (MEH-799 photo, MEH-971 license, MEH-2121
    # phone) live in _assert_approvable, which _persist_approval also calls
    # after its re-read so the retry path cannot approve a row this path would
    # have rejected.
    _assert_approvable(db, producer, overrides, user.id)  # type: ignore[arg-type]
    # MEH-1817: the approval column writes live in _apply_approval_state so the
    # retry path below can re-apply exactly the same set after a rollback.
    _apply_approval_state(producer)
    # MEH-1817: slug mint + commit, extracted so this handler stays under the
    # C901 ceiling. See _persist_approval for why the commit is retried.
    producer = _persist_approval(db, producer_id, producer, overrides, user.id)  # type: ignore[arg-type]

    # MEH-509 PR1: capture primitives before any post-commit work — ORM
    # attributes are safe here (no expire_on_commit configured on this
    # session), but capturing decouples the notify calls from the model.
    p_name = producer.name
    p_phone = producer.phone
    p_slug = producer.slug
    p_id = producer.id

    producer_user = db.query(User).filter(User.producer_id == producer.id).first()
    # MEH-2952: approving a test business (or one owned by a test account)
    # sends nothing — owner email, owner WhatsApp and the admin ping alike.
    p_test = bool(producer.is_test or (producer_user and producer_user.is_test))
    if producer_user:
        _send_notification_email(
            producer_user.email,  # type: ignore[arg-type]
            # MEH-2113: the celebratory headline, in the one place it is TRUE.
            # It was rejected for the registration screen (MEH-2100 item 9)
            # precisely because onboarding was not complete there; at approval
            # it is — the business is live on the site. Sapir-approved copy,
            # verbatim (16/08) and untouched by MEH-2151 — that ticket restructures
            # the BODY (CTA links, HTML part), never this subject line.
            "ברוכים הבאים למהמקור",
            # MEH-2151: p_slug is captured above (MEH-1817 mints it during this
            # very approval), so both parts can carry the /p/{slug} link. A
            # producer with no slug still gets a well-formed mail — both
            # builders drop their view-page block whole.
            _producer_approved_body(p_name, p_slug),  # type: ignore[arg-type]
            html=_producer_approved_html(p_name, p_slug),  # type: ignore[arg-type]
            test_cause=p_test,
        )

    # MEH-509 PR1: fire producer_approved_v1 WhatsApp template to the
    # producer. Fail-open at the service layer — any failure here must
    # NOT block the 200 response (approval already committed above).
    notify_producer_approved(p_name, p_phone, p_slug, p_id, test_cause=p_test)  # type: ignore[arg-type]
    # MEH-2852: the business page just appeared.
    indexnow.schedule(background_tasks, indexnow.producer_urls(producer))

    # Notify admin via WhatsApp
    if settings.admin_whatsapp_to:
        _send_whatsapp(
            settings.admin_whatsapp_to,
            f'✅ העסק "{p_name}" אושר במהמקור.',
            test_cause=p_test,
        )

    return {"detail": "Producer approved"}


# MEH-226: the five canonical rejection reasons. This dict is the SINGLE
# source of truth for the labels — the admin UI fetches them from
# GET /admin/producers/rejection-presets rather than carrying its own copy,
# so the string the admin clicks, the string persisted to
# producers.rejection_reason, and the string in the producer's email are the
# same object (workflow.md Smell #1: two owners for one fact).
# Insertion order is the display order.
PRODUCER_REJECTION_PRESETS: dict[str, str] = {
    "missing_docs": "מסמכים חסרים / לא קריאים",
    "missing_image": "תמונה ראשית חסרה",
    "incomplete_info": "מידע עסקי לא מלא (כתובת / טלפון / תיאור)",
    "not_eligible": "עסק לא עומד בתנאי הפלטפורמה",
    "other": "אחר (פירוט חופשי)",
}


def _compose_rejection_reason(preset_key: str | None, reason: str) -> str:
    """Join the preset label with the admin's free text into the ONE string
    that is persisted, emailed and sent to the admin WhatsApp line.

    `other` deliberately yields the free text ALONE — its label reads
    "אחר (פירוט חופשי)", which is a UI affordance describing the input, not a
    reason. Prefixing it would put "סיבה: אחר (פירוט חופשי) — ..." in a
    business owner's inbox. Every other preset prefixes its label and appends
    the free text only when the admin actually typed some.

    No preset (legacy callers, and the pre-MEH-226 `{"reason": ...}` body)
    falls through to the free text unchanged.

    PRECONDITION: `preset_key` is None or a key of PRODUCER_REJECTION_PRESETS —
    the route handler 400s on anything else BEFORE calling this. The lookup
    below is therefore deliberately undefended: a KeyError here would mean an
    internal caller skipped that validation, and crashing loudly at the one
    line that noticed beats composing a rejection reason out of a key nobody
    recognises and mailing it to a business owner.
    """
    if preset_key is None or preset_key == "other":
        return reason
    label = PRODUCER_REJECTION_PRESETS[preset_key]
    return f"{label} — {reason}" if reason else label


@router.get("/producers/rejection-presets", response_model=list[RejectionPresetOut])
def list_rejection_presets(
    user: User = Depends(require_admin),
) -> list[RejectionPresetOut] | list[dict[str, str]]:
    """MEH-226: the reject-modal's radio options. Serving them from the same
    dict the handler composes with is what keeps the admin UI from growing a
    second copy of the Hebrew labels."""
    return [
        {"key": key, "label": label}
        for key, label in PRODUCER_REJECTION_PRESETS.items()
    ]


@router.post("/producers/{producer_id}/reject", response_model=None)
def reject_producer(
    producer_id: UUID,
    background_tasks: BackgroundTasks,
    body: ProducerRejectIn = Body(default_factory=ProducerRejectIn),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    # MEH-226: validate BEFORE mutating — an unknown preset must not leave the
    # producer rejected with an empty reason. Mirrors request_producer_changes'
    # handler-side 400 (admin.py:829).
    preset_key = body.preset_key
    if preset_key is not None and preset_key not in PRODUCER_REJECTION_PRESETS:
        raise HTTPException(status_code=400, detail="סיבת דחייה לא מוכרת")
    reason = (body.reason or "").strip()
    if preset_key == "other" and not reason:
        raise HTTPException(
            status_code=400, detail="יש לפרט את סיבת הדחייה כשנבחר 'אחר'"
        )

    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    # MEH-2121: symmetric with approve. Rejecting a draft emails the owner that
    # her application was turned down for an application she never made — the
    # rejection mail and the `rejection_reason` banner both fire on a request
    # that does not exist. No override, same reasoning as approve.
    if producer.status == "draft":
        raise HTTPException(
            status_code=409,
            detail="אי אפשר לדחות עסק שטרם נשלח לבדיקה",
        )
    composed_reason = _compose_rejection_reason(preset_key, reason)
    # MEH-2498: rejecting a business that was live takes it off the site — its
    # live group buys are cancelled in the same commit, participants mailed.
    was_live = producer.status == "approved"
    if was_live:
        cancel_live_group_buys(db, producer, background_tasks)
    # MEH-2974: a rejection revokes an outstanding owner invite, for the same
    # reason a suspension does — a page rejected for cause and re-approved
    # within the link's week must not come back with the old link still live.
    # An accepted invite is left alone: the business has a real owner. Same
    # fields the suspension clears; the record that an invite was sent stays.
    if producer.owner_invite_token_hash and not producer.owner_invite_accepted_at:
        producer.owner_invite_token_hash = None  # type: ignore[assignment]
        producer.owner_invite_code_hash = None  # type: ignore[assignment]
        producer.owner_invite_code_expires_at = None  # type: ignore[assignment]
        producer.owner_invite_code_attempts = None  # type: ignore[assignment]
    producer.status = "rejected"  # type: ignore[assignment]
    # MEH-226: the reason is persisted in the SAME commit as the status flip —
    # before this it lived only in the email body, so a rejected owner saw
    # "נדחה" with no reason on her dashboard (the banner reads
    # producer_rejection_reason off GET /auth/me).
    producer.rejection_reason = composed_reason or None  # type: ignore[assignment]
    # MEH-2210: the preset key is the structured reason code. Same dict as the
    # composed text (PRODUCER_REJECTION_PRESETS, validated above), so there is
    # exactly one vocabulary; the owner dashboard branches its copy on it.
    # NULL when a legacy caller sent free text only.
    producer.rejection_reason_code = preset_key  # type: ignore[assignment]
    # MEH-1011: clear any request-changes trail on reject — a rejected producer
    # must not carry a stale "ממתין להשלמה" trail in ProducerAdminOut. Symmetric
    # with approve_producer's clearing.
    producer.requested_changes = None  # type: ignore[assignment]
    producer.changes_requested_at = None  # type: ignore[assignment]
    db.commit()
    if was_live:  # MEH-2852: the live page just went away.
        indexnow.schedule(background_tasks, indexnow.producer_urls(producer))

    # MEH-226: email fires post-commit only — a Resend failure must not roll
    # back a decision the admin already made.
    reason_text = _rejection_reason_suffix(composed_reason)
    producer_user = db.query(User).filter(User.producer_id == producer.id).first()
    # MEH-2952: a test business / test owner → nothing sent.
    p_test = bool(producer.is_test or (producer_user and producer_user.is_test))
    if producer_user:
        # MEH-2210: both parts carry the dashboard link — the resubmit CTA
        # lives there. Same link the changes-requested mail builds.
        dashboard_link = f"{settings.frontend_url}/producer/dashboard"
        _send_notification_email(
            producer_user.email,  # type: ignore[arg-type]
            f'מהמקור - עדכון לגבי העסק "{producer.name}"',
            _producer_rejected_body(producer.name, composed_reason, dashboard_link),  # type: ignore[arg-type]
            html=_producer_rejected_html(
                producer.name,  # type: ignore[arg-type]
                composed_reason,
                dashboard_link,
            ),
            test_cause=p_test,
        )

    # Notify admin via WhatsApp
    if settings.admin_whatsapp_to:
        _send_whatsapp(
            settings.admin_whatsapp_to,
            f'❌ העסק "{producer.name}" נדחה.{reason_text}',
            test_cause=p_test,
        )

    return {
        "detail": "Producer rejected",
        "id": str(producer.id),
        "status": producer.status,
        "rejection_reason": producer.rejection_reason,
    }


# MEH-1011: producer request-changes — non-terminal "please complete" path.
# Unlike reject_producer (terminal → status="rejected"), this KEEPS the
# producer pending and records the admin's feedback so the business can fix
# the gap (missing photo / license) and be approved.
@router.post("/producers/{producer_id}/request-changes", response_model=None)
def request_producer_changes(
    producer_id: UUID,
    body: RequestChangesIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Send a completion request to a pending producer. `feedback` is required
    (it becomes the body of the email to the producer) — empty/whitespace → 400,
    mirroring admin_recipes.py:123. Status stays "pending"; no rejection.
    """
    feedback = (body.feedback or "").strip()
    if not feedback:
        raise HTTPException(status_code=400, detail="feedback is required")

    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # MEH-1011: request-changes is a pending-only operation — it deliberately
    # leaves status unchanged, so applying it to an already-decided producer
    # (approved / rejected / inactive) would leave an incoherent record
    # (e.g. approved + non-null requested_changes, which the "ממתין להשלמה"
    # badge keys off). 409 mirrors toggle-status's invalid-transition guard
    # (MEH-769).
    #
    # MEH-2121 correction: this line used to end "reject_producer needs no such
    # guard — it transitions status." That was true before the draft state
    # existed, when every status was a coherent thing to reject. It is false
    # now — reject_producer carries its own `draft` 409 for exactly that reason.
    if producer.status != "pending":
        raise HTTPException(
            status_code=409,
            detail="ניתן לשלוח בקשת השלמה רק לבית עסק בהמתנה לאישור",
        )

    producer.requested_changes = feedback  # type: ignore[assignment]
    # tz-aware (MEH-762 D1, mirrors grant_verified) — the column is TIMESTAMPTZ.
    producer.changes_requested_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    # status intentionally unchanged — stays "pending".
    db.commit()

    p_name = producer.name
    # Env-aware link (mirrors auth_emails.py:159) — staging emails must point
    # at staging, not production. On prod frontend_url == mehamakor.online.
    dashboard_link = f"{settings.frontend_url}/producer/dashboard"

    producer_user = db.query(User).filter(User.producer_id == producer.id).first()
    # MEH-2952: a test business / test owner → nothing sent.
    p_test = bool(producer.is_test or (producer_user and producer_user.is_test))
    if producer_user:
        _send_notification_email(
            producer_user.email,  # type: ignore[arg-type]
            f'מהמקור — נשאר פרט אחד לפני האישור של "{p_name}"',
            _producer_changes_requested_body(p_name, feedback, dashboard_link),  # type: ignore[arg-type]
            test_cause=p_test,
        )

    # MEH-1051: WhatsApp mirror of the email above (producer_changes_requested_v1,
    # Meta-approved). Post-commit + fail-open — a Meta outage or missing phone
    # must never affect the 200; the function handles skip/raise internally.
    notify_producer_changes_requested(
        p_name,  # type: ignore[arg-type]
        producer.phone,  # type: ignore[arg-type]
        feedback,
        test_cause=p_test,
    )

    # Notify admin via WhatsApp
    if settings.admin_whatsapp_to:
        _send_whatsapp(
            settings.admin_whatsapp_to,
            f"📝 נשלחה בקשת השלמה ל-{p_name}",
            test_cause=p_test,
        )

    return {
        "detail": "בקשת השלמה נשלחה",
        "requested_changes": producer.requested_changes,
        "changes_requested_at": producer.changes_requested_at.isoformat(),
    }


# MEH-762 (ADR-022 public tier contract, Chunk 2): admin stamping for the
# tier-1 "מאומת" badge. The document review itself stays manual off-platform
# (VERIFICATION.md §2/§4) — these endpoints only record the OUTCOME in the DB.
# No auto-stamp on admin-create/import. The legacy is_verified column was
# DROPPED in MEH-766 ch6 (revision d4e7a92c81b5); verified_at is the only
# verification axis. The public verification_tier resolver + exposure landed
# in MEH-762 Chunk 3.
@router.post("/producers/{producer_id}/grant-verified", response_model=None)
def grant_verified(
    producer_id: UUID,
    body: GrantVerifiedIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Stamp the tier-1 verification result after the admin checks the
    qualifying document (license / exemption / cosmetics — VERIFICATION.md
    §2). Re-grant overwrites verified_at + verification_doc_type (the legit
    correction path alongside revoke-verified).
    # REUSES: admin_kashrut.py:75 — admin stamps a verification timestamp.
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    # MEH-2459: an organizer holds no license, exemption or cosmetics — there
    # is no qualifying document to verify, so the «מאומת» tier is never
    # grantable (ADR-036). 409, not 422: the request is well-formed, the row
    # is in a state that rules it out.
    if producer.kind == "organizer":
        raise HTTPException(
            status_code=409, detail="מארגן שווקים ואירועים לא מקבל תג מאומת"
        )
    # tz-aware (MEH-762 D1, mirrors MEH-759) — NOT naive utcnow; the column
    # is TIMESTAMPTZ. Public exposure is date-granularity only (Chunk 3).
    producer.verified_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    producer.verification_doc_type = body.doc_type  # type: ignore[assignment]
    db.commit()
    return {
        "detail": "תג מאומת הוענק",
        "verified_at": producer.verified_at.isoformat(),
        "verification_doc_type": producer.verification_doc_type,
    }


@router.post("/producers/{producer_id}/revoke-verified", response_model=None)
def revoke_verified(
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Clear the tier-1 "מאומת" stamp (mistake correction). Idempotent —
    clearing an already-unverified producer is a no-op success. (The legacy
    is_verified column was dropped in MEH-766 ch6.)
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    producer.verified_at = None  # type: ignore[assignment]
    producer.verification_doc_type = None  # type: ignore[assignment]
    db.commit()
    return {"detail": "תג מאומת הוסר"}


def _send_notification_email(
    to_email: str,
    subject: str,
    body: str,
    html: str | None = None,
    test_cause: bool = False,
) -> None:
    """MEH-2151: `html` is OPTIONAL and defaults to None.

    That default is what keeps the three pre-existing callers (rejected,
    changes-requested, and the approval site before this ticket) byte-identical
    on the wire: `send_email` only adds `params["html"]` when the argument is
    truthy (`services/email.py`), so an omitted argument produces the exact
    payload it produced before this parameter existed. Same shape, and same
    reasoning, as `reply_to` two parameters down in `send_email` (MEH-2112).
    """
    # MEH-2952: `test_cause` — the business the mail is about is a test row.
    send_email(to_email, subject, body, html=html, test_cause=test_cause)


def _send_whatsapp(to: str, body: str, test_cause: bool = False) -> None:
    """Send WhatsApp admin notification via Meta Cloud API.

    MEH-508: send_text is fail-open (False on missing config or HTTP error,
    no exception raised), so the previous try/except + configured-check
    collapse to a single call. Service-level logger emits the warning.

    MEH-2952: `test_cause` — the business the ping is about is a test row.
    """
    send_text(to, body, test_cause=test_cause)
