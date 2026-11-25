"""
Module:   freshness_month_numbers
Purpose:  Last calendar month's numbers for the one monthly owner email on the
          1st (MEH-3194, Sapir 24/11: one monthly touch, value before any
          bill): bookings through the site and their value first, then page
          views and clicks. Also the subject line those numbers lead with.
Touches:  reads billable_events (billing_summary.summarize) and the analytics
          tables (producer_insights.metric_count_between). Writes nothing.
Does NOT: send or schedule anything (services/page_freshness.py does); count
          anything itself; mention a fee, a threshold or a price — this is
          value, never a bill.
Related:  backend/app/services/weekly_owner_summary.py `_rows` (same labels,
          same "hide a zero row" rule) · backend/app/utils/money.py
          `shekels_text` (the shared shekel format).
History:  MEH-3194 (creation).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TypedDict
from uuid import UUID

from sqlalchemy.orm import Session

from app.services.billing_summary import Month, summarize
from app.services.producer_insights import metric_count_between
from app.utils.clock import ISRAEL_TZ
from app.utils.money import shekels_text

# Copy approved by Sapir 24/11/2026 («מאשרת מה שתחליט», MEH-3194), after
# hebrew-content-writer + clarify. Neutral wording (BRAND.md §9).
HEBREW_MONTHS = (
    "ינואר",
    "פברואר",
    "מרץ",
    "אפריל",
    "מאי",
    "יוני",
    "יולי",
    "אוגוסט",
    "ספטמבר",
    "אוקטובר",
    "נובמבר",
    "דצמבר",
)


class MonthNumbers(TypedDict):
    bookings: int
    value_agorot: int
    profile_views: int
    whatsapp_clicks: int
    contact_clicks: int


def israel_month(now: datetime) -> Month:
    """The Israel calendar month that `now` (aware) falls in."""
    local = now.astimezone(ISRAEL_TZ)
    return Month(local.year, local.month)


def month_name(month: Month) -> str:
    return HEBREW_MONTHS[month.month - 1]


def month_numbers(db: Session, producer_id: UUID, month: Month) -> MonthNumbers:
    """One business, one Israel calendar month."""
    ledger = summarize(db, producer_id, month)
    # The analytics columns are naive UTC (producer_insights.WindowFilter).
    span = tuple(
        t.astimezone(timezone.utc).replace(tzinfo=None)
        for t in (month.start(), month.next().start())
    )
    start, end = span

    def count(metric: str) -> int:
        return metric_count_between(db, producer_id, metric, (start, end))

    return {
        "bookings": int(ledger["bookings"]),
        "value_agorot": int(ledger["value_agorot"]),
        "profile_views": count("profile_views"),
        "whatsapp_clicks": count("whatsapp_clicks"),
        "contact_clicks": count("contact_clicks"),
    }


def rows(n: MonthNumbers) -> list[tuple[str, str]]:
    """Label → shown value, bookings first. A zero row is left out, so the
    email never says «שווי 0 ₪» (card acceptance: 0 / 1 / many)."""
    candidates = [
        ("הזמנות דרך האתר", n["bookings"], str(n["bookings"])),
        ("שווי ההזמנות", n["value_agorot"], f"{shekels_text(n['value_agorot'])} ₪"),
        ("צפיות בעמוד", n["profile_views"], str(n["profile_views"])),
        ("קליקים בוואטסאפ", n["whatsapp_clicks"], str(n["whatsapp_clicks"])),
        ("קליקים על טלפון, אתר ועוד", n["contact_clicks"], str(n["contact_clicks"])),
    ]
    return [(label, shown) for label, raw, shown in candidates if raw > 0]


def subject(name: str, month: Month, n: MonthNumbers) -> str | None:
    """Bookings lead, then views. None when the month had neither: the caller
    keeps its own «הכול עדיין נכון?» subject."""
    head = f"{name} ב{month_name(month)}"
    if n["bookings"] == 1:
        return f"{head}: הזמנה אחת דרך מהמקור"
    if n["bookings"] > 1:
        return f"{head}: {n['bookings']} הזמנות דרך מהמקור"
    if n["profile_views"] == 1:
        return f"{head}: צפייה אחת בעמוד"
    if n["profile_views"] > 1:
        return f"{head}: {n['profile_views']} צפיות בעמוד"
    return None


def block(name: str, month: Month, n: MonthNumbers) -> str:
    """The plain-text block, ending in a blank line; "" when every number is 0."""
    shown = rows(n)
    if not shown:
        return ""
    heading = f"כך נראה {month_name(month)} בעמוד של {name} במהמקור:"
    lines = "\n".join(f"{label}: {value}" for label, value in shown)
    return f"{heading}\n{lines}\n\n"
