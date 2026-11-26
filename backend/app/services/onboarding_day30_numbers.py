"""
Module:   onboarding_day30_numbers
Purpose:  The numbers block of the day-30 onboarding email («חודש איתנו»):
          the business's last 30 days of page views, WhatsApp clicks, contact
          clicks and saves, so the email shows what happened instead of asking
          «קיבלתם הודעות ראשונות?» (MEH-3840).
Touches:  reads the analytics tables and favorites through
          services/producer_insights. Writes nothing.
Does NOT: send or schedule (services/onboarding_followup.py does); count
          anything itself — the cells are the dashboard's own `last_30d`
          (producer_insights.metric_count) and its followers count.
Related:  backend/app/services/weekly_owner_summary.py `_rows` (same labels) ·
          backend/app/services/freshness_month_numbers.py `rows` (same "hide a
          zero row" rule).
History:  MEH-3840 (creation).
"""

from __future__ import annotations

from datetime import timedelta
from typing import TypedDict
from uuid import UUID

from sqlalchemy.orm import Session

from app.services.producer_insights import metric_count, new_followers_since
from app.utils.clock import utc_now

WINDOW_DAYS = 30
INSIGHTS_PATH = "/producer/dashboard/insights"


class Day30Numbers(TypedDict):
    profile_views: int
    whatsapp_clicks: int
    contact_clicks: int
    new_followers: int


def day30_numbers(db: Session, producer_id: UUID) -> Day30Numbers:
    """The dashboard's last-30-days cells for one business."""
    now = utc_now()

    def count(metric: str) -> int:
        return metric_count(db, producer_id, metric, WINDOW_DAYS, now)

    return {
        "profile_views": count("profile_views"),
        "whatsapp_clicks": count("whatsapp_clicks"),
        "contact_clicks": count("contact_clicks"),
        "new_followers": new_followers_since(
            db, producer_id, now - timedelta(days=WINDOW_DAYS)
        ),
    }


def rows(n: Day30Numbers) -> list[tuple[str, int]]:
    """Label → number; a zero row is left out, so the email never says
    «צפיות בעמוד: 0» (card acceptance: 0 / 1 / many)."""
    # REUSES: backend/app/services/weekly_owner_summary.py:202 — the labels.
    candidates = [
        ("צפיות בעמוד", n["profile_views"]),
        ("קליקים בוואטסאפ", n["whatsapp_clicks"]),
        ("קליקים על טלפון, אתר ועוד", n["contact_clicks"]),
        ("שמירות במועדפים", n["new_followers"]),
    ]
    return [(label, value) for label, value in candidates if value > 0]


def block(name: str, n: Day30Numbers, frontend_url: str) -> str:
    """Plain-text block ending in a blank line; "" when every number is 0,
    and the email then reads as before without it."""
    shown = rows(n)
    if not shown:
        return ""
    clean = " ".join((name or "").split())
    heading = (
        f"כך נראו 30 הימים האחרונים של {clean} במהמקור:"
        if clean
        else "כך נראו 30 הימים האחרונים של העמוד שלכם במהמקור:"
    )
    lines = "\n".join(f"{label}: {value}" for label, value in shown)
    url = f"{frontend_url.rstrip('/')}{INSIGHTS_PATH}"
    return f"{heading}\n{lines}\nלכל הנתונים: {url}\n\n"
