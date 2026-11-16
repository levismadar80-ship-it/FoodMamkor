"""
Module:    producer_approval
Purpose:   What approving a business page does to its row: slug guard and
           minting, the approvable-state check, applying the approved state
           and persisting it with slug-collision retry.
Does NOT:  Expose HTTP routes (routers/admin_decisions.py) or send the
           owner any message (services/admin_producer_emails.py builds them).
Split out of routers/admin.py (MEH-3267); the code is moved verbatim.
"""

import logging
import re
from typing import NamedTuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Producer
from app.services import retired_slugs  # MEH-2528
from app.services.license_validation import categories_require_license
from app.slug_utils import (
    is_latin_slug,
    is_reserved,
    latin_city_suffix,
    latin_slug,
    rejected_characters,
)

logger = logging.getLogger(__name__)


def _guard_supplied_slug(raw: str) -> None:
    """Validate a slug an admin typed, before it is normalised into one.

    MEH-2020. Two rejections, and the order between them is the ruling's, not a
    detail: **reserved is asked first, of the raw value under NFKC + casefold.**
    Ask it of `_slugify(raw)` instead and the fullwidth "ａbout" reports as a
    charset error, because the stripping already removed the character that made
    it reserved — the same word, refused for the wrong reason and with an error
    message that sends the admin to fix the wrong thing.

    The charset rejection is a 422 carrying a code plus the offending characters,
    not a hard-coded Hebrew sentence (MEH-1943). The reserved rejection keeps its
    existing 400 and its existing Hebrew string: changing a live contract that
    nothing in this ticket asked about is scope this change does not own.
    """
    if is_reserved(raw):
        raise HTTPException(
            status_code=400, detail="שם זה שמור לשימוש האתר. בחרי שם אחר."
        )
    bad = rejected_characters(raw)
    if bad:
        raise HTTPException(
            status_code=422,
            detail={"code": "slug_charset_not_allowed", "characters": bad},
        )
    # MEH-3336: a typed slug must be Latin. Asked of the normalised form the
    # write path stores (lower-case, spaces → hyphens), so "Sandra Perot" is
    # accepted as "sandra-perot" and "סנדרה" is refused with its characters.
    normalised = re.sub(r"\s+", "-", raw.strip().lower())
    if not is_latin_slug(normalised):
        non_latin = sorted({c for c in normalised if not re.match(r"[a-z0-9-]", c)})
        raise HTTPException(
            status_code=422,
            detail={"code": "slug_not_latin", "characters": non_latin},
        )


def _ensure_unique_slug(
    db: Session,
    base_slug: str,
    exclude_id: UUID | None = None,
    city: str | None = None,
) -> str:
    """Return a slug that is unique, not reserved and not retired.

    MEH-3336: on a collision the business's town is appended
    ("sandra-perot-prds-chna-krkor") before any number. The `-2, -3` counter
    is the last resort only — when no town is known, or the town variant is
    taken too — because a loop that can run out of candidates must still end.

    MEH-2528: a retired slug (the URL of a deleted or renamed business, see
    services/retired_slugs.py) counts as taken, so an old link never resolves
    to a different business. `exclude_id` is also the owner the retired check
    exempts: a business may go back to a slug it retired itself.
    """
    if not base_slug:
        return base_slug

    def _free(candidate: str) -> bool:
        if is_reserved(candidate) or retired_slugs.is_retired(
            db, candidate, owner_id=exclude_id
        ):
            return False
        q = db.query(Producer).filter(Producer.slug == candidate)
        if exclude_id:
            q = q.filter(Producer.id != exclude_id)
        return q.first() is None

    if _free(base_slug):
        return base_slug
    suffix = latin_city_suffix(city)
    stem = f"{base_slug}-{suffix}" if suffix else base_slug
    if suffix and _free(stem):
        return stem
    counter = 2
    while not _free(f"{stem}-{counter}"):
        counter += 1
    return f"{stem}-{counter}"


