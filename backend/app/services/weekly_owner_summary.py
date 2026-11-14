"""
Module:   weekly_owner_summary
Purpose:  Once a week, each live business owner gets a short email with the
          last 7 days of her page: views, WhatsApp clicks, other contact
          clicks and new saves to favorites, plus a link to the dashboard's
          «תובנות» screen (MEH-3079, like Google Business / Etsy weekly stats).
Touches:  reads producers + users; writes producers.weekly_summary_sent_at;
          sends through app.services.email.send_email (Resend, fail-open).
Does NOT: count anything itself — every number comes from
          services/producer_insights.py, the same functions the dashboard
          endpoint calls. Does not hold the scheduler (app/startup.py) and
          does not own the unsubscribe route (routers/marketing.py).
Related:  backend/app/startup.py `_register_weekly_owner_summary` ·
          backend/app/routers/marketing.py `unsubscribe_weekly_summary` ·
          frontend/app/[locale]/unsubscribe/weekly/page.js ·
          migration 0cfa83f0f53e (the two producers columns).
History:  MEH-3079 (creation).

Rules (all enforced in `send_weekly_summaries`):
  - never a zero email: a business whose deduped 7-day views are 0 is skipped
    (and NOT stamped, so it is looked at again next week);
  - live businesses only (`producer_listing.is_business()`: approved, a
    business not an organizer, not a seeded test row — MEH-2952);
  - an owner with a verified email only;
  - not opted out, and not already sent within the last 6 days;
  - each row is CLAIMED with one conditional UPDATE … RETURNING before its
    send, so two overlapping runs (a rolling deploy) cannot both send it; a
    failed send puts the previous stamp back so the next run retries it;
  - sends are spaced SEND_INTERVAL_SECONDS apart (Resend's per-second cap).
"""

from __future__ import annotations

import importlib
import logging
import time
from dataclasses import dataclass
from datetime import date, datetime
from datetime import time as dtime
from datetime import timedelta, timezone
from html import escape as html_escape
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from joserfc import jwt as jose_jwt
from joserfc.errors import JoseError
from joserfc.jwk import OctKey
from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Producer, User
from app.services.email import send_email
from app.services.email_branding import email_logo_html
from app.services.producer_insights import WeeklyNumbers, weekly_numbers

logger = logging.getLogger(__name__)

# A business stamped less than this long ago is skipped. Six days, not seven,
# so a run that fires a few hours late one week still sends the next week.
RESEND_AFTER = timedelta(days=6)

JOB_ID = "meh_3079_weekly_owner_summary"
CATCHUP_JOB_ID = "meh_3079_weekly_owner_summary_catchup"

# The weekly fire time, on the Israel clock (the CronTrigger in startup.py).
FIRE_TZ = ZoneInfo("Asia/Jerusalem")
FIRE_WEEKDAY = 6  # Sunday (Monday = 0)
FIRE_TIME = dtime(8, 0)
# How late a run may still go out: the cron's misfire grace, and the window in
# which a boot after the fire time adds a one-off catch-up run.
LATE_RUN_WINDOW = timedelta(hours=12)
CATCHUP_DELAY = timedelta(minutes=1)

# Pause between two sends. Resend rate-limits its API per team (documented
# default: 2 requests/second — not re-measured for this account), and every
# other email the app sends shares that budget; 0.5 s keeps this job at or
# under it. Tests set `_sleep` to a recorder instead of sleeping.
SEND_INTERVAL_SECONDS = 0.5
_sleep = time.sleep

INSIGHTS_PATH = "/producer/dashboard/insights"
UNSUBSCRIBE_PATH = "/unsubscribe/weekly"


def summary_enabled() -> bool:
    """The send gate. Default False: merging this sends nothing.

    Read through `getattr`, the same way `rescue_digest.digest_enabled` reads
    its flag: `config.py` is denied to Claude Code, so Sapir adds the field
    `weekly_owner_summary_enabled: bool = False` from the patch in the PR body,
    and until she does this reads False rather than raising.
    """
    return bool(getattr(settings, "weekly_owner_summary_enabled", False))


