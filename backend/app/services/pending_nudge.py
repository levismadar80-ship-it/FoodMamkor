"""
Module:   pending_nudge
Purpose:  Daily-scheduler entry point for the nudge emails sent to a business
          that registered but has not reached the review queue. A DRAFT gets a
          behavioural sequence at day 1 / 3 / 7; every other nudgeable status
          keeps a single day-1 send. Each email names exactly what that
          business is missing and links to the dashboard.
Touches:  reads producers + users via SQLAlchemy Session; writes
          `email_pending_nudge_sent_at` on the producer row; dispatches via
          app.services.email.send_email (Resend, fail-open).
Does NOT: hold the scheduler instance (that lives in app.startup); decide what
          is missing (that is submission_gate — this module owns only the
          COPY); nudge past day 7; touch app.services.onboarding_followup,
          which is frozen under MEH-1587 and stays approved-only.
Related:  backend/app/services/submission_gate.py (what is missing),
          backend/app/services/onboarding_followup.py (the module this
          mirrors 1:1 — candidate query shape, per-producer fail-isolation,
          per-producer commit, sent-column stamping),
          backend/app/services/email.py (send_email fail-open contract),
          backend/alembic/versions/20260802_1200_d3b7f1a92c64_meh1818_
          pending_nudge_sent_at.py (the column this module relies on).
History:  MEH-1818 (creation, 2026-08-02) — implements the decision deferred
          in MEH-1587 §8 ("what does a PENDING business receive?");
          MEH-2100 (reads the shared submit gate instead of its own rule);
          MEH-2111 (day-3 + day-7 for drafts, on the SAME column — see
          `_due_mark` for why no migration was needed).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import Producer, User
from app.services.email import send_email

# MEH-1242 established SITE_DOMAIN as the SINGLE canonical site-domain
# constant. Imported rather than re-declared — a second literal here is
# exactly the duplication MEH-1242 removed. Reading a public constant does
# not violate the MEH-1587 freeze on that module's bodies/logic.
from app.services.onboarding_followup import SITE_DOMAIN

# MEH-2100: the single source of truth for "what is this business missing?",
# shared with POST /producers/me/submit-for-review so the email and the gate
# can never disagree. This module owns the COPY, not the decision.
from app.services.submission_gate import (
    MISSING_IMAGE,
    MISSING_PHONE_VERIFIED,
    MISSING_PRODUCT,
    submission_missing_items,
)

logger = logging.getLogger(__name__)


# MEH-1818: the Producer.status values that may receive the nudge.
#
# Producer.status is a free String(20) with no enum and no DB CHECK
# constraint; the authoritative enumeration is the admin filter pattern in
# routers/admin.py's list_producers — draft | pending | pending_whatsapp |
# approved | rejected | inactive. (This comment used to cite
# routers/admin.py:112; that line number had drifted — the pattern sits around
# :344. Cited by section now, MEH-2100.) Membership in this tuple admits three
# of the six, so a status added later is excluded by DEFAULT (fail-closed)
# rather than silently opted into an email that assumes "we are waiting on
# you".
#
# This is the same fail-closed reasoning MEH-1587 used to pick a single `==`
# for the approved-only sequence; the safe direction is that a new status
# receives nothing until someone decides what it should receive.
#
# MEH-2100: `draft` joins them, and it is now the MAIN case rather than an
# edge one — under the submit gate a new registration lands in draft and stays
# there until the owner acts, so "we are waiting on you" is most true exactly
# there. `pending`/`pending_whatsapp` are retained because existing rows still
# hold them.
_NUDGEABLE_STATUSES = ("draft", "pending", "pending_whatsapp")

# MEH-1818: a business is nudged one day after registering. Deliberately not
# tunable via env (the ticket's constraint: no new env vars) — the activation
# research behind the choice (<48h activation ⇒ <10% churn) is a product
# decision, not an operational knob.
_NUDGE_AFTER = timedelta(hours=24)

# MEH-2111: the behavioural sequence. A DRAFT is chased at day 1, 3 and 7;
# every other nudgeable status keeps the single day-1 send it has always had.
#
# The split is the ticket's, and it is not arbitrary. "We are waiting on you"
# is literally true for a draft — nobody else can move it — so a sequence is
# fair there. A `pending` business is waiting on Sapir, and mailing it three
# times would be chasing someone for work she has already done.
#
# Ordered ascending; `_due_mark` reads it highest-first.
_DRAFT_MARK_DAYS: tuple[int, ...] = (1, 3, 7)
_LEGACY_MARK_DAYS: tuple[int, ...] = (1,)


# ---------- email copy ----------
#
# LOCKED — approved verbatim by Sapir 31/07/2026 in the MEH-1818 description
# (<hebrew_copy locked="✓">). Style matches onboarding_followup: Sapir's first
# person (feminine — "אני קוראת"), addressing the reader in the plural.
# Changing a character requires Sapir's sign-off.

_SUBJECT = "עוד צעד קטן — והעסק שלך עובר לבדיקה"

# MEH-2111: the day-3 and day-7 subjects, approved verbatim by Sapir 17/08 in
# the ticket description. `[מספר]` is the placeholder AS SHE WROTE IT, and the
# code substitutes that literal token rather than re-writing the string as an
# f-string or a `{}` format slot. Two reasons, both practical:
#
#   * the source line stays byte-identical to the approved text, so a rule-22
#     audit is a string comparison and not a mental de-templating pass;
#   * `str.replace` cannot raise. `.format()` on a string containing any other
#     braces raises KeyError, which on this code path would be swallowed by the
#     per-producer `except` and turn into a silently unsent email. The same
#     class was flagged on the MEH-2112 confirmation mail; here the fix is free.
_SUBJECT_DAY_3 = "נשארו [מספר] צעדים — והעסק שלכם עולה לאתר"
_SUBJECT_DAY_7 = "המקום שלכם שמור — נשארו [מספר] צעדים"

_COUNT_TOKEN = "[מספר]"

_SUBJECT_BY_MARK: dict[int, str] = {
    1: _SUBJECT,
    3: _SUBJECT_DAY_3,
    7: _SUBJECT_DAY_7,
}

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
# MEH-2100: the one addition to MEH-1818's locked copy, approved by Sapir as
# part of that batch. Verbatim from the ticket.
_MISSING_ITEM_PRODUCT = (
    "🛒 מוצר ראשון בקטלוג — עמוד העסק מציג את המוצרים שלכם, "
    "ובלי מוצר אחד לפחות אין ללקוחות מה לראות."
)

# MEH-2100: code → locked Hebrew line. The CODES come from the shared submit
# gate; the COPY lives here, because copy is Sapir's (rule 22) and the gate is
# not a copy module.
#
# Only three of the gate's five codes have approved copy. Inventing Hebrew for
# the other two would be exactly the unapproved-copy move rule 22 forbids, so
# they are dropped from the body; the 422 still returns all five for the
# dashboard checklist to highlight.
#
# ⚠️ MEH-2111 CORRECTION. This comment used to justify the gap by asserting
# that MISSING_CATEGORY and MISSING_LOCATION "are REQUIRED WIZARD FIELDS at
# registration ... so a registered business cannot be missing them". That is
# true of CATEGORY and **false of LOCATION**, and the difference is not
# academic — it is a live hole in this email.
#
# `ProducerRegister` does require a `city` (min_length=1), but
# `submission_gate._has_location` does not read `city`: it wants COORDINATES
# (or a delivery declaration), and `ProducerRegister.lat/lng` are
# `float | None = None` with no server-side geocoding — they arrive only when
# the owner picks an AddressSearch suggestion. Measured against the real
# helper, with a control:
#
#     coords present -> ['image', 'product', 'category']
#     coords absent  -> ['image', 'product', 'category', 'location']
#
# So a business that typed its city without picking a suggestion is missing
# `location`, and this module silently drops the only line that would tell her.
# If `location` is the ONLY thing missing she is stamped and mailed NOTHING,
# while her submission keeps 422-ing. Naming that item needs a Hebrew line from
# Sapir (rule 22), so it is reported rather than invented here.
#
# The count in the day-3/day-7 subject is therefore taken from THIS list, not
# from the gate's — see `_build_email`.
_ITEM_COPY: dict[str, str] = {
    MISSING_IMAGE: _MISSING_ITEM_PHOTO,
    MISSING_PRODUCT: _MISSING_ITEM_PRODUCT,
    MISSING_PHONE_VERIFIED: _MISSING_ITEM_PHONE,
}


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
    """The email lines for what is blocking this producer, in gate order.

    MEH-2100: the DECISION of what is missing is no longer made here — it is
    `submission_gate.submission_missing_items`, the same helper the submit
    endpoint 422s on and the dashboard checklist renders. Before this, the
    nudge carried its own two-item definition of "not ready", which could (and
    would) drift from whatever the submit gate decided; a business could be
    told it was one photo away while the gate wanted three more things.

    This function is now only the CODE → COPY mapping, and it drops codes with
    no Sapir-approved line (see `_ITEM_COPY`).

    Phone: the signal is `phone_verified`, NOT `status == "pending_whatsapp"`
    as it was before. That old form is unreachable under the draft machine — a
    new registration never gets that status — so keeping it would have
    reported every draft as phone-verified and silently dropped the phone line
    from the one population that most needs it. Behaviour on legacy
    `pending_whatsapp` rows is UNCHANGED, because `phone_verified` is False
    exactly when that status applies.
    """
    return [
        _ITEM_COPY[code]
        for code in submission_missing_items(producer)
        if code in _ITEM_COPY
    ]


def _as_utc(value: datetime) -> datetime:
    """Read a stored timestamp as tz-aware UTC.

    Both halves of this module's arithmetic come out of the DB with DIFFERENT
    awareness, which is the whole reason this exists: `Producer.created_at` is
    `Column(DateTime)` — naive, written by `datetime.utcnow` — while
    `email_pending_nudge_sent_at` is `Column(DateTime(timezone=True))`.
    Subtracting one from the other raises `TypeError: can't subtract
    offset-naive and offset-aware datetimes`, and on this code path that
    exception would be caught by the per-producer `except` and logged as a
    per-row failure — i.e. the entire sequence would silently stop sending,
    with a warning nobody reads. Coerce at the boundary instead.

    Naive is read as UTC, matching `clock.business_days_waiting`'s stated
    convention; SQLite also hands back naive values for a tz-aware column, so
    this must hold under the test driver too.
    """
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _due_mark(producer: Producer, now: datetime) -> int | None:
    """Which day-mark this producer is due for right now, or None.

    The whole point of this function is that the sequence needs NO new column.
    MEH-539's follow-up series took the other road — one `sent_at` column per
    email — because those four sends are independent of each other. These three
    are not: they are strictly ordered by the producer's age, so a single "how
    far did we get" timestamp already distinguishes them. `sent_at < created_at
    + N days` means "the last thing we sent predates mark N", which is exactly
    "mark N has not been sent". That is the finding this ticket's RED-migration
    branch was hedging against, and it does not fire.

    Highest-first, and it returns on the first mark the producer has reached —
    never a lower one. A draft first seen at 5 days old gets ONE email (day-3),
    not a backlog of day-1 + day-3 fired in the same run.

    Exactly-once per mark, argued rather than asserted: sending stamps
    `sent_at = now`, and `now >= created_at + N` for the mark just sent, so the
    same mark cannot be due again. It becomes due only when age crosses the
    NEXT mark, whose threshold the stamp precedes.
    """
    marks = _DRAFT_MARK_DAYS if producer.status == "draft" else _LEGACY_MARK_DAYS
    created = _as_utc(producer.created_at)
    sent = producer.email_pending_nudge_sent_at
    sent = _as_utc(sent) if sent is not None else None

    for days in reversed(marks):
        if now - created < timedelta(days=days):
            continue
        if sent is None or sent < created + timedelta(days=days):
            return days
        # Reached this mark and already sent at or after it. Lower marks are
        # behind us by construction, so there is nothing else to consider.
        return None
    return None


def _build_email(first_name: str, items: list[str], mark: int) -> tuple[str, str]:
    """Render (subject, body) for one producer's nudge at a given day-mark.

    Takes no Producer, unlike onboarding_followup._build_email — that one
    needs the row to pick the Email-5 licensed/unlicensed variant, whereas
    every producer-dependent decision here is already resolved into `items`
    by _missing_items(). Threading the row through anyway would imply a
    dependency that does not exist.

    MEH-2111 — WHICH COUNT `[מספר]` CARRIES, because the ticket's phrasing
    ("the live count from the helper") turns out to be ambiguous in a way that
    is visible to the reader. `len(items)` is the number of lines the body
    actually prints; `len(submission_missing_items(producer))` can be LARGER,
    because codes with no Sapir-approved Hebrew are dropped (see `_ITEM_COPY`,
    and note that `location` is genuinely reachable — the comment there used to
    claim otherwise).

    The printed lines win. A subject promising four steps above a body listing
    three is a self-contradiction the owner sees immediately, whereas
    under-counting an item we are not naming anyway is invisible to her and is
    already the pre-existing behaviour of the body. Both numbers derive from the
    helper; this one is the helper's output after the copy filter.
    """
    return _SUBJECT_BY_MARK[mark].replace(_COUNT_TOKEN, str(len(items))), _BODY.format(
        greeting=_greeting(first_name),
        missing_items="\n".join(items),
        frontend_url=settings.frontend_url,
        site_domain=SITE_DOMAIN,
    )


# ---------- public entry point ----------


def send_pending_nudges(db: Session) -> dict[str, int]:
    """Scheduler entry point. Find every producer that is due for a nudge,
    email it exactly what is missing, and stamp `email_pending_nudge_sent_at`.
    Returns {"sent": n, "stamped_nothing_missing": n}.

    MEH-2111 — the send is now a SEQUENCE for drafts (day 1 / 3 / 7) and stays
    a single day-1 send for every other nudgeable status. `_due_mark` owns that
    decision and the exactly-once-per-mark argument; read it first, because the
    rest of this function is unchanged mechanics.

    What did NOT change: the stamp is still the only send-tracking state, there
    is still no new column, and a `pending` / `pending_whatsapp` business still
    receives exactly one email ever. For those statuses `_due_mark` offers only
    mark 1, and a stamped row can never satisfy `sent < created + 1 day`, so
    the old "stamped means finished, permanently" property is preserved by
    construction rather than by a second condition.

    What DID change, and is worth stating because a test asserts the old shape
    for `pending`: a stamped-but-empty DRAFT is re-evaluated at the later
    marks. That is the intended reading of the sequence — this module's own
    MEH-2100 note already records that "waiting on Sapir" is false for a draft,
    since nobody but the owner can move it. She is not emailed while she has
    nothing missing; she is simply still in the candidate set.

    A producer with NOTHING missing is stamped WITHOUT being emailed. The empty
    check runs on the COPY list, not the gate's code list, and the difference is
    load-bearing: a producer missing only a code with no approved Hebrew
    (category / location) would otherwise be mailed a body whose items block is
    blank. Skipping is the correct read of "there is nothing we can tell her
    here" — though see `_ITEM_COPY` for why `location` landing in that bucket is
    a reported gap rather than a comfortable one.

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
    now = datetime.now(timezone.utc)
    cutoff = now - _NUDGE_AFTER

    # The SQL filter is deliberately COARSE and `_due_mark` is precise. Encoding
    # `sent_at < created_at + N days` in SQL would need dialect-specific
    # interval arithmetic for each of three marks; keeping the decision in one
    # readable Python function is worth re-scanning a bounded set of drafts.
    #
    # The cost is that a fully-nudged draft (past day 7) is re-fetched daily and
    # rejected. That is a comparison against two columns already on the row —
    # `_due_mark` runs BEFORE anything touches relations or queries for the
    # User, so a not-due producer costs no additional I/O. Stated rather than
    # hidden: on a directory of this size it is not measurable, and if the table
    # ever grows the fix is an index-friendly ceiling on `created_at`.
    candidates = (
        db.query(Producer)
        .filter(
            Producer.status.in_(_NUDGEABLE_STATUSES),
            Producer.created_at <= cutoff,
            or_(
                Producer.email_pending_nudge_sent_at.is_(None),
                Producer.status == "draft",
            ),
        )
        .all()
    )

    for p in candidates:
        try:
            mark = _due_mark(p, now)
            if mark is None:
                continue

            items = _missing_items(p)
            if not items:
                # Nothing to nudge about — stamp and move on, no email.
                p.email_pending_nudge_sent_at = datetime.now(timezone.utc)
                db.commit()
                counts["stamped_nothing_missing"] += 1
                logger.info(
                    "[PENDING-NUDGE] producer_id=%s day=%d nothing missing — "
                    "stamped, no email",
                    p.id,
                    mark,
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
            subject, body = _build_email(first_name, items, mark)
            send_email(user.email, subject, body)
            p.email_pending_nudge_sent_at = datetime.now(timezone.utc)
            db.commit()
            counts["sent"] += 1
            logger.info(
                "[PENDING-NUDGE] producer_id=%s day=%d sent items=%d",
                p.id,
                mark,
                len(items),
            )
        except Exception as e:  # noqa: BLE001 — fail-open per producer
            db.rollback()
            logger.warning("[PENDING-NUDGE] producer_id=%s failed: %s", p.id, e)
            continue

    return counts
