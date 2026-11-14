"""
Module:    producer_me_review
Purpose:   The steps that put an owner's page in front of an admin, under
           /producers/me: WhatsApp phone verification (OTP), the kashrut
           certificate request, the review-invite link, and submit-for-review.
Does NOT:  Decide the review outcome (routers/admin.py) or edit the profile
           fields themselves (routers/producer_me.py).
Split out of producer_me.py (MEH-3266); the code is moved verbatim.
"""

from datetime import datetime, timedelta, timezone
from typing import Any
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.auth import create_review_invite_token, require_producer
from app.config import settings
from app.constants import MAX_PRODUCER_RESUBMISSIONS
from app.database import engine, get_db
from app.rate_limit import limiter
from app.services.whatsapp import is_configured as whatsapp_is_configured
from app.services.whatsapp import send_template
from app.services.whatsapp_templates import OtpCodeV1
from app.utils.clock import utc_now
from app.models import Producer, User
import logging
import secrets
import string
from app.models.models import PhoneOtpToken, KashrutBadgeRequest
from app.schemas.schemas import (
    KashrutRequestCreate,
    KashrutRequestOut,
    OtpConfirmIn,
    ReviewInviteLinkOut,
)
from app.services.auth_notifications import notify_admin_new_producer
from app.services.submission_confirmation import send_submission_confirmation
from app.services.producer_risk import score_producer  # MEH-2602
from app.services.submission_gate import submission_missing_items
from app.services.trust_tier import VALID_BADGE_CODES
from app.routers.producer_me import (
    OTP_NOT_SENT,
    _test_cause,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/producers/me", tags=["producer-management"])


def _send_whatsapp_otp(phone: str, code: str, test_cause: bool = False) -> bool:
    """Send a 6-digit OTP via WhatsApp Cloud API (MEH-508, MEH-754).

    MEH-2122 B: a failed send where WhatsApp IS configured raises 503 — it
    used to answer «קוד נשלח» and the owner waited for nothing. Unconfigured
    (dev / CI) and test rows still return False quietly. The token stays live.

    MEH-754: switched from `send_text` (free-form) to the Meta
    AUTHENTICATION template `producer_otp_v1`. Free-form text is only
    delivered inside Meta's 24h customer-service window, so a brand-new
    producer who never messaged the business number never received the
    code. Templates are delivered unconditionally. send_template owns
    config / HTTP fail-open internally.

    MEH-2952: `test_cause` — a test business (or test owner) gets no
    WhatsApp. Independent of MEH-2231's OTP_TEST_* numbers, which are
    untouched: those decide the CODE, this decides whether anything is sent.
    """
    sent = send_template(phone, OtpCodeV1(code=code), test_cause=test_cause)
    if not sent and not test_cause and whatsapp_is_configured():
        raise HTTPException(status_code=503, detail=OTP_NOT_SENT)
    return sent


_LOCAL_DB_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def _otp_test_mode_allowed(db_host: str, railway_env: str, app_env: str) -> bool:
    """MEH-2231 — may this environment honour the OTP test numbers at all?

    # REUSES: backend/scripts/seed_demo_producers.py:646 — prod-refusal shape
    Same three-way shape as `_assert_not_production`: a local DB host is
    always allowed (dev / CI / tests); a remote host only when
    RAILWAY_ENVIRONMENT == "staging"; anything else is refused. On top of
    that shape, `ENV=production` refuses FIRST and unconditionally — the seed
    script has no such flag to read, this app does (config.py `env`), and a
    production service pointed at a local-looking host by mistake must still
    never hand out a fixed code. Pure function so the refusal is testable
    without faking an engine.

    TCP hosts only, by design: a Unix-socket DB URL has `engine.url.host` of
    None, the caller passes "", and the feature stays OFF — dark, with no
    log line. That is the safe direction for a test-only bypass (the
    reviewer on PR #3393 asked for a third escape hatch; declined — every
    added way to say "allowed" is a way to say it by mistake). Local
    Postgres over TCP, as tests/conftest.py and CI use, is unaffected.
    """
    if app_env.strip().lower() == "production":
        return False
    host = db_host.strip().lower()
    if not host:
        # No host (Unix-socket URL) → OFF, as the docstring promises. Without
        # this line "" fell through to the Railway check and a staging
        # service on a socket would have been allowed (reviewer, PR #3393).
        return False
    if host in _LOCAL_DB_HOSTS:
        return True
    return railway_env.strip().lower() == "staging"


def _otp_test_code_for(phone: str) -> str | None:
    """MEH-2231 — the fixed code for a TEST phone number, or None.

    None means "take the normal path": the number is not on the allow-list,
    the config is empty or malformed (a code that is not exactly 6 digits
    turns the whole feature off rather than half-on), or the environment
    refuses. The caller treats None as byte-identical to today's behaviour.
    # DO NOT widen the phone match (prefix, normalisation, wildcard) — an
    #        exact string on `producer.phone` is the only shape that cannot
    #        accidentally cover a real customer's number.
    """
    numbers = {n.strip() for n in settings.otp_test_numbers.split(",") if n.strip()}
    code = settings.otp_test_code.strip()
    if not numbers or len(code) != 6 or not code.isdigit():
        return None
    if phone not in numbers:
        return None
    if not _otp_test_mode_allowed(
        engine.url.host or "",
        settings.railway_environment,
        settings.env,
    ):
        return None
    return code


@router.post("/verify-phone", status_code=200, response_model=None)
@limiter.limit("3/10minute")
def send_phone_otp(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    if not producer.phone:
        raise HTTPException(status_code=400, detail="לא נמצא מספר טלפון בפרופיל")
    if producer.phone_verified:
        return {"detail": "הטלפון כבר מאומת"}

    # MEH-2231: a TEST number gets the fixed code and NO WhatsApp send; every
    # other number takes exactly the path it took before this line existed.
    test_code = _otp_test_code_for(producer.phone)  # type: ignore[arg-type]
    code = test_code or "".join(secrets.choice(string.digits) for _ in range(6))
    expires = utc_now() + timedelta(minutes=10)

    # Invalidate any previous unused tokens for this producer
    db.query(PhoneOtpToken).filter(
        PhoneOtpToken.producer_id == producer.id,
        PhoneOtpToken.used.is_(False),
    ).update({"used": True})

    db.add(
        PhoneOtpToken(
            producer_id=producer.id,
            phone=producer.phone,
            code=code,
            expires_at=expires,
        )
    )
    db.commit()

    if test_code is None:
        _send_whatsapp_otp(
            producer.phone,  # type: ignore[arg-type]
            code,
            test_cause=bool(producer.is_test or user.is_test),  # MEH-2952
        )
    else:
        # MEH-2231: a fixed code is a bypass event. WARNING so it is filterable
        # in Railway logs and an audit can tell a test run from a real one
        # (reviewer, PR #3393). Producer id only — never the phone or the code.
        log.warning(
            "OTP test mode: fixed code issued, WhatsApp suppressed (producer_id=%s)",
            producer.id,
        )
    return {"detail": "קוד נשלח"}


@router.post("/verify-phone/confirm", status_code=200, response_model=None)
@limiter.limit("3/minute")
def confirm_phone_otp(
    request: Request,
    body: OtpConfirmIn,
    # MEH-2125: `background_tasks` is gone from this signature — the removed
    # `_maybe_fire_review_ready` call was its only consumer. FastAPI injects it
    # per-handler, so dropping it affects nothing else.
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    if producer.phone_verified:
        return {"detail": "הטלפון כבר מאומת"}

    # MEH-1820: claim the token with a CONDITIONAL UPDATE, not SELECT-then-set.
    # The previous form read `used == False` and assigned `used = True` as two
    # statements, so under READ COMMITTED (Postgres' default) two overlapping
    # confirms could both find the same token before either committed — and
    # both would then run the status transition that lived below (removed in
    # MEH-2124) and fire the "ready for review" admin ping (removed in
    # MEH-2125). Damage was noise, not data: a duplicate admin notification.
    #
    # `.update()` returns the affected-row count, and that count IS the lock:
    # the second request blocks on the first's row lock, re-evaluates the
    # WHERE against the committed row, finds `used` already true, and matches
    # zero rows. Exactly one caller can win, per token.
    #
    # Chose the conditional UPDATE over `SELECT … FOR UPDATE` (the card's
    # option (a)) for two reasons: it is one statement rather than a
    # lock-then-mutate pair, so there is no window between them to reason
    # about; and `with_for_update()` is a silent no-op on backends that ignore
    # it, which would make the guard disappear without any test going red —
    # the failure mode this repo keeps getting caught by.
    #
    # NOT a reason, and stated here because the first draft of this comment
    # claimed it was: the two forms hold the row lock for exactly the same
    # span. A Postgres row-level write lock lives until the TRANSACTION ends,
    # not until the statement returns, so the row lock taken here is held
    # right up to `db.commit()`. Anything slow added between here and that
    # commit widens the window in which a concurrent confirm for the same
    # token blocks. (It used to name `_pending_and_approvable` and the status
    # flip as what sat in that span; both are gone — MEH-2124, MEH-2125.)
    #
    # The loser gets the SAME 400 as a wrong or expired code. That is
    # deliberate: from the caller's side a lost race and a stale code are the
    # same event — this token is no longer usable — and inventing a new status
    # or Hebrew string would leak concurrency internals into the API surface.
    claimed = (
        db.query(PhoneOtpToken)
        .filter(
            PhoneOtpToken.producer_id == producer.id,
            PhoneOtpToken.code == body.code,
            PhoneOtpToken.used.is_(False),
            PhoneOtpToken.expires_at > utc_now(),
        )
        .update({PhoneOtpToken.used: True}, synchronize_session=False)
    )
    if not claimed:
        raise HTTPException(status_code=400, detail="קוד שגוי או פג תוקף")

    # MEH-2125: this handler is now a pure `phone_verified` writer, and three
    # things were removed from between the claim above and the commit below —
    # the MEH-2051 advisory lock + its `db.expire`, the MEH-1816 `was_approvable`
    # snapshot, and the `_maybe_fire_review_ready` call. All three were
    # MEASURED unreachable, not judged so: `_pending_and_approvable` (:293)
    # reads status/photos/licence and never `phone_verified`, so once MEH-2124
    # deleted the status flip the snapshot and the post-commit re-read
    # evaluated the same predicate over an unchanged row and the ping's
    # `not X and X` was False for every input. The concurrency test reported
    # `fired 0 times` before its assertion was touched.
    #
    # `_pending_and_approvable`, `_lock_producer_updates` and
    # `_maybe_fire_review_ready` all REMAIN — PUT /producers/me is the live
    # caller of each, and that path still produces a genuine false→true edge.
    # What went is only this handler's use of them.
    #
    # MEH-1820's guard is unaffected in substance but its SEAM moved: the
    # barrier in tests/test_otp_confirm_concurrency.py used to be planted on
    # `_pending_and_approvable` because that was the one call between the claim
    # and the commit. There is no such call now, so the test instruments the
    # request session's `commit` instead. If you add anything here that a rival
    # confirm can reach, re-read that test's docstring first.
    producer.phone_verified = True  # type: ignore[assignment]
    db.commit()
    return {"detail": "הטלפון אומת בהצלחה"}


# ---------------------------------------------------------------------------
# MEH-51: Kashrut badge requests
# ---------------------------------------------------------------------------


@router.post("/kashrut-request", response_model=KashrutRequestOut, status_code=201)
@limiter.limit("10/hour")
def request_kashrut_badge(
    request: Request,
    body: KashrutRequestCreate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> KashrutRequestOut:
    if body.badge_code not in VALID_BADGE_CODES:
        raise HTTPException(
            status_code=400,
            # MEH-1943 chunk 2: the allowed set moves to params, never the message.
            detail={
                "code": "invalid_badge_code",
                "message": "קוד תג לא תקין",
                "params": {"allowed": sorted(VALID_BADGE_CODES)},
            },
        )
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    existing = (
        db.query(KashrutBadgeRequest)
        .filter(
            KashrutBadgeRequest.producer_id == producer.id,
            KashrutBadgeRequest.badge_code == body.badge_code,
            KashrutBadgeRequest.status == "pending",
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="בקשה לbadge זה כבר ממתינה לאישור")

    req = KashrutBadgeRequest(
        producer_id=producer.id,
        badge_code=body.badge_code,
        cert_url=body.cert_url,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    out = KashrutRequestOut.model_validate(req)
    out.producer_name = producer.name  # type: ignore[assignment]
    return out


@router.get("/kashrut-requests", response_model=list[KashrutRequestOut])
@limiter.limit("30/minute")
def list_kashrut_requests(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> list[KashrutRequestOut] | list[KashrutBadgeRequest]:
    """MEH-1167: the logged-in producer's own kashrut badge requests,
    newest first — feeds the dashboard KashrutCard status zone so a
    pending/rejected request is visible after submit. Owner-isolated by
    producer_id (require_producer guarantees one); no schema change —
    KashrutRequestOut already exists (MEH-51)."""
    rows = (
        db.query(KashrutBadgeRequest)
        .filter(KashrutBadgeRequest.producer_id == user.producer_id)
        .order_by(KashrutBadgeRequest.created_at.desc())
        .all()
    )
    return rows


# ---------------------------------------------------------------------------
# MEH-1428 chunk 1: "request a review" — a signed link the owner shares with
# a customer. Presenting its `rt` token on POST /producers/{id}/reviews
# satisfies the contact-click gate (reviews.py guard 3).
# ---------------------------------------------------------------------------


@router.get("/review-link", response_model=ReviewInviteLinkOut)
@limiter.limit("30/minute")
def get_review_invite_link(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> ReviewInviteLinkOut:
    """The owner's shareable "request a review" URL.

    Approved producers only: the public page the link opens exists only once
    the business is live, and a pending/draft business has no customers to
    ask yet. The token is a 30-day HS256 JWT bound to THIS producer (auth.py
    create_review_invite_token) — not single-use, so one link serves every
    customer the owner sends it to; a fresh call re-mints it, which is how a
    link is "renewed" after expiry. No DB write.

    URL shape: `{frontend_url}/p/{slug}?rt=<token>` when the business has a
    custom slug, else `{frontend_url}/producer/{id}?rt=<token>` — both are
    the live public routes (frontend/app/[locale]/p/[slug], .../producer/[id]).
    """
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    if producer.status != "approved":
        raise HTTPException(
            status_code=403,
            detail="קישור לבקשת ביקורת זמין רק לעסק מאושר",
        )
    base = settings.frontend_url.rstrip("/")
    path = f"/p/{producer.slug}" if producer.slug else f"/producer/{producer.id}"
    token = create_review_invite_token(producer.id)  # type: ignore[arg-type]
    return ReviewInviteLinkOut(url=f"{base}{path}?rt={token}")


# ---------------------------------------------------------------------------
# MEH-1236: resubmit-for-review — the owner signals she finished completing
# the details an admin requested, so the admin knows to look again.
# ---------------------------------------------------------------------------


@router.post("/request-review", status_code=200, response_model=None)
@limiter.limit("3/hour")
def request_producer_review(
    request: Request,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Producer-initiated "I'm done — please re-check" ping (MEH-1236).

    Notification-only: NO schema change. The `requested_changes` /
    `changes_requested_at` columns are deliberately left untouched (they are
    admin-owned; only approve/reject/request-changes in admin.py write them) —
    this closes the resubmit loop without inventing a "resubmitted" DB state.

    Pending-only: mirrors admin.request_producer_changes:599 — a re-review
    request only makes sense while the producer is still in the approval queue,
    so an already-decided producer (approved/rejected/inactive) → 409.

    MEH-2120 — THE COMPLETENESS GATE, added after Sapir hit this live. This
    endpoint predates the shared gate, so it pinged the admin regardless of
    whether the profile could be approved at all: her test business, with no
    photo and no product, pressed "סיימתי להשלים" and was told "נשלח לבדיקה".
    The admin then gets "please look again" on a profile the MEH-799 photo gate
    will refuse — exactly the queue noise MEH-2100 removed from the FRONT door,
    arriving through the side one.

    The gate below is a verbatim copy of `submit_for_review`'s, in this same
    file: same helper, same 422 status, same `code`, same message, same
    `params.missing`. That sameness is the feature, not laziness — the client
    renders both through one path (`detailToMessage`, frontend/lib/errors.js:151)
    and the checklist highlights `params.missing` without knowing which door
    the owner used. A variant here would be a second definition of "ready".

    The admin notification fires as a BackgroundTask, fail-open (MEH-1051 /
    MEH-977): a Meta/Resend outage or missing admin config must never affect
    the 200 the owner sees.
    """
    # MEH-2210 follow-up (CI reviewer on #3343): the cap check and the
    # `resubmission_count + 1` write are two ORM steps; two concurrent requests
    # from the same owner at count=2 both read 2 and both write 3, and the
    # business gets a 4th lifetime resubmission. FOR UPDATE serialises them on
    # the producer row for the length of this request (released at commit).
    producer = (
        db.query(Producer)
        .filter(Producer.id == user.producer_id)
        .with_for_update()
        .first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    # MEH-2210: `rejected` is the second admitted status — the resubmit loop.
    # Fail-closed (MEH-1587 pattern): explicit membership, every other status
    # (draft / approved / inactive / anything unknown) stays 409.
    resubmitting = producer.status == "rejected"
    if producer.status != "pending" and not resubmitting:
        raise HTTPException(
            status_code=409,
            detail="ניתן לשלוח לבדיקה חוזרת רק כשבית העסק בהמתנה לאישור",
        )
    # MEH-2210: the cap is checked BEFORE the completeness gate — a business
    # that has used its three resubmissions is told so, not handed a list of
    # things to fix for a submission it cannot make.
    if resubmitting and producer.resubmission_count >= MAX_PRODUCER_RESUBMISSIONS:
        raise HTTPException(
            status_code=409,
            detail="הגעתן למספר השליחות המקסימלי — צרו איתנו קשר",
        )

    # MEH-2120: ordered AFTER the status check, matching submit_for_review — an
    # approved business asking for re-review is answered "you are already
    # decided" (409), not handed a completeness list it has no use for.
    missing = submission_missing_items(producer)
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "submit_gate_incomplete",
                "message": "עוד לא הכול מוכן — יש להשלים את פריטי החובה לפני שליחה לבדיקה",
                "params": {"missing": missing},
            },
        )

    # REUSES: app/services/auth_notifications.py notify_admin_new_recipe pattern
    # (admin WhatsApp + email, fail-open). Lazy import mirrors the fire_alerts
    # style already used in this file.
    from app.services.auth_notifications import notify_admin_producer_resubmit

    if resubmitting:
        # MEH-2210: rejected → pending. The gate above already answered the
        # unverified-phone case with 422 (`missing=["phone_verified"]`), so the
        # target is always `pending` — `pending_whatsapp` was removed in
        # MEH-2124 and is not revived here (Phase 0 on the card, 03/09).
        # `rejection_reason` + `rejection_reason_code` are KEPT: they are the
        # admin's history and the queue shows "the prior reason" next to the
        # "שליחה חוזרת #n" badge. Only approve clears them.
        # Captured BEFORE the commit: the commit expires the ORM row, and every
        # later attribute read would be a lazy reload round-trip (CI reviewer
        # on #3333). The literals below are what was just written.
        new_count = producer.resubmission_count + 1
        producer_name = producer.name
        producer_city = producer.city
        producer_is_test = _test_cause(producer, user)  # MEH-2952
        producer.status = "pending"  # type: ignore[assignment]
        producer.resubmission_count = new_count  # type: ignore[assignment]
        producer.resubmitted_at = datetime.now(timezone.utc)  # type: ignore[assignment]
        db.commit()
        background_tasks.add_task(
            notify_admin_producer_resubmit,
            producer_name,  # type: ignore[arg-type]
            producer_city,  # type: ignore[arg-type]
            resubmission_count=new_count,  # type: ignore[arg-type]
            test_cause=producer_is_test,
        )
        return {
            "detail": "נשלח לבדיקה חוזרת",
            "status": "pending",
            "resubmission_count": new_count,
        }

    background_tasks.add_task(
        notify_admin_producer_resubmit,
        producer.name,  # type: ignore[arg-type]
        producer.city,  # type: ignore[arg-type]
        test_cause=_test_cause(producer, user),  # MEH-2952
    )
    return {"detail": "נשלח לבדיקה חוזרת"}


# ---------------------------------------------------------------------------
# MEH-2100: draft → submit for review
# ---------------------------------------------------------------------------


@router.post("/submit-for-review", status_code=200, response_model=None)
@limiter.limit("5/hour")
def submit_for_review(
    request: Request,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """The owner declares her profile ready and hands it to the admin queue.

    This is the ONLY transition out of `draft` (MEH-2100). All three producer
    creation sites now write `draft`, so before this call the business is
    invisible to the review queue by construction — and the "בסקירה" banner
    plus the 3-business-day SLA both start HERE rather than at signup, which
    is the whole point of the ticket.

    Draft-only, mirroring the MEH-1236 request-review 409 directly above: a
    business already `pending` is in the queue (nothing to do), and one that
    is approved / rejected / inactive has been decided. A silent 200 on those
    would tell the owner something happened when nothing did.

    The gate is SERVER-SIDE and reads the SAME helper the dashboard checklist
    and the MEH-1818 nudge read (`submission_missing_items`), so the three can
    never drift into different definitions of "ready". A client that ignores
    the disabled CTA still gets 422 — the button state is an affordance, not
    the rule.

    The 422 body uses the MEH-1943 `{code, message, params}` shape, which buys
    two things at once: `detailToMessage` (frontend/lib/errors.js:151) renders
    `message` with no client change, and `params.missing` carries the
    machine-readable codes the checklist highlights.

    NOT gated here, deliberately: the producer LICENSE (MEH-971's
    license_pending path must still be able to reach the queue with a NULL
    license — it is an approve-time question) and OPENING HOURS (recommended,
    not required — Google precedent). Both remain enforced where they belong;
    see submission_gate.py's "Does NOT" header.
    """
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    if producer.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="אפשר לשלוח לבדיקה רק בית עסק שנמצא בטיוטה",
        )

    missing = submission_missing_items(producer)
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "submit_gate_incomplete",
                "message": "עוד לא הכול מוכן — יש להשלים את פריטי החובה לפני שליחה לבדיקה",
                "params": {"missing": missing},
            },
        )

    producer.status = "pending"  # type: ignore[assignment]
    # tz-aware — the column is DateTime(timezone=True) and a naive utcnow here
    # would be silently wrong by the local offset (repo-wide constraint).
    producer.submitted_for_review_at = datetime.now(timezone.utc)  # type: ignore[assignment]

    # Snapshot BEFORE the commit, matching auth.py's two registration paths.
    # Reading producer.name/.city after commit() works — the attributes are
    # expired and lazily reloaded through the still-open request session — but
    # it reads as a different pattern from its siblings for no reason, and the
    # next person comparing them has to work out which one is deliberate.
    # (CI reviewer, #2979.) Same values either way; this is legibility, not a
    # bug fix.
    p_name = producer.name
    p_city = producer.city
    p_id = producer.id  # MEH-2602: captured pre-commit, like p_name/p_city
    # MEH-2112: the owner's confirmation needs her address and the stamp that
    # was just written. Snapshotted here with the two above, for the same
    # reason — post-commit these attributes are expired and lazily reloaded,
    # which works but reads as a different pattern from its siblings.
    owner_email = user.email
    submitted_at = producer.submitted_for_review_at
    # MEH-2952: a test business / test owner → the admin ping and the owner's
    # confirmation are both dropped and logged.
    p_test = bool(producer.is_test or user.is_test)
    db.commit()

    # notify_admin_new_producer lives in services/auth_notifications.py. It
    # used to ALSO fire from auth.py at registration; MEH-2100 removed it from
    # there, because a fresh registration is a draft and the ping's own
    # "לאישור: /admin" link pointed at a queue the business was not in. This
    # is now its ONLY caller — the moment the ping is actually actionable.
    # (The comment here previously cited auth.py:632, which the same diff had
    # already deleted — a REUSES pointer to code that no longer exists. CI
    # reviewer, #2979.)
    # Post-commit BackgroundTask, fail-open (MEH-1051 / MEH-977):
    # a Resend/Meta outage must never turn the owner's successful submission
    # into an error, and post-commit placement mirrors _maybe_fire_review_ready
    # so the admin is never pinged about a transition that failed to persist.
    background_tasks.add_task(
        notify_admin_new_producer,
        p_name,  # type: ignore[arg-type]
        p_city,  # type: ignore[arg-type]
        test_cause=p_test,
    )
    # MEH-2602: re-score now. The only score was taken at registration, before
    # the owner filled contact_email / description, so the admin reviewing the
    # finished profile read «אין מייל» about a profile that had one (staging
    # sweep 29/10). Fail-open, same background-task contract as at signup.
    background_tasks.add_task(score_producer, p_id)  # type: ignore[arg-type]
    # MEH-2112: the owner-facing half of the same moment. Post-commit and
    # fail-open on the identical grounds as the admin ping above — she has
    # already been told on screen that the profile was sent, and a Resend
    # outage must not retract that.
    #
    # Placed AFTER the 409/422 raises above, which is what keeps the promise
    # honest: this fires only on the real draft→pending transition, never on a
    # rejected re-submit and never on MEH-1236's request-review ping (a
    # different endpoint entirely, untouched).
    background_tasks.add_task(
        send_submission_confirmation,
        owner_email,  # type: ignore[arg-type]
        p_name,  # type: ignore[arg-type]
        submitted_at,  # type: ignore[arg-type]
        test_cause=p_test,
    )
    return {"detail": "הפרופיל נשלח לבדיקה"}