def _mint_slug_if_absent(db: Session, producer: Producer) -> None:
    """MEH-1817 — publish-time canonicalization of the producer's URL.

    Self-registration (`auth.py`, both branches) builds `Producer(...)` with no
    slug, and `_slugify` ran only on the admin-create / admin-update / import
    paths — so a self-registered business stayed `slug=NULL` forever and its
    public page fell back to `/producer/{uuid}`, losing the Hebrew URL the
    catalog's SEO is built on.

    Approval rather than registration: the name can still change during review,
    and a slug minted from a name that then changes is worse than none — it is
    a wrong URL that has to be redirected.

    Guarded on `not producer.slug`, so re-approving a business never rewrites
    an existing (possibly admin-chosen) slug.

    `or None` is load-bearing: `_ensure_unique_slug` returns "" unchanged for an
    empty base, so a name that slugifies to nothing must leave the column NULL.
    An empty string is neither a slug nor NULL — it breaks the id-URL fallback's
    NULL check AND satisfies the `not producer.slug` guard forever after, so no
    later approval could repair it.
    """
    if not producer.slug:
        # MEH-3336: a Latin slug, from the Instagram handle or the name.
        minted = _ensure_unique_slug(
            db,
            latin_slug(producer.name, instagram=producer.instagram),  # type: ignore[arg-type]
            city=producer.city,  # type: ignore[arg-type]
        )
        producer.slug = minted or None  # type: ignore[assignment]


def _apply_approval_state(producer: Producer) -> None:
    """The complete set of column writes that "approved" means.

    Single owner, because `_persist_approval`'s retry path must re-apply every
    one of them after `db.rollback()` discards the first attempt. Two copies of
    this list would drift the moment a fourth field joins approval: the handler
    would set it, the rollback would discard it, and the retry would commit a
    row missing it — silently, and only on the collision path, which is the one
    path no ordinary test exercises.

    The slug is deliberately NOT here. It is minted by `_mint_slug_if_absent`,
    which needs the session (it queries for collisions) and must run *after*
    the re-read on the retry path so it sees the winner's committed slug.
    """
    producer.status = "approved"  # type: ignore[assignment]
    # MEH-1011: clear the request-changes trail on approve — the completion
    # request (if any) is resolved once the business is approved.
    producer.requested_changes = None  # type: ignore[assignment]
    producer.changes_requested_at = None  # type: ignore[assignment]
    # MEH-2210: symmetric clearing of the rejection trail — an approved
    # business must not carry a stale "לא אושרה" reason into its dashboard
    # (the banner reads producer_rejection_reason off GET /auth/me).
    # `resubmission_count` is deliberately NOT reset: it is history, and the
    # cap is per business, not per rejection.
    producer.rejection_reason = None  # type: ignore[assignment]
    producer.rejection_reason_code = None  # type: ignore[assignment]


class ApprovalOverrides(NamedTuple):
    """The admin's explicit "yes, I have checked this out-of-band" flags.

    MEH-2121. Bundled rather than threaded as two more booleans because
    `_persist_approval` already takes five arguments and `max-args = 5` is
    enforced on this file (`backend/pyproject.toml:116`; this file carries no
    per-file-ignore, unlike producers.py / auth.py). A sixth positional would
    have to be paid for by widening that ignore list, which is the wrong
    direction — so the bundle keeps both signatures at their current width and
    a third override, if one ever arrives, costs nothing.

    Both default False: the guards are ON unless an admin explicitly asks for
    the door, which is the MEH-971 property this mirrors.
    """

    without_license: bool = False
    unverified_phone: bool = False


