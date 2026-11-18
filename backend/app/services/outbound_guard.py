"""
Module:   outbound_guard
Purpose:  Outside production, no message reaches a real person. Every channel
          that can reach a person asks this module first, so the protection
          comes from the environment and not from anyone remembering to mark
          a row `is_test`.
Touches:  nothing (pure decisions over `settings`).
Does NOT: send anything — the senders are email.py, whatsapp.py, push.py and
          newsletter_sync.py. Does NOT replace `is_test` (MEH-2952): that drop
          applies in production too; this one applies everywhere except
          production.
Related:  config.py `get_settings` (the same production test, MEH-2890/3388);
          docs/DEPLOYMENT.md (RAILWAY_ENVIRONMENT=production on prod).
History:  MEH-3402 (creation — staging business built from real data, owner's
          real email, no is_test, could receive staging mail).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from app.config import settings

logger = logging.getLogger(__name__)

# MEH-3402: prefix of the subject of a redirected email, so the inbox shows at
# a glance which mail came from staging and who it was really for.
REDIRECT_SUBJECT_PREFIX = "[STAGING → {to}] "


def is_production() -> bool:
    """True only in production: `ENV=production` or Railway's own
    `RAILWAY_ENVIRONMENT=production` (Railway sets it; it cannot be forgotten).

    Every other value — staging, a PR environment, local dev, CI, an unset
    variable — is guarded. FAIL-CLOSED on purpose: a misnamed environment
    redirects mail, it never mails real people.
    # DO NOT invert this into "is_staging()" — a new environment name would
    # then be unguarded (MEH-3402).
    """
    return (
        settings.env.strip().lower() == "production"
        or settings.railway_environment.strip().lower() == "production"
    )


def _norm_email(address: str) -> str:
    return address.strip().strip("\"'").strip().lower()


def _base_email(address: str) -> str:
    """`you+biz1@gmail.com` → `you@gmail.com` (plus-addressing)."""
    local, _, domain = _norm_email(address).rpartition("@")
    return f"{local.split('+', 1)[0]}@{domain}" if local else _norm_email(address)


def _allowed_emails() -> frozenset[str]:
    configured = (
        settings.admin_email,
        settings.contact_email,
        settings.super_admin_email,
    )
    return frozenset(_norm_email(a) for a in configured if a and "@" in a)


def email_allowed_outside_production(to: str) -> bool:
    """A staff address from settings, or a plus-alias of one."""
    allowed = _allowed_emails()
    return _norm_email(to) in allowed or _base_email(to) in allowed


@dataclass(frozen=True)
class EmailRoute:
    """Where an email goes. `to` empty = not sent."""

    to: str
    subject: str
    reply_to: str | None
    redirected: bool


def route_email(to: str, subject: str, reply_to: str | None) -> EmailRoute:
    """Production: unchanged. Elsewhere: an allowed recipient unchanged; any
    other recipient redirected to ADMIN_EMAIL, with the original recipient in
    the subject and `reply_to` dropped (a reply from the staff inbox must not
    reach the real person either). No ADMIN_EMAIL → not sent."""
    if is_production() or email_allowed_outside_production(to):
        return EmailRoute(to=to, subject=subject, reply_to=reply_to, redirected=False)
    target = settings.admin_email.strip()
    if not target or "@" not in target:
        return EmailRoute(to="", subject=subject, reply_to=None, redirected=True)
    return EmailRoute(
        to=target,
        subject=REDIRECT_SUBJECT_PREFIX.format(to=to) + subject,
        reply_to=None,
        redirected=True,
    )


def _digits(phone: str) -> str:
    """Comparable form of a phone: digits only, Israeli `0…` as `972…`."""
    d = re.sub(r"\D", "", phone or "")
    if d.startswith("0"):
        d = "972" + d[1:]
    return d


def phone_allowed(to: str) -> bool:
    """Production: always. Elsewhere: only ADMIN_WHATSAPP_TO and the
    OTP_TEST_NUMBERS harness numbers."""
    if is_production():
        return True
    configured = [settings.admin_whatsapp_to, *settings.otp_test_numbers.split(",")]
    allowed = {_digits(p) for p in configured if _digits(p)}
    return _digits(to) in allowed


def push_allowed() -> bool:
    """Push only from production. A push subscription identifies a browser,
    not a staff member, and a restored production backup carries real ones."""
    return is_production()


def newsletter_sync_allowed() -> bool:
    """Resend Contacts is the list real Broadcasts are sent from. Outside
    production nothing is added to it or removed from it."""
    return is_production()