# ---------------------------------------------------------------------------
# Unsubscribe token — stateless, signed, its own scope.
# REUSES: backend/app/routers/marketing.py:57-87 — the MEH-1330 newsletter
# token (joserfc + SECRET_KEY, no exp so an old email still works). A separate
# scope so a newsletter token cannot opt a business out, and vice versa; the
# subject is the producer id, so the token only ever opts out its own business.
# ---------------------------------------------------------------------------
UNSUBSCRIBE_SCOPE = "weekly_summary_unsubscribe"


def _key() -> OctKey:
    return OctKey.import_key(settings.secret_key.encode())


def create_unsubscribe_token(producer_id: UUID) -> str:
    payload = {"sub": str(producer_id), "scope": UNSUBSCRIBE_SCOPE}
    token: str = jose_jwt.encode({"alg": settings.algorithm}, payload, _key())
    return token


def decode_unsubscribe_token(token: str) -> UUID | None:
    """The producer id of a valid token, else None. Never raises."""
    try:
        claims: Any = jose_jwt.decode(
            token, _key(), algorithms=[settings.algorithm]
        ).claims
    except (JoseError, ValueError):
        return None
    if claims.get("scope") != UNSUBSCRIBE_SCOPE:
        return None
    sub = claims.get("sub")
    if not isinstance(sub, str):
        return None
    try:
        return UUID(sub)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# The email. Copy: Hebrew, gender-neutral plural (ADR-037). Copy decisions
# were delegated for MEH-3079; the strings are listed in the PR body.
# ---------------------------------------------------------------------------


def subject_for(views: int) -> str:
    # Views are visitor-days (one visitor counts once per Israel day), not
    # people — so the copy says «צפיות», never «אנשים».
    if views == 1:
        return "השבוע הייתה צפייה אחת בעמוד שלכם"
    return f"השבוע היו {views} צפיות בעמוד שלכם"


@dataclass(frozen=True)
class SummaryEmail:
    business_name: str
    numbers: WeeklyNumbers
    insights_url: str
    unsubscribe_url: str


def _rows(n: WeeklyNumbers) -> list[tuple[str, int]]:
    """Label → number. Views always; the others only when not zero."""
    rows = [("צפיות בעמוד", n["profile_views"])]
    optional = [
        ("קליקים בוואטסאפ", n["whatsapp_clicks"]),
        ("קליקים על טלפון, אתר ועוד", n["contact_clicks"]),
        ("שמירות במועדפים", n["new_followers"]),
    ]
    rows += [(label, value) for label, value in optional if value > 0]
    return rows


