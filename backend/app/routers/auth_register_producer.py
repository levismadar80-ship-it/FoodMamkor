"""
Module:    routers/auth_register_producer
Purpose:   The two routes that create a business account:
           POST /auth/register/producer (email and password, or an upgrade
           of a signed-in consumer) and POST /auth/register/producer/oauth
           (Google or Apple).
Does NOT:  Log anyone in, refresh a token or reset a password: those stay
           in routers/auth.py, which also owns the cookie helpers this
           module imports.
Split out of routers/auth.py (MEH-3293); the two functions are moved
verbatim. Tests that replace a mail sender or a token verifier for these
two routes patch THIS module, because that is where the names resolve.
"""

from typing import Any, cast
import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
)
from sqlalchemy.orm import Session
from app.auth import (
    create_access_token,
    generate_fingerprint,
    get_current_user_optional,
    hash_fingerprint,
    hash_password,
)
from app.config import settings
from app.services.auth_emails import (
    send_duplicate_attempt_email as _send_duplicate_attempt_email,
    send_verify_email as _send_verify_email,
    send_welcome_email as _send_welcome_email,
)
from app.services.auth_notifications import (
    notify_producer_registered,
)
from app.services.verify_session import set_signup_marker
from app.services.producer_risk import score_producer
from app.services.oauth_verifiers import (
    # Same underscore aliases as routers/auth.py, so the moved code is
    # byte-identical. Tests that patch these for the two business-signup
    # routes patch THIS module (MEH-3293).
    upload_google_avatar_or_none as _upload_google_avatar_or_none,
    verify_apple_token as _verify_apple_token,
    verify_google_token as _verify_google_token,
)
from app.constants import DECLARATION_VERSION, TERMS_VERSION
from app.services.license_validation import ensure_license_for_categories
from app.services.producer_queries import (
    create_primary_branch_location,
    persist_registration_delivery_areas,
)
from app.services.password_policy import validate_password
from app.database import get_db
from app.models import Category, Producer, ProducerCategory, User
from app.services.farmer_declaration import farmer_declaration_stamp
from app.rate_limit import email_from_body, limiter
from app.schemas.schemas import (
    DeliveryAreaCreate,
    ProducerOAuthSignupRequest,
    ProducerOAuthSignupResponse,
    ProducerRegister,
    ProducerRegistrationResponse,
    RegisterAck,
)
from app.utils.clock import utc_now
from app.routers.auth import (
    _REGISTER_ACK_DETAIL,
    _set_fingerprint_cookie,
    _set_refresh_cookie,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# MEH-328 Chunk B: response_model intentionally omitted. The non-upgrade
# path returns RegisterAck (OWASP anti-enumeration); the upgrade path
# returns ProducerRegistrationResponse (token + whatsapp_sent). FastAPI's
# decorator-level response_model is single-shape and would strip fields
# from one of the two — we let Pydantic serialise each return as-is.
@router.post("/register/producer", response_model=None)
# MEH-624: dual-key throttling. Per-IP cap + per-email cap stops a botnet
# rotating IPs from spamming the OWASP duplicate-attempt email at one victim.
#
# MEH-1635: the per-IP half moved 3/hour -> 10/hour. It was never the
# anti-spam primitive — the per-email cap below is, and it is UNCHANGED.
# Keying registration abuse on IP punishes the wrong people, and three
# separate effects stack against a single legitimate producer:
#
#   1. Shared IPs. CGNAT (most Israeli mobile carriers), office NAT, and
#      a co-working space all present one IP. Three women registering
#      their businesses from the same cafe wifi exhausted the hour.
#   2. Refresh-retry double-count (MEH-1627). slowapi's middleware runs
#      BEFORE dependencies, so a request rejected at the auth layer has
#      already burned its unit: an expired token costs 2 units for one
#      submit (401 -> refresh -> replay), halving the real allowance.
#   3. Resubmit after a 422 (MEH-1623 producer_name validation). Every
#      corrected resubmit is another unit, and a 422 is exactly the case
#      where a user retries immediately.
#
# 3/hour could therefore be spent without a single successful
# registration. 10/hour keeps a per-IP ceiling on automated floods while
# leaving room for the shared-IP + retry case.
#
# DO NOT copy this widening to the other 3/hour limits: auth.py:1270
# (resend-verify, sends email) and auth.py:1289 (DELETE /me, irreversible)
# are authenticated and deliberately stay tight — they are not shared-IP
# bound and were not in MEH-1635's scope.
#
# Upgrade path trade-off (acknowledged, not blocking): authenticated
# producer upgrades send email=None in the payload, so they all share
# the empty-string per-email bucket. A botnet cannot abuse this pool
# because the upgrade path requires a valid JWT — anonymous traffic
# falls into the new-registration branch where ProducerRegister schema
# validation REQUIRES email and the per-email key is meaningful.
# JWT-gate makes the empty bucket uninteresting to attackers.
# REUSES: backend/app/routers/auth.py:972-973 — same dual-key shape.
@limiter.limit("10/hour")  # SECURITY FIX #2; widened by MEH-1635
@limiter.limit("5/15 minutes", key_func=email_from_body)
async def register_producer(
    request: Request,
    response: Response,
    data: ProducerRegister,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: "User | None" = Depends(get_current_user_optional),
) -> dict[str, Any] | ProducerRegistrationResponse | RegisterAck:
    # MEH-143: two paths — upgrade (logged-in) vs new registration (anonymous).
    # MEH-328 Chunk B: the non-upgrade path is now OWASP anti-enumeration —
    # identical RegisterAck across new-email / password-collision / oauth-
    # collision. Upgrade path is unchanged (authenticated, no enumeration risk).
    upgrade_path = current_user is not None

    # MEH-17: validate primary contact method has its required field filled.
    # These are 422 input-validation guards on body content alone — they
    # cannot leak email existence (an attacker probing the endpoint sees
    # the same 422 regardless of whether the email is registered).
    method = (data.primary_contact_method or "whatsapp").strip().lower()
    # MEH-296 3d: align with the 7-value ProducerRegister schema guard.
    if method not in {
        "whatsapp",
        "phone",
        "instagram",
        "email",
        "website",
        "facebook",
        "external_order",
    }:
        raise HTTPException(status_code=422, detail="אמצעי קשר לא נתמך")
    if method in {"whatsapp", "phone"} and not (data.phone or "").strip():
        raise HTTPException(
            status_code=422,
            detail="חובה להזין טלפון עבור אמצעי הקשר הנבחר",
        )
    if method == "website" and not (data.website or "").strip():
        raise HTTPException(
            status_code=422,
            detail="חובה להזין כתובת אתר עבור אמצעי הקשר הנבחר",
        )
    # MEH-296 3d: instagram has a ProducerRegister field → presence-check it.
    # facebook/external_order have NO ProducerRegister field (the producer
    # sets those later via the dashboard editor), so they pass without a
    # presence check rather than 422-ing a value the form can't collect.
    if method == "instagram" and not (data.instagram or "").strip():
        raise HTTPException(
            status_code=422,
            detail="חובה להזין אינסטגרם עבור אמצעי הקשר הנבחר",
        )
    if method == "email" and not (data.contact_email or "").strip():
        raise HTTPException(
            status_code=422,
            detail="חובה להזין אימייל ליצירת קשר עבור אמצעי הקשר הנבחר",
        )

    # MEH-759 (ADR-022 gate 2): the binding licensing declaration is
    # mandatory on both paths (new registration + MEH-143 upgrade). 422 is
    # body-shape validation — it runs before the enumeration branch and is
    # identical regardless of email existence, so it leaks nothing (same
    # class as the contact-method guards above). Producer rows below are
    # therefore only ever created with declared_at/declaration_version
    # stamped.
    if not data.declaration_accepted:
        raise HTTPException(
            status_code=422,
            detail="יש לאשר את הצהרת הרישוי כדי להמשיך",
        )

    # MEH-530: 422s with Hebrew copy if any selected category requires a
    # license and the body didn't supply one. Same input-validation
    # classification as the contact-method checks above.
    # MEH-971 chunk 2: license_pending opt-in skips this data-quality 422 so the
    # producer lands in the pending queue with NULL license. SINGLE shared gate
    # (above the upgrade/non-upgrade split) → covers both paths. NOT a security
    # relaxation — licensed-only is enforced downstream: chunk-4 approval guard
    # (admin.py) blocks approving a license-required producer with NULL license,
    # and publication requires status=="approved" (producer_listing.py). A
    # malicious license_pending=true only parks the actor in the unpublishable
    # pending queue.
    if not data.license_pending:
        ensure_license_for_categories(
            db, data.category_ids, data.producer_license_number
        )

    # MEH-2923: the grower declaration is checked HERE (after the license check, so
    # that 422 keeps its priority), not only by the client
    # gate, and recorded on its own columns (services/farmer_declaration.py).
    farmer_stamp = farmer_declaration_stamp(
        db, data.category_ids, data.farmer_declaration_accepted
    )

    if upgrade_path:
        # ---- UPGRADE PATH (UNCHANGED in MEH-328) -----------------------
        # Authenticated user upgrading to producer. No enumeration vector —
        # the caller already proved control of the account. Still returns
        # a token + whatsapp_sent so the dashboard flow keeps working.
        # MEH-2322: lock and re-read the account row before the checks below —
        # the same pattern as producer_claim.claim_producer. `current_user` was
        # read before any lock, so this path and an owner-claim (or a second
        # register) racing on one account would both see producer_id=None and
        # the later commit would overwrite the earlier link, leaving one
        # business owned by nobody. Lock order user → producer, as in the claim
        # route, so the two cannot deadlock.
        # DO NOT drop populate_existing() — without it the identity-mapped
        # `current_user` comes back with its stale attributes.
        user = (
            db.query(User)
            .filter(User.id == cast(User, current_user).id)  # upgrade_path ⇒ not None
            .with_for_update()
            .populate_existing()
            .first()
        )
        if user is None:  # deleted between authentication and the lock
            raise HTTPException(status_code=401, detail="משתמש לא נמצא")
        # MEH-669: admin accounts must never self-upgrade to producer.
        # Without this guard, line `user.role = "producer"` below silently
        # demotes the admin and locks them out of /admin (vertical privilege
        # loss — OWASP A01 Broken Access Control). Separation-of-duties:
        # admins use a dedicated account, never their daily-work account.
        if user.role == "admin":
            raise HTTPException(
                status_code=403,
                detail="מנהלת מערכת לא יכולה להירשם כבית עסק. אנא צרי חשבון נפרד עם כתובת אימייל אחרת.",
            )
        # Check both: producer_id (current link) and is_producer (durable flag).
        # is_producer stays True even if an admin manually clears producer_id,
        # preventing silent re-registration without an explicit admin reset.
        if user.producer_id or user.is_producer:
            raise HTTPException(status_code=409, detail="כבר יש לך עסק רשום בחשבון זה")

        producer = Producer(
            name=data.producer_name,
            description=data.description,
            short_description=data.short_description,
            city=data.city,
            address=data.address,
            lat=data.lat,
            lng=data.lng,
            phone=data.phone,
            instagram=data.instagram,
            website=data.website,
            primary_contact_method=method,
            contact_email=data.contact_email,
            producer_license_number=data.producer_license_number,
            # MEH-1471: self-reported attribution captured at the final
            # registration step. Schema-validated (allowed-key set / bleach);
            # persisted verbatim. NULL when the field is absent (upgrade path).
            referral_source=data.referral_source,
            referral_source_other=data.referral_source_other,
            # MEH-759 (ADR-022 gate 2): stamp the binding declaration. Guard
            # above guarantees declaration_accepted is True here.
            declared_at=datetime.now(timezone.utc),
            declaration_version=DECLARATION_VERSION,
            **farmer_stamp,  # MEH-2923: grower declaration, its own record
            # MEH-2100: registration creates a DRAFT, not a queue entry. The
            # business is invisible to the admin review queue until the owner
            # presses "שליחה לבדיקה" (POST /producers/me/submit-for-review),
            # which is also where the 3-business-day SLA starts.
            #
            # This is the UPGRADE branch, and it is the one every OAuth signup
            # lands on, so it is one of THREE creation sites that had to move
            # together — the others are the new-email branch below and
            # producer_queries.create_producer_with_relations (POST /producers).
            # Any site left writing a queue status would be a hole straight
            # past the submit gate.
            #
            # The queue status this branch used to write, `pending_whatsapp`,
            # was kept alive through the Expand phase (ADR-007) and then
            # removed in MEH-2124 — the Contract phase — once it was confirmed
            # that no row had ever held it.
            status="draft",
            # MEH-1838 chunk A: delivery shape, previously never captured at
            # registration — every producer landed on the column defaults
            # (physical-only) regardless of what the business actually is.
            # delivery_cities is deliberately NOT written here — Phase 0 found
            # MEH-903 A already retired that flat column (admin.py:427-429,
            # :486-489 pop it out on both create and update); producer_listing.py
            # :258's delivery-city match reads delivery_areas rows exclusively.
            # The city list is instead folded into the delivery_areas write
            # below, the same live mechanism admin.py/producer_me.py's own
            # _apply_delivery_cities use for a flat city list.
            # MEH-2460: organizer vs business (ADR-036); the schema already
            # normalised an organizer's location/license fields.
            kind=data.kind,
            has_physical_location=data.has_physical_location,
            offers_delivery=data.offers_delivery,
            delivery_nationwide=data.delivery_nationwide,
        )
        db.add(producer)
        db.flush()
        # MEH-1297: payload order = stored order; position advances only on a
        # valid category so it stays contiguous when an invalid id is skipped.
        _pos = 0
        for cid in data.category_ids:
            cat = db.query(Category).filter(Category.id == cid).first()
            if cat:
                db.add(
                    ProducerCategory(
                        producer_id=producer.id, category_id=cid, position=_pos
                    )
                )
                _pos += 1
        # MEH-1921: the areas and the `offers_delivery` declaration are written
        # by one owner — this loop used to omit the flag, so a business that
        # registered WITH delivery areas was excluded from the משלוח chip by
        # the MEH-1848 conjunct. Same call in the new-email branch below.
        # MEH-1838 chunk A: data.delivery_cities (the new flat city-list field)
        # is folded in here as bare DeliveryAreaCreate(city=...) rows — same
        # shape _apply_delivery_cities (admin.py/producer_me.py) builds for the
        # identical input, so a nationwide vs. city-list registration is
        # visible to the same delivery_areas.any() match producer_listing.py
        # uses for every other producer.
        delivery_areas = list(data.delivery_areas) + [
            DeliveryAreaCreate(city=c) for c in data.delivery_cities if c and c.strip()
        ]
        persist_registration_delivery_areas(db, producer, delivery_areas)
        # MEH-1939 (MEH-1938 chunk 1): dual-write the primary branch location.
        # This is the UPGRADE branch, and it is the one every OAuth signup
        # lands on — `/auth/register/producer/oauth` creates a consumer and a
        # token only, never a Producer (its docstring, :865-871), so the
        # Google/Apple journey finishes here as an already-authenticated user.
        # Both branches of this route therefore need the call; covering only
        # the new-email one below would leave OAuth signups with no location.
        create_primary_branch_location(db, producer)
        # Link producer to existing user, upgrade role + flag.
        user.producer_id = producer.id
        user.role = "producer"  # type: ignore[assignment]
        user.is_producer = True  # type: ignore[assignment]
        # MEH-1995: the upgrade path collects ToS consent exactly like the two
        # account-creation paths — the checkbox renders in the STORY step with
        # no isUpgrade condition and hard-gates submit
        # (RegisterProducerClient.jsx:1553-1566, :1630-1633), and the flag rides
        # the shared body object above `if (!isUpgrade)` (:572, :575). Missing
        # this stamp meant a consent event that provably happened, and was
        # transmitted, recorded as NULL — i.e. the DB asserting "no record" about
        # an acceptance the user was *forced* to give. That is the exact evidence
        # gap this ticket exists to close, so leaving it here would have shipped
        # the bug inside its own fix. The sibling licensing declaration already
        # stamps both paths (declared_at at :543 upgrade / :662 new), which is
        # the house precedent this now matches.
        #
        # Guarded on the flag and never nulled: this user may already carry a
        # consumer-registration consent, and an absent/False flag must leave that
        # record intact rather than erase it. A True flag overwrites with the
        # newer acceptance — which is an evidentiary gain, since terms_version
        # then names the wording actually agreed to most recently.
        if data.terms_accepted:
            user.terms_accepted_at = datetime.now(timezone.utc)  # type: ignore[assignment]
            user.terms_version = TERMS_VERSION  # type: ignore[assignment]
        db.commit()
        db.refresh(user)

        # Capture producer primitives NOW — expire_on_commit=True means ORM
        # attributes are expired after commit, and FastAPI closes the session
        # before background tasks run.
        p_name = producer.name
        p_phone = producer.phone
        p_id = producer.id
        # MEH-2952: a test business or a test account → its sends are dropped.
        p_test = bool(producer.is_test or user.is_test)
        # MEH-2100: the ADMIN ping does NOT fire here any more. Registration
        # now creates a draft, which is absent from the admin's default queue
        # — so "בית עסק חדש … לאישור: /admin" would send her to a view the
        # business is not in. The identical call now lives in
        # producer_me.submit_for_review, i.e. at the moment it is true.
        # Sapir's call, 16/08, after the CI reviewer raised the double-ping.
        #
        # notify_producer_registered (to the OWNER) stays: "we got your
        # registration" is still accurate, and it is the message that tells
        # her to go finish the profile.
        background_tasks.add_task(
            notify_producer_registered,
            p_name,  # type: ignore[arg-type]
            p_phone,  # type: ignore[arg-type]
            test_cause=p_test,
        )
        # MEH-509 PR3: Anthropic-Haiku-backed risk score. Fail-open;
        # signup is never blocked by Anthropic latency or errors.
        background_tasks.add_task(score_producer, p_id)  # type: ignore[arg-type]
        # MEH-1553: no VERIFY email on the upgrade path. Verification is NOT
        # enforced here — a logged-in but *unverified* consumer can still add
        # producer capability (the guard above only requires a valid JWT).
        # That unverified state is covered downstream by the verify banner
        # (VerifyBanner.jsx) and the require_verified_producer dep (auth.py),
        # not by this handler. That decision stands.
        #
        # MEH-1806 amendment: the WELCOME email now fires HERE, and this is the
        # single place a producer welcome is sent on the OAuth journey.
        #
        # The omission was never argued. The comment above previously read "no
        # verify/welcome email"; the commit that wrote it (d521ea5e) describes
        # its own purpose as correcting a claim about *verification*, and
        # nothing in it — or anywhere else — reasons about the welcome. It was
        # carried along by the wording, not decided.
        #
        # It had a real cost: this is the branch every OAuth business owner
        # lands on (register_producer_oauth creates the account, Step 2 upgrades
        # it), so she got no email setting the "up to 3 business days for admin
        # approval" expectation and no dashboard link. She did get the CONSUMER
        # welcome from Step 0 — the wrong audience entirely — which is why the
        # fix was not simply "add a send here": that Step 0 send is removed in
        # the same change (see register_producer_oauth), leaving exactly one
        # welcome per producer signup instead of two contradictory ones.
        #
        # The WhatsApp welcome is not a substitute — it fires only when a phone
        # AND WhatsApp creds are configured, which is exactly the
        # `whatsapp_expected` bool computed just below.
        #
        # Fires for consumer-upgrades too, not only OAuth ones: both just
        # became producers, and the producer copy is correct for both. A
        # long-standing consumer who upgrades keeps the consumer welcome she
        # received at her own signup — that one was correct when it was sent,
        # and this is a second, different event.
        #
        # Fail-open, like every other send — signup must never block on email.
        background_tasks.add_task(
            _send_welcome_email,
            user.email,  # type: ignore[arg-type]
            user.name,  # type: ignore[arg-type]
            "producer",
            test_cause=p_test,
        )

        whatsapp_expected = bool(
            p_phone
            and settings.whatsapp_phone_number_id
            and settings.whatsapp_access_token
        )
        fp = generate_fingerprint()
        _set_refresh_cookie(response, user)
        _set_fingerprint_cookie(response, fp)
        return ProducerRegistrationResponse(
            access_token=create_access_token(
                user.id,  # type: ignore[arg-type]
                user.token_version,  # type: ignore[arg-type]
                fingerprint_hash=hash_fingerprint(fp),
            ),
            whatsapp_sent=whatsapp_expected,
        )

    # ---- NON-UPGRADE PATH (MEH-328 OWASP anti-enumeration) -------------
    # 422 cases below are body-shape validation, not enumeration:
    if not data.email or not data.name or not data.password:
        raise HTTPException(
            status_code=422,
            detail="אימייל, שם וסיסמה הם שדות חובה",
        )

    # MEH-328: timing-equalised. Both branches run validate_password
    # (HIBP) + hash_password (bcrypt) before the existence lookup so
    # response time doesn't fork on collision.
    result = await validate_password(data.password)
    if not result.ok:
        raise HTTPException(status_code=422, detail={"failures": result.failures})
    # MEH-457: bcrypt blocks ~50-200ms; off-loop required because the
    # handler is async (validate_password awaits HIBP). MEH-328: also
    # computed unconditionally — discarded on the collision branches.
    pwd_hash = await asyncio.to_thread(hash_password, data.password)

    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user is None:
        # New email — create producer + user. Producer-side rows (Producer,
        # ProducerCategory, DeliveryArea) and producer-specific notifications
        # ONLY fire here, so the collision branches stay side-effect-symmetric
        # (no orphan producer row, no spurious "new producer signed up" admin
        # notification).
        producer = Producer(
            name=data.producer_name,
            description=data.description,
            short_description=data.short_description,
            city=data.city,
            address=data.address,
            lat=data.lat,
            lng=data.lng,
            phone=data.phone,
            instagram=data.instagram,
            website=data.website,
            primary_contact_method=method,
            contact_email=data.contact_email,
            producer_license_number=data.producer_license_number,
            # MEH-1471: self-reported attribution captured at the final
            # registration step. Schema-validated (allowed-key set / bleach);
            # persisted verbatim. NULL when the field is absent (upgrade path).
            referral_source=data.referral_source,
            referral_source_other=data.referral_source_other,
            # MEH-759 (ADR-022 gate 2): stamp the binding declaration. Guard
            # above guarantees declaration_accepted is True here.
            declared_at=datetime.now(timezone.utc),
            declaration_version=DECLARATION_VERSION,
            **farmer_stamp,  # MEH-2923: grower declaration, its own record
            # MEH-2100: see the upgrade branch above — same value, same reason.
            # These two branches are the only Producer writers on this route
            # and both had to move; a fix to one alone would have left the
            # other registration path bypassing the submit gate entirely.
            status="draft",
            # MEH-1838 chunk A: see the upgrade branch above — same fields,
            # same reason (delivery_cities NOT written — see the note there).
            # MEH-2460: organizer vs business (ADR-036); the schema already
            # normalised an organizer's location/license fields.
            kind=data.kind,
            has_physical_location=data.has_physical_location,
            offers_delivery=data.offers_delivery,
            delivery_nationwide=data.delivery_nationwide,
        )
        db.add(producer)
        db.flush()
        # MEH-1297: payload order = stored order; position advances only on a
        # valid category so it stays contiguous when an invalid id is skipped.
        _pos = 0
        for cid in data.category_ids:
            cat = db.query(Category).filter(Category.id == cid).first()
            if cat:
                db.add(
                    ProducerCategory(
                        producer_id=producer.id, category_id=cid, position=_pos
                    )
                )
                _pos += 1
        # MEH-1921: see the upgrade branch above — same call, same reason. The
        # two branches are the only Producer writers on this route and each
        # built its own rows, so fixing one would have left the other broken.
        # MEH-1838 chunk A: see the upgrade branch above — same city-list fold.
        delivery_areas = list(data.delivery_areas) + [
            DeliveryAreaCreate(city=c) for c in data.delivery_cities if c and c.strip()
        ]
        persist_registration_delivery_areas(db, producer, delivery_areas)

        # MEH-1939 (MEH-1938 chunk 1): dual-write the primary branch location.
        # This is the NEW-EMAIL branch (password signup). Its twin is the
        # upgrade branch above; the two are the only Producer writers on this
        # route, and both need it.
        create_primary_branch_location(db, producer)

        verify_token = secrets.token_urlsafe(32)
        verify_expires = utc_now() + timedelta(hours=24)
        user = User(
            email=data.email,
            name=data.name,
            password_hash=pwd_hash,
            # MEH-457 (closes MEH-305 sibling gap): stamp the iat anchor so
            # JWTs issued before a future password change can be invalidated.
            password_changed_at=datetime.now(timezone.utc),
            phone=data.phone,
            role="producer",
            producer_id=producer.id,
            is_producer=True,
            # MEH-1995: same as the consumer path above. Note this is the ToS
            # checkbox, which is a DIFFERENT consent from the licensing
            # declaration stamped onto the producer row as declared_at /
            # declaration_version — two consents, two records, deliberately.
            terms_accepted_at=(
                datetime.now(timezone.utc) if data.terms_accepted else None
            ),
            terms_version=TERMS_VERSION if data.terms_accepted else None,
            email_verified=False,
            email_verify_token=verify_token,
            email_verify_expires=verify_expires,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        p_name = producer.name
        p_phone = producer.phone
        p_id = producer.id
        # MEH-2952: a test business or a test account → its sends are dropped.
        p_test = bool(producer.is_test or user.is_test)
        # MEH-2100: the ADMIN ping does NOT fire here any more. Registration
        # now creates a draft, which is absent from the admin's default queue
        # — so "בית עסק חדש … לאישור: /admin" would send her to a view the
        # business is not in. The identical call now lives in
        # producer_me.submit_for_review, i.e. at the moment it is true.
        # Sapir's call, 16/08, after the CI reviewer raised the double-ping.
        #
        # notify_producer_registered (to the OWNER) stays: "we got your
        # registration" is still accurate, and it is the message that tells
        # her to go finish the profile.
        background_tasks.add_task(
            notify_producer_registered,
            p_name,  # type: ignore[arg-type]
            p_phone,  # type: ignore[arg-type]
            test_cause=p_test,
        )
        # MEH-509 PR3: Anthropic-Haiku-backed risk score. Fail-open;
        # signup is never blocked by Anthropic latency or errors.
        background_tasks.add_task(score_producer, p_id)  # type: ignore[arg-type]
        background_tasks.add_task(
            _send_verify_email,
            user.email,  # type: ignore[arg-type]
            user.name,  # type: ignore[arg-type]
            verify_token,
            test_cause=p_test,
        )
        background_tasks.add_task(
            _send_welcome_email,
            user.email,  # type: ignore[arg-type]
            user.name,  # type: ignore[arg-type]
            "producer",
            test_cause=p_test,
        )
    else:
        # MEH-328: collision branch — never reveal which auth method the
        # existing account uses. Email out-of-band so the legitimate owner
        # knows where to log in. No DB writes, no session cookies, no token.
        if existing_user.password_hash:
            provider = "password"
        elif existing_user.google_id:
            provider = "google"
        elif existing_user.apple_id:
            provider = "apple"
        else:
            logger.warning(
                "[REGISTER-PRODUCER-COLLISION] user_id=%s has no auth method",
                existing_user.id,
            )
            provider = None
        if provider is not None:
            # MEH-1815: producer variant — this branch discarded the whole
            # business payload, so the out-of-band email has to say so.
            background_tasks.add_task(
                _send_duplicate_attempt_email,
                existing_user.email,  # type: ignore[arg-type]
                existing_user.name,  # type: ignore[arg-type]
                provider,
                "producer",
                test_cause=bool(existing_user.is_test),  # MEH-2952
            )

    # MEH-3087: same cookie on both branches (see set_signup_marker).
    set_signup_marker(response, None if existing_user else verify_token)
    return RegisterAck(detail=_REGISTER_ACK_DETAIL)


@router.post(
    "/register/producer/oauth",
    response_model=ProducerOAuthSignupResponse,
    # MEH-780: document the deliberate non-2xx statuses (see /auth/google).
    responses={
        401: {"description": "Invalid OAuth id_token"},
        503: {"description": "OAuth provider not configured (MEH-253)"},
    },
)
@limiter.limit("10/minute")
def register_producer_oauth(
    request: Request,
    response: Response,
    data: ProducerOAuthSignupRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ProducerOAuthSignupResponse:
    """MEH-170 — OAuth as Step 0 of producer signup.

    Creates or logs in a user via Google or Apple, then returns a JWT.
    The frontend advances to Step 2 of /register/producer; the final
    POST /auth/register/producer takes the MEH-143 upgrade path because
    the user is already authenticated.

    Differs from /auth/google and /auth/apple in ONE place: if the
    authenticated user already has a producer linked, return 409 so the
    UI can redirect to /login instead of silently continuing. Everything
    else — token verification, MEH-166 email-collision guard, MEH-138
    avatar backfill — is re-used from the existing OAuth handlers.
    """
    provider = data.provider
    if provider == "google":
        if not settings.google_client_id:
            raise HTTPException(
                status_code=503,
                detail="התחברות עם Google לא פעילה כרגע. אפשר להתחבר עם אימייל וסיסמה.",
            )
        user_info = _verify_google_token(data.id_token)
        sub_field = "google_id"
    else:  # apple — pattern validator on schema guarantees one of the two
        if not settings.apple_client_id:
            raise HTTPException(
                status_code=503,
                detail="התחברות עם Apple לא פעילה כרגע. אפשר להתחבר עם אימייל וסיסמה.",
            )
        user_info = _verify_apple_token(data.id_token)
        sub_field = "apple_id"

    if not user_info:
        label = "Google" if provider == "google" else "Apple"
        raise HTTPException(status_code=401, detail=f"אסימון {label} לא תקין")

    oauth_sub = user_info["sub"]
    email = user_info.get("email", "")
    # Apple only sends the name on the very first auth; callers may pass
    # it explicitly via `name`. Fall back to the Google "name" claim or
    # the email local-part so the User.name NOT NULL constraint holds.
    full_name = (
        data.name or user_info.get("name") or (email.split("@")[0] if email else "חדשה")
    )

    # 1. Look up by provider sub first (stable identifier).
    is_new = False
    user = db.query(User).filter(getattr(User, sub_field) == oauth_sub).first()

    # 2. Fall back to email lookup — MEH-166 takeover guard.
    if not user:
        user = db.query(User).filter(User.email == email).first() if email else None
        if user:
            # Email registered via password or the *other* OAuth provider.
            # Refuse silent link — same rule as /auth/google and /auth/apple.
            # MEH-3272: compare the provider id itself (MEH-3104 fixed the
            # two siblings). `if not getattr(...)` let an account linked to a
            # DIFFERENT Google/Apple identity through with a full session.
            if getattr(user, sub_field) != oauth_sub:
                raise HTTPException(
                    status_code=409,
                    detail="אימייל זה כבר רשום עם סיסמה. התחברו עם סיסמה במקום.",
                )
        else:
            # MEH-375 (YF-4): re-host the Google avatar only on the
            # new-user creation path. Apple has no picture and the
            # helper short-circuits to None for non-google.
            kwargs = {
                "email": email,
                "name": full_name,
                "role": "consumer",
                sub_field: oauth_sub,
                # MEH-1553: the OAuth provider already verified the email, so
                # stamp email_verified=True — one-to-one with the /auth/google
                # and /auth/apple new-user siblings. Without it the new user
                # falls back to the column default (False), sees the verify
                # banner, and is blocked by require_verified_producer (MEH-170
                # gap; MEH-1164 turned that into a money-path blocker).
                "email_verified": True,
            }
            if provider == "google":
                kwargs["avatar_url"] = _upload_google_avatar_or_none(
                    user_info.get("picture")
                )
            user = User(**kwargs)
            db.add(user)
            db.commit()
            db.refresh(user)
            is_new = True

    # MEH-669: admin accounts must never enter the producer signup flow,
    # even via the OAuth Step 0. Although this endpoint does not itself
    # write role="producer" (Step 2 at POST /auth/register/producer does
    # that — also guarded), reject upfront so the frontend cannot advance
    # to Step 2 and the JWT issued here cannot be used as an upgrade
    # token. Defense-in-depth — see sibling guard at auth.py upgrade_path.
    if user.role == "admin":
        raise HTTPException(
            status_code=403,
            detail="מנהלת מערכת לא יכולה להירשם כבית עסק. אנא צרי חשבון נפרד עם כתובת אימייל אחרת.",
        )

    # 3. If this account is already a producer, bail out — the producer
    # signup flow is for NEW producers. Existing ones should log in and
    # use the producer dashboard.
    if user.producer_id or getattr(user, "is_producer", False):
        raise HTTPException(
            status_code=409,
            detail="יש לך כבר עסק רשום בחשבון זה. התחברו כדי לנהל אותו.",
        )

    # MEH-138 + MEH-375: backfill the Google avatar only when the
    # existing user has no avatar yet. is_new path already set it
    # above (or None if Google had no picture); skip to avoid a
    # duplicate upload that would orphan the new-user asset.
    if provider == "google" and not is_new and not user.avatar_url:
        picture_for_google = _upload_google_avatar_or_none(user_info.get("picture"))
        if picture_for_google:
            user.avatar_url = picture_for_google  # type: ignore[assignment]
            db.commit()

    # MEH-1806 — producer signup entry point; consumer copy is wrong-audience.
    # Welcome fires once, Step 2, producer kind.
    #
    # This route used to send the CONSUMER welcome here on `is_new` — "גלי בתי
    # עסק לפי עיר… שמרי מועדפים" — to someone who is, by construction, halfway
    # through registering a business. Combined with the Step 2 producer welcome
    # that MEH-1806 adds, a new OAuth owner received two mails seconds apart,
    # both opening `ברוכה הבאה למהמקור! 🌿` and then contradicting each other.
    #
    # Verified producer-only before removing, not assumed: the sole production
    # caller is ProducerOAuthButtons.jsx:37, mounted once at
    # RegisterProducerClient.jsx:832 (/register/producer). Consumer OAuth uses
    # /auth/google and /auth/apple (auth-context.js:145,152), which keep their
    # own welcome sends untouched. The separation is already an asserted
    # invariant — e2e/flows/09-login-console-clean.spec.ts fails if this
    # endpoint is ever POSTed from the consumer /login page (MEH-274).
    #
    # ACCEPTED COST, stated rather than discovered later: a user who completes
    # Step 0 and abandons before Step 2 now receives NO welcome. She holds a
    # consumer account and finished nothing, and a test asserts the zero so it
    # reads as a decision rather than an oversight.
    #
    # `email_sent` follows the send. This endpoint now dispatches no mail at
    # all, so the flag is False unconditionally — leaving it computed from
    # `is_new` would have kept the response advertising a welcome that no
    # longer exists. The field has no reader today (no frontend use, no test),
    # which is exactly why a stale `True` could have sat there indefinitely.
    email_expected = False
    fp = generate_fingerprint()
    _set_refresh_cookie(response, user)
    _set_fingerprint_cookie(response, fp)
    return ProducerOAuthSignupResponse(
        access_token=create_access_token(
            user.id,  # type: ignore[arg-type]
            user.token_version,  # type: ignore[arg-type]
            fingerprint_hash=hash_fingerprint(fp),
        ),
        email_sent=email_expected,
    )