def _assert_approvable(
    db: Session, producer: Producer, overrides: ApprovalOverrides, admin_id: UUID
) -> None:
    """The approval gates, in one owner, run against the row being written.

    MEH-2017. These lived inline in `approve_producer` and therefore ran only
    against the object fetched at the top of that handler. `_persist_approval`'s
    retry path re-reads the row after a rollback, so a producer whose photos or
    license number were cleared inside that window could be approved by the
    retry although the main path would have rejected it — and `_persist_approval`
    was the only place in the codebase able to approve without passing a gate.

    One function called twice, deliberately not a validator layer or a
    decorator: there are two call sites and no third is expected.

    The override warning lives HERE rather than in the handler so the retry path
    is audited too. A silent override on the one path this function exists to
    protect would be the same defect wearing a smaller diff.
    """
    # MEH-2908: judge the row as it stands NOW, not as it stood when the
    # handler loaded it.
    #
    # Without this line the gates below read `producer` from the admin
    # session's identity map, populated by the load at the top of
    # `approve_producer`. An owner who changes the profile inside that window
    # — measured with the gallery, where it publishes a business with no
    # photo and sends her the «ברוכים הבאים למהמקור» mail in the same call —
    # has the gate pass on content that is already gone. MEH-2907's
    # `test_the_gate_judges_the_row_as_it_stands` is the measurement, and it
    # fails if this line is removed.
    #
    # A refresh and not a lock: `_lock_producer_updates`' advisory key is
    # deliberately scoped so it does NOT block admin approve (MEH-2007), and
    # this does not change that. It narrows the window to the gap between
    # this SELECT and the commit instead of closing it — the same shape
    # `_persist_approval` already relies on by re-running these gates after
    # its rollback (MEH-2017). A true close needs the locking decision
    # reopened, which is not what this fixes.
    #
    # Safe on both call sites: nothing has been assigned to `producer` by
    # either caller at this point — the handler has only read `status`, and
    # the retry path re-queries the row — so no pending change is discarded.
    db.refresh(producer)

    # MEH-799: approval gate — a business never goes public without at least
    # one photo. Validation only (no schema change); registration/publish
    # flows untouched — the gate lives at the moment of approval.
    if not producer.images:
        raise HTTPException(
            status_code=422,
            detail="לא ניתן לאשר בית עסק ללא תמונה. בקשי מבעלת העסק להעלות תמונה אחת לפחות.",
        )
    # MEH-971 chunk 4: license-pending approval guard — the approve-gate mirror
    # of register-time ensure_license_for_categories. 422 matches the photo gate
    # above (not MEH-769's 409, which is for status transitions).
    category_ids = [c.id for c in producer.categories]
    license_missing = not (producer.producer_license_number or "").strip()
    needs_license = categories_require_license(db, category_ids) and license_missing
    if needs_license and not overrides.without_license:
        raise HTTPException(
            status_code=422,
            detail="לא ניתן לאשר בית עסק בקטגוריה הדורשת רישיון ייצור ללא מספר רישיון. אמתי את הרישיון, או אשרי עם דריסה מפורשת.",
        )
    if needs_license and overrides.without_license:
        # Audit trail: an admin bypassed the license guard — visible in Railway logs.
        logger.warning(
            "approve_producer: license-pending override for producer %s by admin %s",
            producer.id,
            admin_id,
        )

    # MEH-2121: the WhatsApp number is the channel every customer contact runs
    # through, so approving an unverified one publishes a page whose only CTA
    # may go nowhere. submission_gate makes the same argument for the owner's
    # submit gate; this is the approve-time mirror, for the older/bypassing
    # routes that reach approval without having passed it.
    #
    # 422, matching the photo and licence gates directly above — this is an
    # approve-time CONTENT gate, and this file's split is 422 for those, 409 for
    # status transitions (the draft blocks in the two handlers, MEH-769's
    # toggle guard, request_producer_changes').
    #
    # RULED by Sapir 18/08, and recorded because the ticket said otherwise: the
    # MEH-2121 AC specified 409 here. That was a spec error, caught
    # independently by this PR's Phase 0 and by the CI reviewer, and corrected
    # before merge rather than after a client had branched on it. The card's
    # description now matches. Do not "restore" 409.
    if not producer.phone_verified and not overrides.unverified_phone:
        raise HTTPException(
            status_code=422,
            detail="לא ניתן לאשר בית עסק ללא אימות מספר הוואטסאפ. בקשי מבעלת העסק לאמת את המספר, או אשרי עם דריסה מפורשת.",
        )
    if not producer.phone_verified and overrides.unverified_phone:
        # Same audit shape as the license override directly above — a log line,
        # deliberately, because that is the mechanism this repo already uses.
        logger.warning(
            "approve_producer: unverified-phone override for producer %s by admin %s",
            producer.id,
            admin_id,
        )