def build_email(m: SummaryEmail) -> tuple[str, str, str]:
    """(subject, plain text, html)."""
    name = " ".join((m.business_name or "").split())
    subject = subject_for(m.numbers["profile_views"])
    intro = f"כך נראו 7 הימים האחרונים של {name} במהמקור:"
    rows = _rows(m.numbers)
    footer = "הסיכום הזה נשלח פעם בשבוע לבתי העסק במהמקור."
    stop = "להפסקת הסיכום השבועי"

    plain = (
        f"{subject}\n\n{intro}\n"
        + "\n".join(f"{label}: {value}" for label, value in rows)
        + f"\n\nלכל הנתונים: {m.insights_url}\n\n"
        f"{footer}\n{stop}: {m.unsubscribe_url}\n\nצוות מהמקור"
    )

    e = html_escape
    rows_html = "".join(
        '<tr><td style="padding:6px 0;border-bottom:1px solid #efeae0;'
        f'text-align:right;">{e(label)}</td>'
        '<td style="padding:6px 0;border-bottom:1px solid #efeae0;'
        f'text-align:left;font-weight:bold;">{value}</td></tr>'
        for label, value in rows
    )
    # REUSES: backend/app/services/registration_emails.py:37 — the card shell
    # (logo, green heading band, outline button), plus an unsubscribe footer.
    html = f"""\
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F0E8;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F5F0E8;padding:24px 12px;direction:rtl;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;margin:0 auto;">
      <tr><td style="text-align:right;padding:0 4px 14px;">{email_logo_html()}</td></tr>
      <tr><td style="background:#ffffff;border-radius:14px;border:1px solid #e5dfd3;overflow:hidden;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="background:#2e6853;color:#ffffff;padding:18px 22px;text-align:right;font-size:19px;font-weight:bold;line-height:1.4;">{e(subject)}</td></tr>
          <tr><td style="padding:18px 22px 6px;text-align:right;font-size:15px;color:#1c1a17;line-height:1.8;">
            {e(intro)}
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:8px;font-size:15px;color:#1c1a17;">{rows_html}</table>
          </td></tr>
          <tr><td style="padding:16px 22px 24px;text-align:center;"><a href="{e(m.insights_url)}" style="display:inline-block;background:#ffffff;color:#2e6853;border:2px solid #2e6853;text-decoration:none;font-size:15px;font-weight:bold;padding:11px 28px;border-radius:10px;">לכל הנתונים</a></td></tr>
        </table>
      </td></tr>
      <tr><td style="text-align:center;padding:14px 4px 0;font-size:12px;color:#8a8478;line-height:1.6;">
        {e(footer)}<br>
        <a href="{e(m.unsubscribe_url)}" style="color:#8a8478;text-decoration:underline;">{e(stop)}</a><br>
        צוות מהמקור
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""
    return subject, plain, html


# ---------------------------------------------------------------------------
# The job.
# ---------------------------------------------------------------------------


def _owner(db: Session, producer_id: UUID) -> Any:
    """The business's earliest account with a verified email (or None).

    ORM rows are typed Any here: models.py is untyped, so its Column
    attributes would read as Column[...] instead of their values.
    """
    owner: Any = (
        db.query(User)
        .filter(
            User.producer_id == producer_id,
            User.email.isnot(None),
            User.email_verified.is_(True),
            User.is_blocked.isnot(True),
        )
        .order_by(User.created_at.asc())
        .first()
    )
    return owner


def _is_business() -> Any:
    """`producer_listing.is_business()` — THE live-business rule (ADR-036,
    MEH-2952: approved, kind=producer, not a test row).

    Loaded by name, not imported, so mypy --strict over this module does not
    pull producer_listing's untyped import tree (routers/rescue, schemas, …)
    into the backend-mypy ratchet. It is still the one rule, not a copy.
    """
    return importlib.import_module("app.services.producer_listing").is_business()


def last_scheduled_fire(now: datetime) -> datetime:
    """The most recent Sunday 08:00 Israel time at or before `now` (aware).

    Built from the Israel calendar date with the zone attached, so a DST
    switch between `now` and that Sunday cannot move it off 08:00.
    """
    local = now.astimezone(FIRE_TZ)
    back = (local.weekday() - FIRE_WEEKDAY) % 7
    day: date = local.date() - timedelta(days=back)
    fire = datetime.combine(day, FIRE_TIME, tzinfo=FIRE_TZ)
    if fire > local:
        fire = datetime.combine(day - timedelta(days=7), FIRE_TIME, tzinfo=FIRE_TZ)
    return fire


def catchup_due(now: datetime) -> bool:
    """True when the last fire time passed less than LATE_RUN_WINDOW ago.

    The scheduler is in-memory: a process that boots at 08:05 Sunday never
    saw the 08:00 fire, and its CronTrigger's next fire is NEXT Sunday — the
    misfire grace only covers a fire the running process itself missed. A
    one-off run soon after boot covers that week; the 6-day stamp and the
    per-row claim make a duplicate run send nothing twice.
    """
    return now - last_scheduled_fire(now) < LATE_RUN_WINDOW


def _candidates(db: Session, now: datetime) -> list[Any]:
    cutoff = now - RESEND_AFTER
    rows: list[Any] = (
        db.query(Producer)
        .filter(
            _is_business(),
            Producer.weekly_summary_opt_out.is_(False),
            or_(
                Producer.weekly_summary_sent_at.is_(None),
                Producer.weekly_summary_sent_at < cutoff,
            ),
        )
        .order_by(Producer.id)
        .all()
    )
    return rows


def _claim(db: Session, producer_id: Any, now: datetime) -> bool:
    """Atomically stamp the row for THIS run; True only for the winner.

    The WHERE re-checks opt-out and the 6-day window inside the UPDATE, so a
    second run that selected the same candidate before the first committed
    gets zero rows back (Postgres re-evaluates the WHERE on the row the first
    run updated). Committed at once so the other run can see it.
    """
    cutoff = now - RESEND_AFTER
    stmt = (
        update(Producer)
        .where(
            Producer.id == producer_id,
            Producer.weekly_summary_opt_out.is_(False),
            or_(
                Producer.weekly_summary_sent_at.is_(None),
                Producer.weekly_summary_sent_at < cutoff,
            ),
        )
        .values(weekly_summary_sent_at=now)
        .returning(Producer.id)
        .execution_options(synchronize_session=False)
    )
    won = db.execute(stmt).first() is not None
    db.commit()
    return won


def _unclaim(db: Session, producer_id: Any, now: datetime, previous: Any) -> None:
    """Put the previous stamp back — only if it is still this run's claim."""
    db.execute(
        update(Producer)
        .where(
            Producer.id == producer_id,
            Producer.weekly_summary_sent_at == now,
        )
        .values(weekly_summary_sent_at=previous)
        .execution_options(synchronize_session=False)
    )
    db.commit()


