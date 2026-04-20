"""Scheduled jobs for automated maintenance tasks.

All jobs are designed fail-open: errors are logged but never crash the process.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import AdminSetting, Producer

logger = logging.getLogger("scheduler")


def _get_setting(db: Session, key: str, default: str) -> str:
    row = db.query(AdminSetting).filter(AdminSetting.key == key).first()
    return row.value if row and row.value else default


def _send_whatsapp(to: str, body: str) -> None:
    from app.config import settings

    if not (
        settings.twilio_account_sid
        and settings.twilio_auth_token
        and settings.twilio_whatsapp_from
        and to
    ):
        logger.info("[WHATSAPP] Would send to %s: %s", to, body)
        return

    try:
        from twilio.rest import Client

        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        client.messages.create(
            body=body,
            from_=f"whatsapp:{settings.twilio_whatsapp_from}",
            to=f"whatsapp:{to}",
        )
    except Exception as e:
        logger.error("[WHATSAPP] Failed to send to %s: %s", to, e)


def check_inactive_producers() -> int:
    """Mark producers as inactive if they haven't been active within the configured window.

    Returns the number of producers marked inactive.
    """
    logger.info("Running check_inactive_producers")
    db = SessionLocal()
    try:
        days = int(_get_setting(db, "auto_inactive_days", "180"))
        cutoff = datetime.utcnow() - timedelta(days=days)

        inactive = (
            db.query(Producer)
            .filter(
                Producer.status == "approved",
                Producer.last_active_at < cutoff,
            )
            .all()
        )

        if not inactive:
            logger.info("No inactive producers found (threshold: %d days)", days)
            return 0

        from app.config import settings as cfg

        count = 0
        for producer in inactive:
            producer.status = "inactive"
            count += 1
            _send_whatsapp(
                producer.phone or "",
                f"היי {producer.name}, הפרופיל שלך במהמקור סומן כלא פעיל. "
                f"כדי להחזיר אותו לרשימות — היכנסי לדשבורד.",
            )

        db.commit()

        _send_whatsapp(
            cfg.admin_whatsapp_to,
            f"סיכום יומי: {count} עסקים סומנו כלא פעילים",
        )
        logger.info("Marked %d producers as inactive", count)
        return count

    except Exception as e:
        logger.error("check_inactive_producers failed: %s", e)
        db.rollback()
        return 0
    finally:
        db.close()


def check_kashrut_expiry() -> int:
    """Alert producers whose kashrut cert expires within 30 days.

    Gracefully skips if the kashrut_expires_at column doesn't exist yet (MEH-51).
    Returns the number of alerts sent.
    """
    logger.info("Running check_kashrut_expiry")
    db = SessionLocal()
    try:
        # Check if column exists before querying
        result = db.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'producers' AND column_name = 'kashrut_expires_at'"
        ))
        if not result.fetchone():
            logger.info("kashrut_expires_at column not yet present (MEH-51), skipping")
            return 0

        now = datetime.utcnow()
        threshold = now + timedelta(days=30)

        rows = db.execute(text(
            "SELECT id, name, phone, kashrut_expires_at FROM producers "
            "WHERE status = 'approved' "
            "AND kashrut_expires_at IS NOT NULL "
            "AND kashrut_expires_at > :now "
            "AND kashrut_expires_at < :threshold"
        ), {"now": now, "threshold": threshold}).fetchall()

        if not rows:
            logger.info("No kashrut certs expiring within 30 days")
            return 0

        count = 0
        for row in rows:
            expiry_date = row.kashrut_expires_at.strftime("%d/%m/%Y")
            _send_whatsapp(
                row.phone or "",
                f"תעודת הכשרות שלך פגה בתאריך {expiry_date}. "
                f"חדשי אותה דרך הדשבורד.",
            )
            count += 1

        logger.info("Sent %d kashrut expiry alerts", count)
        return count

    except Exception as e:
        logger.error("check_kashrut_expiry failed: %s", e)
        return 0
    finally:
        db.close()