SLUG_UNIQUE_CONSTRAINT = "producers_slug_key"


def _is_slug_collision(exc: IntegrityError) -> bool:
    """True only for a `producers.slug` unique violation.

    `db.commit()` flushes the WHOLE session, so a bare `except IntegrityError`
    around it catches any constraint violation on any pending row — not just
    the one this function is recovering from. Retrying an unrelated violation
    is the dangerous branch: the rollback discards it, the retry re-applies
    only the approval columns, and the request commits a partially-applied
    transaction and returns 200. A wrong row, silently, on the path nothing
    exercises.

    So the default is to **re-raise**. `producers_slug_key` is the only unique
    constraint on `producers` today (verified against `pg_constraint`), but
    that is a fact about today's schema, not an invariant — this check is what
    makes a future second unique index surface as a 500 with its real cause
    instead of being swallowed by a retry meant for slugs.

    Falls back to the message text when the driver exposes no `diag` (psycopg2
    populates it; SQLite and some wrappers do not), and re-raises when neither
    source names the constraint. Unknown means raise, never retry.
    """
    orig = getattr(exc, "orig", None)
    constraint: str | None = getattr(
        getattr(orig, "diag", None), "constraint_name", None
    )
    if constraint:
        return constraint == SLUG_UNIQUE_CONSTRAINT
    return SLUG_UNIQUE_CONSTRAINT in str(orig or exc)


def _persist_approval(
    db: Session,
    producer_id: UUID,
    producer: Producer,
    overrides: ApprovalOverrides,
    admin_id: UUID,
) -> Producer:
    """Mint the slug and commit, retrying once on a unique-slug collision.

    `producers.slug` is UNIQUE (`models/models.py:112`) and `_ensure_unique_slug`
    is SELECT-then-return with no lock, so two admins approving two same-named
    businesses in one window both see the candidate free and both take it. The
    second commit then violates the constraint.

    That exposure is NEW and belongs to MEH-1817: before the mint, this handler
    never wrote `slug`, so it could not reach the constraint at all. Left
    uncaught it would be a raw 500 **and** roll back the entire transaction —
    the approval, the status flip, the requested-changes clear — so the losing
    admin's approval would fail silently with no notification sent.

    Recovery follows the house pattern (`reviews.py:288`, `reports.py:62`,
    `favorites.py:72`, `referrals.py:54`, `producer_me.py:228`): roll back and
    retry once. The retry re-reads the row, so `_ensure_unique_slug` now sees
    the winner's committed slug and suffixes past it.

    Not retried twice. A second collision would mean a third admin approving
    the same name in the same instant; letting that raise is more honest than
    looping, and a 500 whose cause is one frame up beats one nobody can explain.

    Only a `producers_slug_key` violation is retried — see `_is_slug_collision`.
    """
    _mint_slug_if_absent(db, producer)
    try:
        db.commit()
        return producer
    except IntegrityError as exc:
        db.rollback()
        if not _is_slug_collision(exc):
            raise
    producer = db.query(Producer).filter(Producer.id == producer_id).first()  # type: ignore[assignment]
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא") from None
    # MEH-2017: the gates run on BOTH paths. This row is fresh from the database
    # and is the one about to be committed, so it is re-validated rather than
    # trusted from the pre-collision fetch — if another transaction stripped the
    # images or the license number inside the rollback window, this raises 422
    # exactly as the main path would have. One owner, called twice.
    _assert_approvable(db, producer, overrides, admin_id)
    _apply_approval_state(producer)
    _mint_slug_if_absent(db, producer)
    db.commit()
    return producer