def send_weekly_summaries(db: Session, now: datetime | None = None) -> dict[str, int]:
    """Send this week's summaries. Fail-isolated per business; never raises
    for one business's failure. Returns counters for the job log.

    `now` is aware; it is the stamp, and (as naive UTC) the clock every
    7-day number is counted back from.
    """
    now = now or datetime.now(timezone.utc)
    count_now = now.astimezone(timezone.utc).replace(tzinfo=None)
    counters = {
        "scanned": 0,
        "sent": 0,
        "zero_views": 0,
        "no_owner": 0,
        "already_claimed": 0,
        "failed": 0,
    }
    base = settings.frontend_url.rstrip("/")
    first_send = True
    for producer in _candidates(db, now):
        # Read every attribute up front: after a commit or a rollback the ORM
        # row is expired, and the except block below must not reload it.
        pid = producer.id
        name = producer.name or ""
        producer_is_test = bool(producer.is_test)
        previous = producer.weekly_summary_sent_at
        counters["scanned"] += 1
        claimed = False
        try:
            owner = _owner(db, pid)
            if owner is None:
                counters["no_owner"] += 1
                continue
            owner_email = owner.email
            owner_is_test = bool(owner.is_test)
            numbers = weekly_numbers(db, pid, now=count_now)
            if numbers["profile_views"] <= 0:
                counters["zero_views"] += 1
                continue
            if not _claim(db, pid, now):
                counters["already_claimed"] += 1
                continue
            claimed = True
            token = create_unsubscribe_token(pid)
            subject, plain, html = build_email(
                SummaryEmail(
                    business_name=name,
                    numbers=numbers,
                    insights_url=f"{base}{INSIGHTS_PATH}",
                    unsubscribe_url=f"{base}{UNSUBSCRIBE_PATH}?token={token}",
                )
            )
            if not first_send:
                _sleep(SEND_INTERVAL_SECONDS)
            first_send = False
            # send_email is fail-open and returns None on every path (its
            # MEH-1613 contract, pinned by tests) — so the claim stands for
            # "handed to the sender", like the MEH-539 email_followup_*_sent_at
            # columns. Only an exception here undoes it.
            send_email(
                owner_email,
                subject,
                plain,
                html=html,
                test_cause=producer_is_test or owner_is_test,
            )
            counters["sent"] += 1
        except Exception:  # noqa: BLE001 — one business never stops the run
            db.rollback()
            counters["failed"] += 1
            logger.warning("[WEEKLY-SUMMARY] producer_id=%s failed", pid, exc_info=True)
            if claimed:
                try:
                    _unclaim(db, pid, now, previous)
                except Exception:  # noqa: BLE001
                    db.rollback()
                    logger.warning(
                        "[WEEKLY-SUMMARY] producer_id=%s claim not undone",
                        pid,
                        exc_info=True,
                    )
    return counters
